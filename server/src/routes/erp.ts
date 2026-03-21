
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { fetchAndProcessInvoices } from '../services/integrationService.js';
import { generateInvoiceXML } from '../services/xmlService.js';
import { signInvoice } from '../services/sdkService.js';
import { reportInvoice, clearInvoice } from '../services/zatcaService.js';
import { decrypt } from '../utils/crypto.js';
import prisma from '../lib/prisma.js';
import { AuditService } from '../services/auditService.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/erp/mock-server  — mock ERP endpoint for testing Pull API
// ─────────────────────────────────────────────────────────────────────────────
router.get('/mock-server', (req, res) => {
    const timestamp = new Date().toISOString();
    res.json([
        {
            invoiceNumber: `MOCK-ERP-${Date.now()}-1`,
            issueDate: timestamp,
            invoiceSubtype: 'Simplified',
            totalAmount: 115.00,
            vatAmount: 15.00,
            customer: { name: 'Mock Customer 1', city: 'Riyadh' },
            items: [{ name: 'Test Product', quantity: 1, unitPrice: 100 }]
        },
        {
            invoiceNumber: `MOCK-ERP-${Date.now()}-2`,
            issueDate: timestamp,
            invoiceSubtype: 'Standard',
            totalAmount: 2300.00,
            vatAmount: 300.00,
            customer: { name: 'Enterprise Client', vatNumber: '345678901234567', city: 'Jeddah' },
            items: [{ name: 'Service Fee', quantity: 1, unitPrice: 2000 }]
        }
    ]);
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/erp/pull  — pull invoices from an external ERP URL
// ─────────────────────────────────────────────────────────────────────────────
router.post('/pull', async (req: Request, res: Response) => {
    try {
        const { sourceUrl, authHeader, vat } = req.body;

        if (!sourceUrl || !vat) {
            res.status(400).json({ success: false, error: 'Missing sourceUrl or vat' });
            return;
        }

        const results = await fetchAndProcessInvoices(sourceUrl, authHeader, vat);

        // Add Audit Log
        await AuditService.log({
            action: 'ERP Pull Sync',
            category: 'Operational',
            user: 'System',
            role: 'IT_ADMIN',
            ipAddress: req.ip || '127.0.0.1',
            details: `Invoices pulled from ${sourceUrl} for VAT ${vat}`,
            status: 'Success',
            resourceId: vat,
            metadata: {
                sourceUrl,
                invoiceCount: results.length
            }
        });

        res.json({ success: true, results });

    } catch (error: any) {
        console.error('ERP Pull Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/erp/configs  — list all ERP configurations
// ─────────────────────────────────────────────────────────────────────────────
router.get('/configs', async (req: Request, res: Response) => {
    try {
        const { companyId } = req.query;
        if (!companyId) return res.status(400).json({ error: 'companyId is required' });

        const configs = await prisma.erp_configuration.findMany({
            where: { company_id: parseInt(companyId as string) }
        });
        res.json(configs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/erp/config  — save a new ERP configuration
router.post('/config', async (req: Request, res: Response) => {
    try {
        const { companyId, type, baseUrl, apiKey, syncInterval, environment } = req.body;
        console.log(`[ERP Config] Creating config for Company: ${companyId}, Type: ${type}, Env: ${environment}, API Key Prefix: ${apiKey?.substring(0, 10)}...`);

        if (!companyId || !type || !baseUrl) {
            return res.status(400).json({ success: false, error: 'companyId, type and baseUrl are required' });
        }

        const config = await (prisma as any).erp_configuration.create({
            data: {
                company_id: parseInt(companyId),
                type,
                base_url: baseUrl,
                api_key: apiKey,
                environment: environment || 'PRODUCTION',
                sync_interval: syncInterval || 30
            }
        });

        res.json({
            success: true,
            data: config
        });

    } catch (error: any) {
        console.error('ERP Config Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/erp/sync  — trigger a manual sync
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sync/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        console.log(`Manual ERP sync triggered for config ${id}`);

        const config = await prisma.erp_configuration.findUnique({
            where: { id: id as string },
            include: { company: true }
        });

        if (!config) {
            return res.status(404).json({ success: false, error: 'ERP Configuration not found' });
        }

        const results = await fetchAndProcessInvoices(
            config.base_url, 
            config.api_key || '', 
            config.company.vat_number,
            config.environment || undefined // Pass environment to pull logic
        );

        res.json({ 
            success: true, 
            message: `Sync completed. Processed ${results.length} invoices.`,
            results 
        });

    } catch (error: any) {
        console.error('Sync Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @swagger
 * /api/erp/invoices/submit:
 *   post:
 *     summary: External ERP Invoice Submission (Push)
 *     description: Submit an invoice from an external ERP. Includes automatic signing and ZATCA reporting/clearance.
 *     tags: [External Integration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoiceNumber, invoiceSubtype, issueDate, totalAmount, vatAmount]
 *             properties:
 *               invoiceNumber: { type: string, example: "INV-2026-001" }
 *               invoiceSubtype: { type: string, enum: [Standard, Simplified], example: "Simplified" }
 *               issueDate: { type: string, format: date-time, example: "2026-03-13T10:00:00Z" }
 *               totalAmount: { type: number, example: 115.00 }
 *               vatAmount: { type: number, example: 15.00 }
 *               taxExclusiveAmount: { type: number, example: 100.00 }
 *               supplier:
 *                 type: object
 *                 properties:
 *                   vatNumber: { type: string, example: "300000000000003" }
 *               customer:
 *                 type: object
 *                 properties:
 *                   name: { type: string, example: "Walk-in Customer" }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     quantity: { type: number }
 *                     unitPrice: { type: number }
 *                     taxCategory: { type: string, example: "S" }
 *                     vatRate: { type: number, example: 0.15 }
 *               documentType: { type: string, enum: [Invoice, "Credit Note", "Debit Note"], default: "Invoice" }
 *               billingReference: { type: string, description: "Required for Credit/Debit Notes. ID of original invoice." }
 *               instructionNote: { type: string, description: "Reason for the note." }
 *     responses:
 *       200:
 *         description: Invoice processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 status: { type: string, enum: [REPORTED, CLEARED, SIMULATED] }
 *                 uuid: { type: string }
 *                 hash: { type: string }
 *                 qrCode: { type: string }
 *       401:
 *         description: Unauthorized - Missing or invalid API Key
 *       422:
 *         description: Validation error in payload
 *       500:
 *         description: Internal server error
 */
router.post('/invoices/submit', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers['authorization'] || '';
        const apiKey = authHeader.replace(/^Bearer\s+/i, '');
        const idempotencyKey = req.headers['idempotency-key'] as string;

        if (!apiKey) {
            return res.status(401).json({ success: false, error: 'Missing Authorization header' });
        }

        const invoice = req.body;
        
        // ── Idempotency Check ──
        if (idempotencyKey) {
            const duplicate = await prisma.invoice.findFirst({
                where: { submission_id: idempotencyKey }
            });
            if (duplicate) {
                console.log(`[ERP Push] Returning cached response for Idempotency-Key: ${idempotencyKey}`);
                return res.json(JSON.parse(duplicate.submission_response || '{}'));
            }
        }

        // Validate required fields
        const required = ['invoiceNumber', 'invoiceSubtype', 'issueDate', 'totalAmount', 'vatAmount'];
        for (const field of required) {
            if (invoice[field] === undefined || invoice[field] === null || invoice[field] === '') {
                return res.status(400).json({ success: false, error: `Missing required field: ${field}` });
            }
        }

        const vatNumber = invoice.supplier?.vatNumber || '300000000000003';

        // ── Look up ERP Configuration by API Key ──
        const erpConfig = await prisma.erp_configuration.findFirst({
            where: { api_key: apiKey },
            include: { company: { include: { certificates: true } } }
        });

        let company: any = erpConfig?.company || null;
        let targetEnv = erpConfig?.environment || company?.environment || 'SANDBOX';

        // fallback if no config found (legacy / master key support)
        if (!company) {
            try {
                company = await prisma.company.findUnique({
                    where: { vat_number: vatNumber },
                    include: { certificates: true }
                });
            } catch (dbLookupErr: any) {
                console.warn('DB lookup failed:', dbLookupErr.message);
            }
        }

        if (!company) {
            await AuditService.log({
                action: 'ERP Push Submission',
                category: 'Operational',
                user: 'External API',
                role: 'IT_ADMIN',
                ipAddress: req.ip || '127.0.0.1',
                details: `Failed to submit invoice. Unrecognized API Key or VAT: ${vatNumber}`,
                status: 'Failure',
                resourceId: invoice.invoiceNumber,
                metadata: { error: 'Company not found' }
            });
            return res.status(404).json({ success: false, error: `Valid ERP configuration or Company with VAT ${vatNumber} not found.` });
        }

        const existingInvoice = await prisma.invoice.findFirst({
            where: {
               company_id: company.id,
               invoice_number: invoice.invoiceNumber
            }
        });

        if (existingInvoice) {
             await AuditService.log({
                action: 'ERP Push Submission',
                category: 'Operational',
                user: 'External API',
                role: 'IT_ADMIN',
                ipAddress: req.ip || '127.0.0.1',
                details: `Duplicate invoice submission rejected: ${invoice.invoiceNumber}`,
                status: 'Failure',
                resourceId: invoice.invoiceNumber,
                metadata: { error: 'Invoice already exists' }
            });
            return res.status(409).json({ success: false, error: 'Invoice already exists' });
        }

        // ── Build ZATCA-shaped invoice ──
        const pih = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMjRiZmQ3NTI0MjkzZjBlYTRiM2IzZTk4MTU1MWNiMA==';
        const zatcaInvoice: any = {
            ...invoice,
            uuid: crypto.randomUUID(),
            documentType: invoice.documentType || 'Invoice',
            billingReference: invoice.billingReference,
            instructionNote: invoice.instructionNote,
            currencyCode: invoice.currencyCode || 'SAR',
            previousInvoiceHash: pih,
        };

        let signedXml: string = '';
        let hash: string = '';
        let qr: string = '';
        let zatcaResult: any = null;

        // ── Find active certificate for the target environment ──
        const cert = company?.certificates?.find((c: any) => 
            c.is_active && c.type.toUpperCase() === targetEnv.toString().toUpperCase()
        ) || company?.certificates?.find((c: any) => c.is_active);

        try {
            const xml = generateInvoiceXML(zatcaInvoice);

            let certPem = cert?.certificate || 'MockCert';
            let privateKey = cert ? (cert.private_key.startsWith('MOCK') ? cert.private_key : decrypt(cert.private_key)) : 'MockPrivateKey';
            let secret = cert?.secret ? (cert.secret.startsWith('MOCK') ? cert.secret : decrypt(cert.secret)) : 'MockSecret';

            if (cert && certPem.includes('BEGIN CERTIFICATE')) {
                certPem = certPem
                    .replace(/-----BEGIN CERTIFICATE-----/g, '')
                    .replace(/-----END CERTIFICATE-----/g, '')
                    .replace(/\s/g, '');
            }

            try {
                const signed = await signInvoice(xml, certPem, privateKey);
                signedXml = signed.signedXml;
                hash = signed.hash;
                qr = signed.qr;
            } catch {
                signedXml = Buffer.from(xml).toString('base64');
                hash = 'sim-hash-' + crypto.randomBytes(8).toString('hex');
                qr = 'sim-qr-' + Buffer.from(vatNumber + invoice.invoiceNumber).toString('base64');
            }

            // ── ZATCA Report / Clear ──
            const normalizedEnv = targetEnv.toString().toLowerCase();
            const isMock = certPem.startsWith('MOCK_') || cert?.csid?.startsWith('MOCK_');

            if (isMock) {
                console.log(`[ERP Submit] Mock certificate detected for ${vatNumber} in ${normalizedEnv}. Bypassing real ZATCA API.`);
                zatcaResult = {
                    reportingStatus: invoice.invoiceSubtype === 'Simplified' ? 'REPORTED' : undefined,
                    clearanceStatus: invoice.invoiceSubtype === 'Standard' ? 'CLEARED' : undefined,
                    validationResults: { status: 'PASS', messages: [] },
                    note: `Simulated response for Mock Certificate in ${normalizedEnv}`
                };
            } else if (cert?.csid) {
                try {
                    if (invoice.invoiceSubtype === 'Standard') {
                        zatcaResult = await clearInvoice(
                            normalizedEnv,
                            cert.csid!,
                            secret,
                            hash,
                            Buffer.from(signedXml || '').toString('base64'),
                            zatcaInvoice.uuid
                        );
                    } else {
                        zatcaResult = await reportInvoice(
                            normalizedEnv,
                            cert.csid,
                            secret,
                            hash,
                            Buffer.from(signedXml).toString('base64'),
                            zatcaInvoice.uuid
                        );
                    }
                } catch (zErr: any) {
                    console.warn(`ZATCA call failed for ${normalizedEnv}:`, zErr.message);
                    zatcaResult = null;
                }
            }

        } catch (xmlErr: any) {
            console.error('[ERP] XML Gen Error:', xmlErr);
            const errMsg = xmlErr instanceof Error ? xmlErr.message : String(xmlErr);
            return res.status(422).json({ success: false, error: `XML generation failed: ${errMsg}` });
        }

        // ── Determine status ──
        const isCleared = zatcaResult?.clearanceStatus === 'CLEARED';
        const isReported = zatcaResult?.reportingStatus === 'REPORTED';
        const status = isCleared ? 'CLEARED' : isReported ? 'REPORTED' : 'SIMULATED';

        // ── Save to DB ──
        let savedInvoice;
        try {
            savedInvoice = await prisma.invoice.create({
                data: {
                    company_id: company.id,
                    invoice_number: invoice.invoiceNumber,
                    uuid: zatcaInvoice.uuid,
                    date: new Date(invoice.issueDate),
                    total_amount: invoice.totalAmount,
                    tax_amount: invoice.vatAmount,
                    status: (status === 'SIMULATED' ? 'REPORTED' : status) as any,
                    type: invoice.invoiceSubtype === 'Standard' ? 'B2B' : 'B2C',
                    hash,
                    qr_code: qr,
                    xml_payload: signedXml,
                    submission_id: idempotencyKey, 
                    submission_response: JSON.stringify({
                        success: true,
                        status,
                        uuid: zatcaInvoice.uuid,
                        hash,
                        qrCode: qr,
                        zatcaResponse: zatcaResult || { status, note: 'Simulated' }
                    })
                }
            });
        } catch (dbError: any) {
            console.warn('Could not save to DB:', dbError.message);
            await AuditService.log({
                action: 'ERP Push Submission',
                category: 'Operational',
                user: 'External API',
                role: 'IT_ADMIN',
                ipAddress: req.ip || '127.0.0.1',
                details: `Failed to save invoice ${invoice.invoiceNumber} to DB`,
                status: 'Failure',
                resourceId: invoice.invoiceNumber,
                metadata: { error: dbError.message }
            });
            return res.status(500).json({ success: false, error: 'Failed to save invoice to database' });
        }

        // ── Response ──
        res.json({
            success: true,
            status,
            invoiceId: savedInvoice?.id || null,
            uuid: zatcaInvoice.uuid,
            hash,
            qrCode: qr,
            vatNumber,
            invoiceNumber: invoice.invoiceNumber,
            zatcaResponse: zatcaResult || {
                reportingStatus: status === 'SIMULATED' ? 'SIMULATED' : isReported ? 'REPORTED' : undefined,
                clearanceStatus: isCleared ? 'CLEARED' : undefined,
                note: cert ? 'Live ZATCA submission' : 'No active cert — simulated',
            },
            timestamp: new Date().toISOString()
        });

        // Add Audit Log
        await AuditService.log({
            action: 'ERP Push Submission',
            category: 'Operational',
            user: 'External API',
            role: 'IT_ADMIN',
            ipAddress: req.ip || '127.0.0.1',
            details: `Invoice ${invoice.invoiceNumber} submitted via ERP Push API`,
            status: 'Success',
            resourceId: invoice.invoiceNumber,
            metadata: {
                uuid: zatcaInvoice.uuid,
                status
            }
        });

    } catch (error: any) {
        console.error('ERP Invoice Submit Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @swagger
 * /api/erp/invoices/{uuid}/status:
 *   get:
 *     summary: Check Invoice Submission Status
 *     description: Retrieve the current status of an invoice submission using its UUID.
 *     tags: [External Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: The UUID of the invoice returned during submission.
 *     responses:
 *       200:
 *         description: Invoice status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 invoiceNumber: { type: string }
 *                 uuid: { type: string }
 *                 status: { type: string, enum: [CLEARED, REPORTED, SIMULATED, FAILED, PENDING] }
 *                 zatcaResponse: { type: object }
 *                 timestamp: { type: string, format: date-time }
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Internal server error
 */
router.get('/invoices/:uuid/status', async (req: Request, res: Response) => {
    try {
        const { uuid } = req.params;

        const invoice = await prisma.invoice.findFirst({
            where: { uuid: uuid as string },
            select: {
                invoice_number: true,
                uuid: true,
                status: true,
                submission_response: true,
                created_at: true
            }
        });

        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        res.json({
            success: true,
            invoiceNumber: invoice.invoice_number,
            uuid: invoice.uuid,
            status: invoice.status,
            zatcaResponse: JSON.parse(invoice.submission_response || '{}'),
            timestamp: invoice.created_at
        });

    } catch (error: any) {
        console.error('Invoice Status Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
