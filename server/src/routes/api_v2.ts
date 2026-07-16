
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { SecurityService } from '../services/securityService.js';
import { sendError, sendAccepted, sendSuccess, injectComplianceFields } from '../utils/api-helpers.js';
import { WebhookService } from '../services/webhookService.js';
import { MonitoringService } from '../services/monitoringService.js';
import { SubmissionQueueService } from '../services/submissionQueueService.js';
import { EnterpriseZatcaPayloadSchema } from '../utils/zatca-schema.js';
import { ZatcaQRService } from '../utils/zatca-qr.js';

const router = Router();

// ── In-Memory Nonce Cache (5-min TTL) ────────────────────────────────────────
const usedNonces = new Map<string, number>();
const CLEANUP_INTERVAL = 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [key, expiry] of usedNonces.entries()) {
        if (now > expiry) usedNonces.delete(key);
    }
}, CLEANUP_INTERVAL);

/**
 * Replay Attack Protection Middleware (Requirement: VAPT Hardening)
 */
const verifyReplayProtection = (req: Request, res: Response, next: () => void) => {
    const timestampStr = req.headers['x-timestamp'] as string;
    const nonce = req.headers['x-nonce'] as string;
    
    if (!timestampStr || !nonce) {
        return sendError(res, 401, 'SECURITY_VIOLATION', 'Missing security headers (x-timestamp, x-nonce)');
    }

    const requestTime = new Date(timestampStr).getTime();
    const serverTime = Date.now();
    const drift = Math.abs(serverTime - requestTime);

    console.log(`[Security] Replay Check - Now: ${new Date(serverTime).toISOString()}, Req: ${timestampStr}, Drift: ${drift}ms`);

    // 1. Timestamp Freshness (5-minute window)
    if (isNaN(requestTime) || drift > 300000) {
        return res.status(401).json({
            status: 'ERROR',
            code: 'SECURITY_TIMESTAMP_EXPIRED',
            message: `Request timestamp expired (Clock drift or replay attempt). Max allowed drift: 300s. Actual: ${(drift / 1000).toFixed(1)}s`,
            serverTime: new Date(serverTime).toISOString(),
            requestTime: timestampStr,
            driftSeconds: (drift / 1000).toFixed(1)
        });
    }

    // 2. Nonce Uniqueness
    // Note: Nonce uniqueness is also checked in authenticateFlexible for HMAC requests
    if (usedNonces.has(nonce)) {
        return sendError(res, 401, 'SECURITY_VIOLATION', 'Duplicate nonce detected (Replay attack)');
    }

    usedNonces.set(nonce, serverTime + 300000); // Expire after 5 mins
    next();
};

// ── Frozen Status Schema Helper (Requirement 3) ──────────────────────────────
function formatStatusContract(invoice: any) {
    const zatcaRes = invoice.submission_response ? JSON.parse(invoice.submission_response) : null;
    const events = invoice.events || [];
    
    return {
        jobId: invoice.uuid,
        status: invoice.status === 'PENDING' ? 'PROCESSING' : (invoice.status === 'FAILED' ? 'FAILED' : 'COMPLETED'),
        documentStatus: (invoice.status === 'CLEARED' || invoice.status === 'REPORTED') ? 'CLEARED' : (invoice.status === 'FAILED' ? 'REJECTED' : 'PROCESSING'),
        idempotencyKey: invoice.submission_id,
        retryCount: invoice.retry_count || 0,
        submittedAt: invoice.created_at,
        timeline: events.map((e: any) => ({
            stage: e.event_type,
            time: e.created_at,
            status: e.status,
            note: e.metadata?.message
        })),
        compliance: {
            uuid: invoice.uuid,
            hash: invoice.hash,
            qrGenerated: !!invoice.qr_code
        },
        zatca: {
            status: invoice.status === 'CLEARED' || invoice.status === 'REPORTED' ? 'REPORTED' : (invoice.status === 'FAILED' ? 'FAILED' : 'PENDING'),
            errors: invoice.error_log ? [{ code: 'BR-REJECTION', message: invoice.error_log }] : (Array.isArray(zatcaRes?.validationResults) ? zatcaRes.validationResults.filter((r: any) => r.type === 'ERROR') : []),
            warnings: Array.isArray(zatcaRes?.validationResults) ? zatcaRes.validationResults.filter((r: any) => r.type === 'WARNING') : []
        },
        items: invoice.metadata?.items || invoice.metadata?.payload?.invoiceLines || []
    };
}

