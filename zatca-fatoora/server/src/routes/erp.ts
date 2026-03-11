
import { Router, Request, Response } from 'express';
import { fetchAndProcessInvoices } from '../services/integrationService';
import { PrismaClient } from '@prisma/client';
import { generateInvoiceXML } from '../services/xmlService';
import { signInvoice } from '../services/sdkService';
import { reportInvoice, clearInvoice } from '../services/zatcaService';
import { decrypt } from '../utils/crypto';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

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

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/erp/invoices/submit  — API Simulator / external ERP invoice push
//
//  Header:  Authorization: Bearer <api-key>
//  Body:    { invoiceNumber, invoiceSubtype, issueDate, totalAmount,
//             vatAmount, taxExclusiveAmount, currencyCode,
//             items[], customer{}, supplier{} }
// ─────────────────────────────────────────────────────────────────────────────
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
            if (cert?.csid) {
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
                } catch {
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

    } catch (error: any) {
        console.error('ERP Invoice Submit Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
