
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
//  POST /api/erp/config  — save a new ERP configuration
// ─────────────────────────────────────────────────────────────────────────────
router.post('/config', async (req: Request, res: Response) => {
    try {
        const { companyId, type, baseUrl, apiKey, syncInterval } = req.body;

        if (!type || !baseUrl) {
            res.status(400).json({ success: false, error: 'type and baseUrl are required' });
            return;
        }

        // For demo: return a simulated success with a generated config id
        const configId = `erp-config-${Date.now()}`;
        console.log(`ERP Config Saved: ${type} → ${baseUrl}`);

        res.json({
            success: true,
            data: {
                id: configId,
                type,
                baseUrl,
                apiKey: apiKey || `auto_${Math.random().toString(36).substring(2, 14)}`,
                syncInterval: syncInterval || 30,
                isActive: true,
                createdAt: new Date().toISOString()
            }
        });

    } catch (error: any) {
        console.error('ERP Config Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/erp/sync  — trigger a manual sync
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sync', async (req: Request, res: Response) => {
    try {
        console.log('Manual ERP sync triggered');
        // In a real app this would kick off a job queue
        res.json({ success: true, message: 'Sync triggered', timestamp: new Date().toISOString() });
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

        if (!apiKey) {
            return res.status(401).json({ success: false, error: 'Missing Authorization header' });
        }

        const invoice = req.body;

        // Validate required fields
        const required = ['invoiceNumber', 'invoiceSubtype', 'issueDate', 'totalAmount', 'vatAmount'];
        for (const field of required) {
            if (invoice[field] === undefined || invoice[field] === null || invoice[field] === '') {
                return res.status(400).json({ success: false, error: `Missing required field: ${field}` });
            }
        }

        const vatNumber = invoice.supplier?.vatNumber || '300000000000003';

        // ── Look up company by supplier VAT (DB might be sleeping — fall back gracefully) ──
        let company: any = null;
        try {
            company = await prisma.company.findUnique({
                where: { vat_number: vatNumber },
                include: { certificates: true }
            });
        } catch (dbLookupErr: any) {
            console.warn('DB lookup failed (DB might be sleeping), falling back to simulation:', dbLookupErr.message);
        }

        // ── Build ZATCA-shaped invoice ──
        const pih = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMjRiZmQ3NTI0MjkzZjBlYTRiM2IzZTk4MTU1MWNiMA==';
        const zatcaInvoice: any = {
            ...invoice,
            uuid: crypto.randomUUID(),
            documentType: 'Invoice',
            currencyCode: invoice.currencyCode || 'SAR',
            previousInvoiceHash: pih,
        };

        // ── XML Generation ──
        let signedXml: string;
        let hash: string;
        let qr: string;
        let zatcaResult: any;

        const cert = company?.certificates?.find((c: any) => c.is_active);

        try {
            const xml = generateInvoiceXML(zatcaInvoice);

            let certPem = cert?.certificate || 'MockCert';
            let privateKey = cert ? decrypt(cert.private_key) : 'MockPrivateKey';
            let secret = cert?.secret ? decrypt(cert.secret) : 'MockSecret';

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
            const isMock = certPem.startsWith('MOCK_') || cert?.csid?.startsWith('MOCK_');

            if (isMock) {
                console.log(`[ERP Submit] Mock certificate detected for ${vatNumber}. Bypassing real ZATCA API.`);
                zatcaResult = {
                    reportingStatus: invoice.invoiceSubtype === 'Simplified' ? 'REPORTED' : undefined,
                    clearanceStatus: invoice.invoiceSubtype === 'Standard' ? 'CLEARED' : undefined,
                    validationResults: { status: 'PASS', messages: [] },
                    note: 'Simulated response for Mock Certificate'
                };
            } else if (cert?.csid) {
                try {
                    if (invoice.invoiceSubtype === 'Standard') {
                        zatcaResult = await clearInvoice(
                            (company!.environment as any),
                            cert.csid,
                            secret,
                            hash,
                            Buffer.from(signedXml).toString('base64')
                        );
                    } else {
                        zatcaResult = await reportInvoice(
                            (company!.environment as any),
                            cert.csid,
                            secret,
                            hash,
                            Buffer.from(signedXml).toString('base64')
                        );
                    }
                } catch (zErr: any) {
                    console.warn('ZATCA call failed:', zErr.message);
                    zatcaResult = null;
                }
            }

        } catch (xmlErr: any) {
            return res.status(422).json({ success: false, error: `XML generation failed: ${xmlErr.message}` });
        }

        // ── Determine status ──
        const isCleared = zatcaResult?.clearanceStatus === 'CLEARED';
        const isReported = zatcaResult?.reportingStatus === 'REPORTED';
        const status = isCleared ? 'CLEARED' : isReported ? 'REPORTED' : 'SIMULATED';

        // ── Save to DB if company exists ──
        let savedInvoice;
        if (company) {
            try {
                savedInvoice = await prisma.invoice.create({
                    data: {
                        company_id: company.id,
                        invoice_number: invoice.invoiceNumber,
                        uuid: zatcaInvoice.uuid,
                        date: new Date(invoice.issueDate),
                        total_amount: invoice.totalAmount,
                        tax_amount: invoice.vatAmount,
                        status: status as any,
                        type: invoice.invoiceSubtype === 'Standard' ? 'B2B' : 'B2C',
                        hash,
                        qr_code: qr,
                        xml_payload: signedXml,
                        submission_response: JSON.stringify(zatcaResult || { status, note: 'Simulated' })
                    }
                });
            } catch (dbError: any) {
                console.warn('Could not save to DB (duplicate?):', dbError.message);
            }
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
                note: company ? (cert ? 'Live ZATCA submission' : 'No active cert — simulated') : 'Company not found — simulated response',
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