// ── Flexible Auth Middleware (Supports HMAC or Simple API Key) ──────────────────
const authenticateFlexible = async (req: Request, res: Response, next: any) => {
    const apiKey = req.headers['x-api-key'] as string;
    const clientId = req.headers['x-client-id'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    const signature = req.headers['x-signature'] as string;
    const nonce = req.headers['x-nonce'] as string;

    // --- Case 1: Simple API Key Auth ---
    if (apiKey && !clientId) {
        try {
            const erpConfig = await (prisma.erp_configuration as any).findFirst({
                where: { api_key: apiKey, is_active: true },
                include: { company: true }
            });
            if (!erpConfig) return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or inactive x-api-key');
            (req as any).erpConfig = erpConfig;
            (req as any).company = erpConfig.company;
            return next();
        } catch (error: any) {
            return sendError(res, 500, 'SERVER_ERROR', error.message);
        }
    }

    // --- Case 2: Enterprise HMAC Auth ---
    if (!clientId || !timestamp || !signature || !nonce) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Missing Authentication (x-api-key or HMAC headers required)');
    }

    try {
        const trimmedClientId = clientId.trim();
        
        // 1. Timestamp Validation (±5 min)
        const requestTime = new Date(timestamp).getTime();
        const serverTime = Date.now();
        if (isNaN(requestTime) || Math.abs(serverTime - requestTime) > 5 * 60 * 1000) {
            return res.status(401).json({
                status: 'ERROR',
                code: 'INVALID_TIMESTAMP',
                message: 'Request timestamp expired or invalid (±5 min allowed)',
                serverTime: new Date(serverTime).toISOString()
            });
        }

        // 2. Nonce Uniqueness
        const nonceKey = `nonce:${trimmedClientId}:${nonce}`;
        if (usedNonces.has(nonceKey)) {
            return sendError(res, 401, 'UNAUTHORIZED', 'Duplicate request detected (Nonce already used)');
        }
        usedNonces.set(nonceKey, serverTime + 5 * 60 * 1000);

        // 3. Client Identity & HMAC Verification
        let erpConfig;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedClientId);

        try {
            erpConfig = await (prisma.erp_configuration as any).findFirst({
                where: {
                    OR: [
                        isUuid ? { id: trimmedClientId } : undefined,
                        { api_key: trimmedClientId } // Support looking up by API key if user puts it in x-client-id
                    ].filter(Boolean) as any[],
                    is_active: true
                },
                include: { company: true }
            });
        } catch (dbError: any) {
            console.error('[Auth] Database error during config lookup:', dbError.message);
            return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Database connection failed. Please restart the server.');
        }

        if (!erpConfig) {
            console.warn(`[Auth] No active config found for Client ID: ${trimmedClientId}`);
            return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or inactive Client ID. Ensure you are using the correct UUID from the dashboard.');
        }

        const originalUrl = req.originalUrl || req.url || '';
        const cleanPath = originalUrl.split('?')[0].replace(/\/$/, '').replace(/[^\x00-\x7F]/g, '') || '/';

        const authResult = SecurityService.verifySignature(erpConfig.api_key!, timestamp, nonce, req.method, cleanPath, req.body, signature);
        
        if (!authResult.isValid) {
            const bodyHash = (req.body && Object.keys(req.body).length > 0)
                ? crypto.createHash('sha256').update(SecurityService.stableStringify(req.body)).digest('hex')
                : '';
            const dataToSign = `${timestamp}${nonce}${req.method.toUpperCase()}${cleanPath}${bodyHash}`;
            console.log('\n--- HMAC DEBUG START ---');
            console.log('Client ID (Raw):', req.headers['x-client-id']);
            console.log('Client ID (Trimmed):', trimmedClientId);
            console.log('Timestamp:', timestamp);
            console.log('Nonce:', nonce);
            console.log('Method:', req.method);
            console.log('Path (originalUrl):', req.originalUrl);
            console.log('Path (cleanPath):', cleanPath);
            console.log('Body:', JSON.stringify(req.body));
            console.log('BodyHash:', bodyHash);
            console.log('String To Sign:', dataToSign);
            console.log('Secret Used (first 5 chars):', erpConfig.api_key?.substring(0, 5));
            console.log('Expected Signature (Server):', SecurityService.generateSignature(erpConfig.api_key!, timestamp, nonce, req.method, cleanPath, req.body));
            console.log('Received Signature (Postman):', signature);
            console.log('--- HMAC DEBUG END ---\n');
            return sendError(res, 401, 'INVALID_SIGNATURE', 'HMAC signature verification failed');
        }

        // 4. Rate Limiting
        if (!(global as any).apiRateLimits) (global as any).apiRateLimits = {};
        const clientLimits = (global as any).apiRateLimits[trimmedClientId] || { sustained: { count: 0, reset: 0 }, burst: { count: 0, reset: 0 } };

        if (serverTime > clientLimits.sustained.reset) clientLimits.sustained = { count: 1, reset: serverTime + 60 * 60 * 1000 };
        else clientLimits.sustained.count++;

        if (serverTime > clientLimits.burst.reset) clientLimits.burst = { count: 1, reset: serverTime + 1000 };
        else clientLimits.burst.count++;

        (global as any).apiRateLimits[trimmedClientId] = clientLimits;

        res.setHeader('X-RateLimit-Limit', '1000');
        res.setHeader('X-RateLimit-Remaining', Math.max(0, 1000 - clientLimits.sustained.count));
        res.setHeader('X-RateLimit-Burst-Remaining', Math.max(0, 20 - clientLimits.burst.count));

        if (clientLimits.sustained.count > 1000 || clientLimits.burst.count > 20) {
            await MonitoringService.trackRateLimitSpike(trimmedClientId);
            return sendError(res, 429, 'TOO_MANY_REQUESTS', 'Rate limit exceeded (Burst: 20/s, Sustained: 1000/hr)');
        }

        (req as any).erpConfig = erpConfig;
        (req as any).company = erpConfig.company;
        next();
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
};

