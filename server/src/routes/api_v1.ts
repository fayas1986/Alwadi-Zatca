
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { SecurityService } from '../services/securityService.js';
import { sendError, sendAccepted, sendSuccess, injectComplianceFields, validateHardenedCompliance, getKSATimestamp, INITIAL_PIH, processInvoiceChaining } from '../utils/api-helpers.js';
import { InvoiceService } from '../services/invoiceService.js';
import { WebhookService } from '../services/webhookService.js';
import { MonitoringService } from '../services/monitoringService.js';
import { AuditService } from '../services/auditService.js';
import { signInvoice } from '../services/sdkService.js';
import { generateInvoiceXML } from '../services/xmlService.js';
import { QueueService } from '../services/queueService.js';

const router = Router();

// --- 0. Global V2 Diagnostic Logging ---
router.use((req, res, next) => {
    const clientId = req.headers['x-client-id'];
    const apiKey = req.headers['x-api-key'];
    console.log(`[V2 Router] Incoming: ${req.method} ${req.originalUrl}`);
    console.log(`[V2 Router] Headers: x-client-id=${clientId || 'NONE'}, x-api-key=${apiKey ? 'PRESENT' : 'NONE'}`);
    
    // Path Normalization: Catch V1 clients accidentally hitting V2 router
    // NOTE: We allow /erp/invoices/submit here because we explicitly aliased it for Postman compatibility
    if (req.originalUrl.includes('/erp/invoices/submit') && !req.originalUrl.endsWith('/submit')) {
        console.warn(`[V2 Router] Path Mismatch: V1 client hitting V2 route ${req.originalUrl}`);
        if (apiKey && !clientId) {
            return sendError(res, 400, 'PATH_MISMATCH', 'V1 clients should use /api/erp/invoices/submit. You are hitting a V2 endpoint with V1 credentials.');
        }
    }
    next();
});



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
            qrCode: invoice.qr_code,
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
    const apiKey = req.headers['x-api-key'] as string;

    // --- 0. HMAC Bypass for Simple API Communication ---
    if (apiKey && !signature) {
        console.log(`[AUTH] HMAC Bypassed for Simple Communication (API Key present)`);
        return authenticateSimple(req, res, next);
    }

    if (!clientId || !timestamp || !nonce || !signature) {
        console.warn(`[V2 HMAC] Missing Headers on ${req.originalUrl} from ${req.ip}. Headers: clientId=${!!clientId}, ts=${!!timestamp}, nonce=${!!nonce}, sig=${!!signature}`);
        return sendError(res, 401, 'UNAUTHORIZED', 'Missing required HMAC headers');
    }

    try {
        const trimmedClientId = clientId.trim();
        const serverTime = Date.now();
        
        // --- 1. Timestamp Validation (Strict 5-Minute Window) ---
        const requestTime = new Date(timestamp).getTime();
        if (isNaN(requestTime)) {
            return sendError(res, 401, 'INVALID_TIMESTAMP', 'Timestamp format is invalid');
        }

        const timeDiff = Math.abs(serverTime - requestTime);
        const driftSeconds = Math.round(timeDiff / 1000);
        
        if (timeDiff > 5 * 60 * 1000) {
            console.warn(`[V2 HMAC] Clock Drift Failure: Client ${trimmedClientId} sent ${timestamp} (Diff: ${driftSeconds}s)`);
            return sendError(res, 401, 'EXPIRED_REQUEST', `Request timestamp is outside the allowed 5-minute window. Drift: ${driftSeconds}s. Received: ${timestamp}`);
        }

        // --- 2. Replay Protection (Nonce Uniqueness) ---
        const nonceKey = `nonce:${trimmedClientId}:${nonce}`;
        if (usedNonces.has(nonceKey)) {
            console.warn(`[V2 HMAC] Replay Attack Detected: Nonce ${nonce} reused by client ${trimmedClientId}`);
            return sendError(res, 401, 'REPLAY_ATTACK', 'Nonce already used');
        }
        usedNonces.set(nonceKey, serverTime + 5 * 60 * 1000);

        // --- 3. Client Identity & HMAC Verification ---
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(trimmedClientId)) {
            return sendError(res, 401, 'UNAUTHORIZED', 'Invalid Client ID format (Expected UUID)');
        }

        const erpConfig = await (prisma.erp_configuration as any).findFirst({
            where: { id: trimmedClientId, is_active: true },
            include: { company: true }
        });

        if (!erpConfig) return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or inactive Client ID');

        // --- 4. Cryptographic Verification ---
        const secret = erpConfig.api_key || process.env.V2_FALLBACK_SECRET;
        if (!secret) {
            console.error(`[V2 HMAC] Security Gap: No secret configured for Client ${trimmedClientId}`);
            return sendError(res, 500, 'SECURITY_MISCONFIG', 'Server side security configuration missing');
        }

        const authResult = SecurityService.verifySignature(
            secret,
            timestamp,
            nonce,
            req.method,
            req.originalUrl.split('?')[0],
            req.body,
            signature
        );

        if (!authResult.isValid) {
            console.error(`[V2 HMAC] Signature Failure for Client: ${trimmedClientId} on Path: ${req.originalUrl}`);
            // console.debug(`[V2 HMAC] Expected Data: ${authResult.expectedData}`); // Only for internal debug
            return sendError(res, 401, 'INVALID_SIGNATURE', 'HMAC signature verification failed');
        }

        console.log(`[AUTH] HMAC Verified successfully for Client: ${trimmedClientId}`);

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

        // --- 0. Auto-populate Supplier (ZATCA Data Normalization) ---
        // Requirement: Always include Supplier CRN, VAT, and Address
        if (!payload.supplier || !payload.supplier.vatNumber || !payload.supplier.address?.streetName) {
            const supplierAddress = payload.supplier?.address || {};
            payload.supplier = {
                name: company.registered_name,
                registrationName: company.registered_name,
                vatNumber: company.vat_number,
                crNumber: company.cr_number,
                address: {
                    streetName: supplierAddress.streetName || company.street_name || 'Main Street',
                    buildingNumber: supplierAddress.buildingNumber || company.building_number || '0000',
                    cityName: supplierAddress.cityName || company.city || 'Riyadh',
                    postalZone: supplierAddress.postalZone || company.postal_zone || '00000',
                    citySubdivisionName: supplierAddress.citySubdivisionName || company.city_subdivision || company.city || 'Riyadh',
                    countryCode: supplierAddress.countryCode || company.country || 'SA'
                }
            };
        }

        // --- 0.1 Auto-populate Customer (Ensure structural integrity) ---
        if (!payload.customer) {
            payload.customer = {
                name: 'Cash Customer',
                vatNumber: '300000000000003', // Default for simplified
                address: {
                    streetName: 'Unknown',
                    buildingNumber: '0000',
                    cityName: 'Riyadh',
                    postalZone: '00000',
                    countryCode: 'SA'
                }
            };
        }

        // --- 1. Absolute Idempotency (Requirement: Optimized Cached Response) ---
        const idempotencyKey = payload.idempotencyKey || payload.invoiceNumber;
        const idempotencyHash = crypto.createHash('sha256').update(SecurityService.stableStringify(payload)).digest('hex');
        
        const existing = await prisma.invoice.findFirst({
            where: { company_id: company.id, submission_id: idempotencyKey }
        });

        if (existing) {
            const originalPayload = (existing.metadata as any)?.originalPayload;
            const originalHash = existing.hash || crypto.createHash('sha256').update(SecurityService.stableStringify(originalPayload)).digest('hex');
            
            if (idempotencyHash !== originalHash) {
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
        
        // --- 2.1 Critical Compliance Check ---
        const validation = validateHardenedCompliance(invoiceData);
        if (!validation.isValid) {
            return sendError(res, 400, 'COMPLIANCE_ERROR', 'The provided data fails ZATCA mandatory requirements', validation.errors);
        }

        // Retrieve the last successful OR pending invoice to maintain a strict chain
        const lastInvoice = await prisma.invoice.findFirst({
            where: { company_id: company.id },
            orderBy: { created_at: 'desc' }
        });
        
        const chain = await processInvoiceChaining(invoiceData, lastInvoice?.hash || null);
        invoiceData.uuid = chain.uuid;
        invoiceData.previousInvoiceHash = chain.previousHash;
        const finalHash = chain.invoiceHash;

        // 3. Persistence (Requirement 5: Multi-Tenant)
        const saved = await InvoiceService.createInvoice({
            company_id: company.id,
            invoice_number: invoiceData.invoiceNumber,
            uuid: invoiceData.uuid,
            date: new Date(invoiceData.issueDate || new Date()),
            total_amount: invoiceData.totalAmount || 0,
            tax_amount: invoiceData.vatAmount || 0,
            status: 'PENDING',
            type: invoiceData.invoiceSubtype === 'STANDARD' ? 'B2B' : 'B2C',
            hash: finalHash,
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

/**
 * ── RETAIL MODE: Synchronous Submission ──
 * Returns QR Code and Hash IMMEDIATELY.
 * Reporting to ZATCA still happens in background to avoid blocking the sale.
 */
const handleSyncSubmission = async (req: Request, res: Response, type: 'Invoice' | 'CreditNote' | 'DebitNote') => {
    try {
        const company = (req as any).company;
        const payload = req.body;

        const injected = injectComplianceFields(payload, type.toUpperCase() as any);

        // 0. Compliance Hardening & Validation
        const validation = validateHardenedCompliance(injected);
        if (!validation.isValid) {
            return sendError(res, 400, 'COMPLIANCE_ERROR', 'The provided data fails ZATCA mandatory requirements', validation.errors);
        }

        const idempotencyKey = req.headers['idempotency-key'] as string;
        const invoiceNumber = payload.invoiceNumber;

        // Idempotency check: Don't process the same invoice twice
        const existing = await prisma.invoice.findFirst({
            where: {
                company_id: company.id,
                invoice_number: invoiceNumber,
                is_deleted: false
            }
        });

        if (existing) {
            return res.status(200).json({
                status: 'SUCCESS',
                message: 'Invoice already processed (Idempotency)',
                invoiceId: existing.id,
                hash: existing.hash,
                qrCode: existing.qr_code
            });
        }

        // 2. Determine Previous Hash (PIH) with Row Locking
        const { pih } = await prisma.$transaction(async (tx) => {
            // Lock the company row to ensure sequence
            await tx.$executeRaw`SELECT id FROM companies WHERE id = ${company.id} FOR UPDATE`;

            const prev = await tx.invoice.findFirst({
                where: {
                    company_id: company.id,
                    OR: [
                        { hash: { not: null } },
                        { zatca_hash: { not: null } }
                    ],
                    status: { not: 'FAILED' }
                },
                orderBy: { id: 'desc' },
                select: { hash: true, zatca_hash: true }
            });

            return {
                pih: prev?.zatca_hash || prev?.hash || INITIAL_PIH
            };
        });

        injected.previousInvoiceHash = pih;

        // 3. Generate XML
        const xmlContent = generateInvoiceXML(injected);

        // 4. SIGN IMMEDIATELY (Fetch Cert first)
        const cert = await prisma.certificate.findFirst({
            where: { company_id: company.id, is_active: true }
        });

        if (!cert || !cert.certificate || !cert.private_key) {
            return sendError(res, 403, 'CERTIFICATE_MISSING', 'No active ZATCA certificate found for this company.');
        }

        const decryptedSecret = SecurityService.decrypt(cert.private_key);
        
        // SYNC SIGNING CALL
        const { signedXml, hash, qr } = await signInvoice(xmlContent, cert.certificate, decryptedSecret);

        // 5. Store in DB
        const saved: any = await prisma.invoice.create({
            data: {
                company_id: (company as any).id,
                uuid: injected.uuid,
                submission_id: `SYNC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                invoice_number: injected.invoiceNumber,
                date: new Date(), // DB storage time
                total_amount: injected.totalWithVat,
                tax_amount: injected.totalVat,
                status: 'PENDING' as any,
                type: (injected.invoiceSubtype === 'STANDARD' ? 'B2B' : 'B2C') as any,
                hash: hash,
                qr_code: qr,
                xml_payload: Buffer.from(signedXml).toString('base64'),
                metadata: {
                    items: injected.items,
                    customer: injected.customer,
                    invoice_subtype: injected.invoiceSubtype
                }
            }
        });
        // 6. Queue for Background Reporting
        QueueService.enqueue({
            invoiceId: saved.id,
            companyId: (company as any).id,
            environment: (company as any).environment,
            retryCount: 0
        });

        // 7. RETURN IMMEDIATE SUCCESS WITH QR
        return res.status(200).json({
            status: 'ACCEPTED',
            message: 'Invoice accepted and QR generated successfully.',
            jobId: saved.uuid,
            invoiceHash: hash,
            previousInvoiceHash: pih,
            qrCode: qr,
            metadata: {
                uuid: saved.uuid,
                type: saved.type,
                subtype: (saved.metadata as any)?.invoice_subtype || 'SIMPLIFIED'
            }
        });

    } catch (error: any) {
        console.error('[Sync Submission] Error:', error);
        sendError(res, 500, 'TECHNICAL_ERROR', error.message);
    }
};

// ── Auth Configuration ────────────────────────────────────────────────────
// Apply HMAC middleware globally - it handles both HMAC and Simple API Key fallback.
router.use(authenticateHMAC);

// ── Simple API Routes (V1 Proxy Mode) ──────────────────────────────────────────
// Alias for consistency with Postman collection
router.post(['/erp/invoices/submit', '/erp/submit', '/erp/v1/submit'], (req, res) => {
    const docType = req.body.documentType || 'Invoice';
    handleAsyncSubmission(req, res, docType as any);
});

// Endpoint: POST /api/v1/erp/submit/sync (RETAIL MODE)
router.post(['/erp/submit/sync', '/erp/invoices/sync', '/erp/v1/submit/sync'], (req, res) => {
    const docType = req.body.documentType || 'Invoice';
    handleSyncSubmission(req, res, docType as any);
});

// Endpoint: GET /api/v1/erp/status/:jobId
router.get(['/erp/status', '/erp/status/:jobId', '/erp/v1/status/:jobId'], async (req, res) => {
    try {
        const jobId = req.params.jobId as string;

        if (!jobId) {
            return sendError(res, 400, 'MISSING_PARAMETER', 'Job ID is required. Use /api/v1/erp/status/{{jobId}}');
        }

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
        const invoice = await prisma.invoice.findFirst({ 
            where: { 
                OR: [
                    ...(isUuid ? [{ uuid: jobId }] : []),
                    { submission_id: jobId }
                ], 
                company_id: ((req as any).company as any).id 
            } 
        });
        if (!invoice) return sendError(res, 404, 'NOT_FOUND', 'Job ID not found');
        res.status(200).json(formatStatusContract(invoice as any));
    } catch (error: any) {
        sendError(res, 500, 'SERVER_ERROR', error.message);
    }
});

// ── Enterprise V2 Routes ───────────────────────────────────────────────────────

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
 *               invoiceSubtype: { type: string, enum: [STANDARD, SIMPLIFIED], default: "SIMPLIFIED" }
 *               issueDate: { type: string, format: date-time }
 *               currencyCode: { type: string, example: "SAR", default: "SAR" }
 *               lineExtensionAmount: { type: number, description: "Sum of line net amounts", example: 100.00 }
 *               taxExclusiveAmount: { type: number, description: "Total net amount", example: 100.00 }
 *               taxInclusiveAmount: { type: number, description: "Total gross amount", example: 115.00 }
 *               totalAmount: { type: number, description: "Total gross amount (Alias for taxInclusiveAmount)", example: 115.00 }
 *               vatAmount: { type: number, example: 15.00 }
 *               payableAmount: { type: number, description: "Final amount to pay", example: 115.00 }
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
 *                     vatRate: { type: number, example: 0.15 }
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

