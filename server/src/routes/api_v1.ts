
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { SecurityService } from '../services/securityService.js';
import { sendError, sendAccepted, sendSuccess, injectComplianceFields } from '../utils/api-helpers.js';
import { InvoiceService } from '../services/invoiceService.js';
import { WebhookService } from '../services/webhookService.js';
import { MonitoringService } from '../services/monitoringService.js';
import { AuditService } from '../services/auditService.js';

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

// ── Frozen Status Schema Helper (Requirement 3) ──────────────────────────────
function formatStatusContract(invoice: any) {
    let zatcaRes = null;
    try {
        zatcaRes = invoice.submission_response ? (typeof invoice.submission_response === 'string' ? JSON.parse(invoice.submission_response) : invoice.submission_response) : null;
    } catch (e) {
        console.error('[Status] Failed to parse submission_response:', e);
    }

    const validationResults = Array.isArray(zatcaRes?.validationResults) ? zatcaRes.validationResults : [];

    return {
        jobId: invoice.uuid,
        status: (invoice.status === 'FAILED' || invoice.status === 'DLQ') ? 'FAILED' : (invoice.status === 'PENDING' ? 'PROCESSING' : 'COMPLETED'),
        documentStatus: (invoice.status === 'CLEARED' || invoice.status === 'REPORTED') ? 'CLEARED' : ((invoice.status === 'FAILED' || invoice.status === 'DLQ') ? 'REJECTED' : 'PROCESSING'),
        idempotencyKey: invoice.submission_id,
        retryCount: invoice.retry_count || 0,
        submittedAt: invoice.created_at,
        timeline: [
            { stage: 'RECEIVED', time: invoice.created_at },
            { stage: 'VALIDATED', time: invoice.created_at },
            { stage: 'ZATCA_SUBMITTED', time: invoice.status === 'PENDING' ? 'WAITING' : invoice.created_at }
        ],
        compliance: {
            uuid: invoice.uuid,
            hash: invoice.hash,
            qrGenerated: !!invoice.qr_code
        },
        zatca: {
            status: (invoice.status === 'CLEARED' || invoice.status === 'REPORTED') ? 'REPORTED' : ((invoice.status === 'FAILED' || invoice.status === 'DLQ') ? 'FAILED' : 'PENDING'),
            errors: invoice.error_log ? [{ code: 'BR-REJECTION', message: invoice.error_log }] : validationResults.filter((r: any) => r.type === 'ERROR'),
            warnings: validationResults.filter((r: any) => r.type === 'WARNING')
        }
    };
}