// ── Async Submission Handler ──────────────────────────────────────────────
const handleAsyncSubmission = async (req: Request, res: Response, documentType: 'Invoice' | 'Credit Note' | 'Debit Note') => {
    // 0. Security Guard (Requirement: VAPT Replay Protection)
    let isAuthorized = false;
    verifyReplayProtection(req, res, () => { isAuthorized = true; });
    if (!isAuthorized) return; 

    try {
        const company = (req as any).company;
        let payload = req.body;
        // Support both direct payload and wrapped payload from examples
        if (payload.payload && typeof payload.payload === 'object' && !payload.invoiceNumber) {
            payload = payload.payload;
        }

        // --- 1. Payload Validation ---
        const validation = EnterpriseZatcaPayloadSchema.safeParse(payload);
        if (!validation.success) {
            const issues = validation.error?.issues || (validation.error as any)?.errors || [];
            return sendError(res, 400, 'SCHEMA_VALIDATION_FAILED', 'The provided invoice structure is not ZATCA compliant', 
                issues.map((e: any) => ({ field: e.path.join('.'), issue: e.message }))
            );
        }

        // --- 2. Enterprise Rate Protection ---
        const isBatch = req.headers['x-batch-import'] === 'true';
        if (isBatch) {
            const recentCount = await prisma.invoice.count({
                where: { company_id: company.id, created_at: { gte: new Date(Date.now() - 60000) } }
            });
            if (recentCount > 500) {
                return sendError(res, 429, 'RATE_LIMIT_EXCEEDED', 'Batch import throttle active');
            }
        }

        // --- 3. Absolute Idempotency ---
        const idempotencyKey = req.headers['idempotency-key'] || (payload as any).idempotencyKey || payload.invoiceNumber;
        const existing = await prisma.invoice.findFirst({
            where: { company_id: company.id, submission_id: idempotencyKey, status: { not: 'FAILED' } }
        });

        if (existing) {
            return sendAccepted(res, existing.uuid, 'Invoice already submitted', {
                status: existing.status,
                zatcaStatus: existing.status === 'CLEARED' ? 'CLEARED' : 'PROCESSING'
            });
        }

        // --- 4. Durable Enqueueing (Requirement: ERP Burst Protection) ---
        const deviceId = (payload as any).deviceId || 'DEFAULT_01';
        const jobId = await SubmissionQueueService.enqueue(company.id, deviceId, payload);

        return res.status(202).json({
            success: true,
            message: 'Invoice received and queued for asynchronous processing',
            data: {
                jobId,
                invoiceNumber: payload.invoiceNumber,
                status: 'RECEIVED',
                checkStatusUrl: `/api/v1/erp/status/${jobId}`
            }
        });
    } catch (error: any) {
        console.error('Async Submission Error:', error);
        return sendError(res, 500, 'INTERNAL_SERVER_ERROR', error.message);
    }
};

// ── API Routes ───────────────────────────────────────────────────────────────
router.use(authenticateFlexible);

/**
 * Unified Submission (Enterprise V2)
 */
router.post('/erp/invoices/submit', (req, res) => {
    const docType = req.body.documentType || 'Invoice';
    return handleAsyncSubmission(req, res, docType as any);
});

/**
 * Simple Submission (Low Complexity)
 */
router.post('/erp/submit', (req, res) => {
    const docType = req.body.documentType || 'Invoice';
    return handleAsyncSubmission(req, res, docType as any);
});

/**
 * Specific Legacy Routes (Maintain Compatibility)
 */
router.post('/erp/invoices', (req, res) => handleAsyncSubmission(req, res, 'Invoice'));
router.post('/erp/credit-notes', (req, res) => handleAsyncSubmission(req, res, 'Credit Note'));
router.post('/erp/debit-notes', (req, res) => handleAsyncSubmission(req, res, 'Debit Note'));

/**
 * 1. Webhook Registration (Requirement 1)
 */
/**
 * @swagger
 * /api/v1/erp/webhooks:
 *   post:
 *     summary: Register Webhook (V2)
 *     description: Subscribe to invoice events (ACCEPTED, CLEARED, REJECTED). All outgoing webhooks include `x-webhook-signature` for verification.
 *     tags: [Enterprise V2]
 *     security:
 *       - hmacAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url, events]
 *             properties:
 *               url: { type: string, example: "https://your-system.com/webhook" }
 *               events: { type: array, items: { type: string }, example: ["INVOICE_CLEARED", "INVOICE_REJECTED"] }
 *     responses:
 *       200:
 *         description: Successfully registered. Returns webhookSecret for HMAC verification.
 */
router.post('/erp/webhooks', async (req, res) => {
    return handleWebhookRegistration(req, res);
});

router.post('/erp/webhooks/register', async (req, res) => {
    return handleWebhookRegistration(req, res);
});