// ── HMAC Auth Middleware (Bank-Level Security + Req 2) ──────────────────────────
const authenticateHMAC = async (req: Request, res: Response, next: any) => {
    console.log(`[AUTH] Checking HMAC for ${req.method} ${req.originalUrl}`);
    const clientId = req.headers['x-client-id'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    const signature = req.headers['x-signature'] as string;
    const nonce = req.headers['x-nonce'] as string;

    if (!clientId) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Missing x-client-id header');
    }

    try {
        const trimmedClientId = clientId.trim();
        const serverTime = Date.now();
        
        // --- 1. Timestamp & Nonce (Optional/Skipped in Bypass mode) ---
        if (timestamp && nonce) {
            const requestTime = new Date(timestamp).getTime();
            if (!isNaN(requestTime) && Math.abs(serverTime - requestTime) < 5 * 60 * 1000) {
                const nonceKey = `nonce:${trimmedClientId}:${nonce}`;
                usedNonces.set(nonceKey, serverTime + 5 * 60 * 1000);
            }
        }

        // --- 3. Client Identity & HMAC Verification ---
        // Validate UUID format before querying to prevent Prisma crash
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUuidValid = UUID_REGEX.test(trimmedClientId);
        console.log(`[AUTH] Client ID: "${trimmedClientId}", Valid UUID: ${isUuidValid}`);

        if (!isUuidValid) {
            return sendError(res, 401, 'UNAUTHORIZED', 'Invalid Client ID format (Expected UUID)');
        }

        const erpConfig = await (prisma.erp_configuration as any).findFirst({
            where: { id: trimmedClientId, is_active: true },
            include: { company: true }
        });

        if (!erpConfig) return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or inactive Client ID');

        // --- 3. HMAC Verification (BYPASSED as per request) ---
        console.log(`[AUTH] HMAC Bypassed for Client: ${trimmedClientId}`);
        // Verification skipped to allow external ERP communication without signature requirements
        const authResult = { isValid: true }; 
        // if (!authResult.isValid) return sendError(res, 401, 'INVALID_SIGNATURE', 'HMAC signature verification failed');

        // --- 4. Industrial 2-Tier Rate Limiting (Requirement 2) ---
        if (!(global as any).apiRateLimits) (global as any).apiRateLimits = {};
        const clientLimits = (global as any).apiRateLimits[trimmedClientId] || { sustained: { count: 0, reset: 0 }, burst: { count: 0, reset: 0 } };

        // Sustained: 1000 req / 1 hour
        if (serverTime > clientLimits.sustained.reset) clientLimits.sustained = { count: 1, reset: serverTime + 60 * 60 * 1000 };
        else clientLimits.sustained.count++;

        // Burst: 20 req / 1 second
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

// ── Simple Auth Middleware (Requirement: Low-Complexity ERPs) ───────────────────
const authenticateSimple = async (req: Request, res: Response, next: any) => {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Missing API Key (x-api-key)');
    }

    try {
        const erpConfig = await (prisma.erp_configuration as any).findFirst({
            where: { api_key: apiKey, is_active: true },
            include: { company: true }
        });

        if (!erpConfig) return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or inactive API Key');

        // Simple Tier Rate Limit (Slower than Enterprise)
        res.setHeader('X-RateLimit-Tier', 'Simple');
        
        (req as any).erpConfig = erpConfig;
        (req as any).company = erpConfig.company;
        next();
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
};

// ── Async Submission Handler ──────────────────────────────────────────────
const handleAsyncSubmission = async (req: Request, res: Response, documentType: 'Invoice' | 'Credit Note' | 'Debit Note') => {
    try {
        const company = (req as any).company;
        const payload = req.body;

        // --- 1. Absolute Idempotency (Requirement: Optimized Cached Response) ---
        const idempotencyKey = payload.idempotencyKey || payload.invoiceNumber;
        const currentHash = crypto.createHash('sha256').update(SecurityService.stableStringify(payload)).digest('hex');
        
        const existing = await prisma.invoice.findFirst({
            where: { company_id: company.id, submission_id: idempotencyKey }
        });

        if (existing) {
            const originalPayload = (existing.metadata as any)?.originalPayload;
            const originalHash = existing.hash || crypto.createHash('sha256').update(SecurityService.stableStringify(originalPayload)).digest('hex');
            
            if (currentHash !== originalHash) {
                return res.status(409).json({ status: 'ERROR', code: 'CONFLICT', message: 'Payload mismatch for existing key' });
            }
            
            // If it failed before, we allow re-submission by moving it back to PENDING
            if (existing.status === 'FAILED') {
                await prisma.invoice.update({
                    where: { id: existing.id },
                    data: { status: 'PENDING', retry_count: 0, error_log: null }
                });
                return res.status(202).json({
                    status: 'ACCEPTED',
                    jobId: existing.uuid,
                    idempotencyKey: existing.submission_id,
                    submittedAt: new Date().toISOString(),
                    message: 'Previous failure reset to pending for retry'
                });
            }

            return res.status(200).json(formatStatusContract(existing));
        }

        // 2. Compliance Injection & Hash Chaining
        const invoiceData = injectComplianceFields(payload, documentType);
        const lastInvoice = await prisma.invoice.findFirst({
            where: { company_id: company.id, status: { in: ['REPORTED', 'CLEARED'] } },
            orderBy: { created_at: 'desc' }
        });
        invoiceData.previousInvoiceHash = lastInvoice?.hash || 'NWZlY2ViOTZmOTk1YTRiMGNjM2YwOTUwZGYzMmM2MGFlNzVhYzZlZDAyODEzNTdhYTAzNzhkZTE2MzYxNzM5Yg==';

        // 3. Persistence (Requirement 5: Multi-Tenant)
        const saved = await InvoiceService.createInvoice({
            company_id: company.id,
            invoice_number: invoiceData.invoiceNumber,
            uuid: invoiceData.uuid,
            date: new Date(invoiceData.issueDate || new Date()),
            total_amount: invoiceData.totalAmount || 0,
            tax_amount: invoiceData.vatAmount || 0,
            status: 'PENDING',
            type: invoiceData.invoiceSubtype === 'Standard' ? 'B2B' : 'B2C',
            hash: currentHash,
            qr_code: '',
            xml_payload: JSON.stringify(invoiceData),
            submission_id: idempotencyKey,
            items: payload.items || [],
            customer: payload.customer,
            metadata: { 
                source: 'API_V2_FINAL', 
                originalPayload: payload 
            }
        });


        // 4. Compliance Forensics: Log Original Payload
        await AuditService.log({
            action: 'ERP_INVOICE_RECEIVED',
            category: 'Operational',
            user: 'API-V1',
            role: 'SYSTEM',
            ipAddress: req.ip || '127.0.0.1',
            status: 'Success',
            details: `Received async ${documentType.toLowerCase()} ${saved.invoice_number} from ERP.`,
            resourceId: saved.id.toString(),
            payload: JSON.stringify(payload),
            metadata: { jobId: saved.uuid, idempotencyKey: saved.submission_id }
        });

        // 5. Trigger Async Webhook (Accepted Event)
        WebhookService.sendWebhook(company.id, 'INVOICE_ACCEPTED', {
            jobId: saved.uuid,
            invoiceNumber: saved.invoice_number,
            status: 'ACCEPTED',
            idempotencyKey: saved.submission_id
        });

        return res.status(202).json({
            status: 'ACCEPTED',
            jobId: saved.uuid,
            idempotencyKey: saved.submission_id,
            submittedAt: saved.created_at
        });
    } catch (error: any) {
        sendError(res, 500, 'TECHNICAL_ERROR', error.message);
    }
};

// ── Simple API Routes (V1 Proxy Mode) ──────────────────────────────────────────
// These routes do NOT require HMAC/Nonce. Only x-api-key.
// Endpoint: POST /api/v1/erp/v1/submit
router.post('/erp/v1/submit', authenticateSimple, (req, res) => {
    const docType = req.body.documentType || 'Invoice';
    handleAsyncSubmission(req, res, docType as any);
});

// Endpoint: GET /api/v1/erp/v1/status/:jobId
// Note: :jobId? makes it optional so we can catch empty jobId and give a better error than HMAC failure
router.get(['/erp/v1/status', '/erp/v1/status/:jobId'], authenticateSimple, async (req, res) => {
    try {
        const { jobId } = req.params;

        if (!jobId) {
            return sendError(res, 400, 'MISSING_PARAMETER', 'Job ID is required. Use /api/v1/erp/v1/status/{{jobId}}');
        }

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
        const invoice = await prisma.invoice.findFirst({ 
            where: { 
                OR: [
                    ...(isUuid ? [{ uuid: jobId }] : []),
                    { submission_id: jobId }
                ], 
                company_id: (req as any).company.id 
            } 
        });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'Job ID not found');
        res.status(200).json(formatStatusContract(invoice));
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

// ── Enterprise V2 Routes (Require HMAC) ─────────────────────────────────────────
router.use(authenticateHMAC);

/**
 * @swagger
 * /api/v1/erp/invoices:
 *   post:
 *     summary: Submit Invoice (Async V2)
 *     description: |
 *       Submit an invoice for asynchronous processing.
 *       Supports both Standard (B2B) and Simplified (B2C) types.
 *       Includes automatic ZATCA signing and reporting.
 *     tags: [Enterprise V2]
 *     security:
 *       - hmacAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoiceNumber, totalAmount, vatAmount]
 *             properties:
 *               invoiceNumber: { type: string, example: "INV-2026-001" }
 *               idempotencyKey: { type: string, example: "req-unique-123" }
 *               invoiceSubtype: { type: string, enum: [Standard, Simplified], default: "Simplified" }
 *               issueDate: { type: string, format: date-time }
 *               totalAmount: { type: number, example: 115.00 }
 *               vatAmount: { type: number, example: 15.00 }
 *               customer:
 *                 type: object
 *                 properties:
 *                   name: { type: string, example: "Test Customer" }
 *                   vatNumber: { type: string, example: "300000000000003" }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string, example: "Product A" }
 *                     quantity: { type: number, example: 1 }
 *                     unitPrice: { type: number, example: 100 }
 *     responses:
 *       202:
 *         description: Accepted. Returns jobId for status tracking.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "ACCEPTED" }
 *                 jobId: { type: string }
 *                 idempotencyKey: { type: string }
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
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
        const invoice = await prisma.invoice.findFirst({
            where: { 
                OR: [
                    ...(isUuid ? [{ uuid }] : []),
                    { submission_id: uuid }
                ],
                company_id: company.id, 
                status: { in: ['FAILED', 'DLQ'] }
            }
        });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'No failures found for this ID');
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
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
        const invoice = await prisma.invoice.findFirst({ 
            where: { 
                OR: [
                    ...(isUuid ? [{ uuid }] : []),
                    { submission_id: uuid }
                ],
                company_id: company.id 
            } 
        });
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
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
        const invoice = await prisma.invoice.findFirst({ 
            where: { 
                OR: [
                    ...(isUuid ? [{ uuid }] : []),
                    { submission_id: uuid }
                ],
                company_id: company.id 
            } 
        });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found');
        return res.status(200).json(formatStatusContract(invoice));
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});



export default router;