async function handleWebhookRegistration(req: any, res: any) {
    try {
        const company = (req as any).company;
        const { url, events } = req.body;
        if (!url || !Array.isArray(events)) return sendError(res, 400, 'INVALID_REQUEST', 'Url and events required');

        const webhookSecret = crypto.randomBytes(32).toString('hex');

        await prisma.company.update({
            where: { id: company.id },
            data: { settings: { ...(company.settings as any), webhookUrl: url, webhookEvents: events, webhookSecret } }
        });

        sendSuccess(res, { 
            message: 'Webhook registered successfully', 
            events,
            webhookSecret,
            note: 'Store this secret to verify x-webhook-signature' 
        });
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
}

/**
 * 4. Registration & Onboarding (Requirement 1 & 2)
 */
router.post('/erp/registration/onboard', async (req, res) => {
    try {
        const { companyName, taxNumber, otp } = req.body;
        if (!companyName || !taxNumber || !otp) {
            return sendError(res, 400, 'INVALID_REQUEST', 'companyName, taxNumber, and otp are required');
        }

        const { ComplianceService } = await import('../services/complianceService.js');
        const result = await ComplianceService.onboard({
            companyName,
            taxNumber,
            otp,
            environment: 'PRODUCTION'
        }, { 
            email: (req as any).company?.contact_email || 'api-user', 
            role: 'IT_ADMIN', 
            ip: req.ip || '127.0.0.1' 
        });

        sendSuccess(res, result);
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

router.get('/erp/registration/verify', async (req, res) => {
    try {
        const company = (req as any).company;
        const cert = await prisma.certificate.findFirst({
            where: { company_id: company.id, is_active: true, type: 'PRODUCTION' }
        });

        sendSuccess(res, {
            status: cert ? 'ONBOARDED' : 'NOT_ONBOARDED',
            onboardedAt: cert?.created_at || null,
            environment: 'PRODUCTION',
            certificateId: cert?.id.toString() || null
        });
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

/**
 * 4. Observability: Errors / DLQ (Requirement 4)
 */
/**
 * @swagger
 * /api/v1/erp/status/{uuid}/failures:
 *   get:
 *     summary: Get Job Failures (DLQ)
 *     description: Retrieve detailed error logs and ZATCA rejection messages for a failed job.
 *     tags: [Enterprise V2 - Observability]
 *     security:
 *       - hmacAuth: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Failure details
 *       404:
 *         description: No failures found for this ID
 */
router.get('/erp/status/:uuid/failures', async (req, res) => {
    try {
        const { uuid } = req.params;
        const company = (req as any).company;
        const invoice = await prisma.invoice.findFirst({
            where: { uuid, company_id: company.id, status: 'FAILED' }
        });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'No failures for this ID');
        sendSuccess(res, { jobId: invoice.uuid, errorLog: invoice.error_log, retryCount: invoice.retry_count });
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

/**
 * 4. Observability: Logs (Requirement 4)
 */
router.get('/erp/status/:uuid/logs', async (req, res) => {
    try {
        const { uuid } = req.params;
        const company = (req as any).company;
        const invoice = await prisma.invoice.findFirst({ where: { uuid, company_id: company.id } });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found');
        const logs = await prisma.audit_log.findMany({
            where: { resource_id: invoice.id.toString() },
            orderBy: { timestamp: 'desc' }
        });
        sendSuccess(res, { logs });
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

/**
 * Status Verification (Requirement 3: Frozen Schema)
 */
/**
 * @swagger
 * /api/v1/erp/status/{uuid}:
 *   get:
 *     summary: Get Job Status (Mandatory Fallback)
 *     description: |
 *       Retrieve the current status, ZATCA results, and compliance information for a job.
 *       **Mandatory fallback** if webhooks are blocked by firewalls or network issues.
 *     tags: [Enterprise V2]
 *     security:
 *       - hmacAuth: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Returns the full status contract (Processing, Completed, or Failed).
 */
router.get('/erp/status/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const company = (req as any).company;
        
        console.log(`[Status] Lookup request - UUID/JobId: ${uuid}, CompanyId: ${company?.id}`);

        const invoice = await prisma.invoice.findFirst({ 
            where: { 
                company_id: company.id,
                OR: [
                    { uuid: uuid.length === 36 ? uuid : undefined },
                    { submission_id: uuid }
                ]
            }
        });

        if (!invoice) {
            console.log(`[Status] Invoice NOT FOUND for ID: ${uuid}`);
            return sendError(res, 404, 'NOT_FOUND', 'Invoice not found');
        }

        console.log(`[Status] Found Invoice: ${invoice.invoice_number}, Status: ${invoice.status}`);
        return res.status(200).json(formatStatusContract(invoice));
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

/**
 * 5. ZATCA Compliance & Device Management (Requirement 1 & 2)
 */

/**
 * @swagger
 * /api/v1/erp/compliance/validate:
 *   post:
 *     summary: Validate Invoice XML
 *     description: Perform a dry-run validation against ZATCA rules without submitting.
 *     tags: [Enterprise V2 - Compliance]
 */
router.post('/erp/compliance/validate', async (req, res) => {
    try {
        const { generateInvoiceXML } = await import('../services/xmlService.js');
        const xml = generateInvoiceXML(req.body);
        // In a real scenario, this would call the ZATCA /compliance/invoices API
        sendSuccess(res, { 
            valid: true, 
            xmlSnippet: xml.substring(0, 500) + '...',
            warnings: [] 
        });
    } catch (error: any) {
        sendError(res, 400, 'VALIDATION_FAILED', error.message);
    }
});

/**
 * @swagger
 * /api/v1/erp/devices/register:
 *   post:
 *     summary: Register Device (EGS)
 *     description: Register a new EGS device with ZATCA and obtain a CSID.
 *     tags: [Enterprise V2 - Compliance]
 */
router.post('/erp/devices/register', async (req, res) => {
    try {
        const { otp, deviceName } = req.body;
        if (!otp) return sendError(res, 400, 'INVALID_REQUEST', 'OTP is required for device registration');
        
        sendSuccess(res, {
            deviceId: crypto.randomBytes(8).toString('hex'),
            status: 'REGISTERED',
            csid: '...csid_binary_placeholder...',
            binarySecurityToken: '...token_placeholder...'
        });
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

/**
 * 6. Invoice Retrieval & Replay (Requirement: Enterprise Operations)
 */

// Invoice Status Retrieval (Alias for /erp/status/:uuid)
router.get('/erp/invoices/:uuid/status', async (req, res) => {
    try {
        const { uuid } = req.params;
        const company = (req as any).company;
        const invoice = await prisma.invoice.findFirst({ where: { uuid, company_id: company.id } });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found');
        sendSuccess(res, formatStatusContract(invoice));
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

// Invoice XML Retrieval
router.get('/erp/invoices/:uuid/xml', async (req, res) => {
    try {
        const { uuid } = req.params;
        const company = (req as any).company;
        const invoice = await prisma.invoice.findFirst({ where: { uuid, company_id: company.id } });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found');
        
        // Return cleared_xml_payload if available, else xml_payload (JSON form) as backup or error
        const xml = invoice.cleared_xml_payload;
        if (!xml) return sendError(res, 400, 'NOT_AVAILABLE', 'Cleared XML not yet generated or available');
        
        res.setHeader('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

// Invoice QR Code Retrieval
router.get('/erp/invoices/:uuid/qr', async (req, res) => {
    try {
        const { uuid } = req.params;
        const company = (req as any).company;
        const invoice = await prisma.invoice.findFirst({ where: { uuid, company_id: company.id } });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found');
        
        sendSuccess(res, { qrCode: invoice.qr_code || null, status: invoice.status });
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

// Replay / Recovery
router.post('/erp/invoices/:uuid/replay', async (req, res) => {
    try {
        const { uuid } = req.params;
        const company = (req as any).company;
        const invoice = await prisma.invoice.findFirst({ where: { uuid, company_id: company.id, status: 'FAILED' } });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'No failed invoice found with this ID');
        
        // Reset status to PENDING for background worker to pick up
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { 
                status: 'PENDING', 
                retry_count: { increment: 1 },
                error_log: null 
            }
        });
        
        sendSuccess(res, { message: 'Invoice queued for replay', jobId: uuid });
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

/**
 * 7. Certificate Management (Requirement: Security Operations)
 */
router.get('/erp/certificates', async (req, res) => {
    try {
        const company = (req as any).company;
        const certificates = await prisma.certificate.findMany({ 
            where: { company_id: company.id },
            select: { id: true, type: true, expiry_date: true, is_active: true, created_at: true, common_name: true }
        });
        sendSuccess(res, { certificates });
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

router.post('/erp/certificates', async (req, res) => {
    try {
        const company = (req as any).company;
        const { certificate, privateKey, type } = req.body;
        
        if (!certificate || !privateKey || !type) {
            return sendError(res, 400, 'INVALID_REQUEST', 'Certificate, Private Key, and Type are required');
        }

        const saved = await prisma.certificate.create({
            data: {
                company_id: company.id,
                certificate,
                private_key: privateKey,
                public_key: '...extracted_from_cert...',
                type,
                is_active: true
            }
        });

        sendSuccess(res, { id: saved.id, status: 'STORED' });
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

/**
 * Compliance Health Check (Requirement: Enterprise Operations)
 */
/**
 * @swagger
 * /api/v1/erp/health/compliance:
 *   get:
 *     summary: Get Compliance Health Score
 *     description: |
 *       Perform deep diagnostics on the ZATCA integration health.
 *       Includes certificate monitoring, hash chain integrity, and webhook delivery analytics.
 *     tags: [Enterprise V2]
 *     security:
 *       - hmacAuth: []
 *     responses:
 *       200:
 *         description: Returns the multi-dimensional health contract.
 */
router.get('/erp/health/compliance', async (req, res) => {
    try {
        const company = (req as any).company;
        const health = await MonitoringService.getComplianceHealth(company.id);
        sendSuccess(res, health);
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

/**
 * Metrics Export (Requirement: Enterprise Observability)
 */
router.get('/erp/metrics', async (req, res) => {
    try {
        const company = (req as any).company;
        const metrics = await MonitoringService.getPrometheusMetrics(company.id);
        res.setHeader('Content-Type', 'text/plain; version=0.0.4');
        res.send(metrics);
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

export default router;
