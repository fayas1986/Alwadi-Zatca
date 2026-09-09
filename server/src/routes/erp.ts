import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { fetchAndProcessInvoices, reflectStatusToERP } from '../services/integrationService.js';
import { generateInvoiceXML } from '../services/xmlService.js';
import { signInvoice } from '../services/sdkService.js';
import { reportInvoice, clearInvoice } from '../services/zatcaService.js';
import { SecurityService } from '../services/securityService.js';
import prisma from '../lib/prisma.js';
import { AuditService } from '../services/auditService.js';
import { parseInvoiceDate } from '../utils/dateUtils.js';
import { InvoiceService } from '../services/invoiceService.js';
import { calculateInvoiceTotals, injectComplianceFields } from '../utils/api-helpers.js';
import { getSafeString } from '../utils/stringUtils.js';

const router = Router();


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

        const authString = Array.isArray(authHeader) ? authHeader[0] : (authHeader || '');
        const results = await fetchAndProcessInvoices(sourceUrl, authString, vat);

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

        let cleanCompanyId = getSafeString(companyId);
        if (cleanCompanyId.startsWith('br-')) {
            cleanCompanyId = cleanCompanyId.replace('br-', '');
        }

        const configs = await prisma.erp_configuration.findMany({
            where: { company_id: parseInt(cleanCompanyId) }
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
        const { companyId, type, baseUrl, apiKey, syncInterval, environment, name, certificateId } = req.body;
        console.log(`[ERP Config] Creating config for Company: ${companyId}, Name: ${name}, Type: ${type}, Env: ${environment}`);

        if (!companyId || !type || !baseUrl) {
            return res.status(400).json({ success: false, error: 'companyId, type and baseUrl are required' });
        }

        let cleanCompanyId = getSafeString(companyId);
        if (cleanCompanyId.startsWith('br-')) {
            cleanCompanyId = cleanCompanyId.replace('br-', '');
        }

        // Check for existing active configuration with same URL and Environment for this company
        const existingConfig = await prisma.erp_configuration.findFirst({
            where: {
                company_id: parseInt(cleanCompanyId),
                base_url: baseUrl,
                environment: environment || 'PRODUCTION',
                is_active: true
            }
        });

        if (existingConfig) {
            return res.status(400).json({ 
                success: false, 
                error: `An active configuration already exists for this URL in the ${environment || 'PRODUCTION'} environment.` 
            });
        }

        const config = await (prisma as any).erp_configuration.create({
            data: {
                company_id: parseInt(cleanCompanyId),
                name: name || `${type} Connection`,
                type,
                base_url: baseUrl,
                api_key: apiKey,
                environment: environment || 'PRODUCTION',
                sync_interval: syncInterval || 30,
                certificate_id: certificateId ? parseInt(certificateId) : null
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
//  GET /api/erp/sync-all  — trigger a sync for all active configs (Cron Job)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sync-all', async (req: Request, res: Response) => {
    try {
        // Security check: Only allow Vercel Cron or a defined CRON_SECRET
        const isVercelCron = req.headers['x-vercel-cron'] === '1';
        const cronSecret = process.env.CRON_SECRET;
        const hasValidSecret = cronSecret && req.headers['authorization'] === `Bearer ${cronSecret}`;

        if (!isVercelCron && !hasValidSecret && process.env.NODE_ENV === 'production') {
            console.error('[Sync All] Unauthorized sync-all attempt blocked.');
            return res.status(401).json({ success: false, error: 'Unauthorized manual cron trigger' });
        }

        console.log('[Sync All] Automated ERP sync-all triggered...');
        const syncService = (await import('../services/syncService.js')).default;
        
        // This is fire-and-forget to avoid lambda timeout, 
        // OR we can await it if we increase Vercel's function timeout.
        // For standard cron, we await it.
        await syncService.runSync();

        res.json({ 
            success: true, 
            message: `Global sync completed successfully.`,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('Global Sync Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/erp/sync/:id  — trigger a manual sync
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sync/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        console.log(`Manual ERP sync triggered for config ${id}`);

        const syncService = (await import('../services/syncService.js')).default;
        const results = await syncService.runSync(id as string);

        if (results && results.status === 'rejected') {
            return res.status(429).json({ success: false, error: results.message });
        }

        res.json({ 
            success: true, 
            message: `Sync completed.`,
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
        const authHeader = req.headers['authorization'];
        const authString = Array.isArray(authHeader) ? authHeader[0] : (authHeader || '');
        const apiKey = authString.replace(/^Bearer\s+/i, '');
        const idempotencyKey = req.headers['idempotency-key'] as string;

        console.log(`[ERP Push] Request: ${req.method} ${req.originalUrl}`);
        console.log(`[ERP Push] API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING'}`);

        if (!apiKey) {
            return res.status(401).json({ success: false, error: 'Missing Authorization header' });
        }

        const rawBody = req.body || {};
        
        // Extract invoice number from any D365 or external ERP field name
        const invNum = rawBody.invoiceNumber || rawBody.invoice_number || rawBody.InvoiceNumber || 
                       rawBody.Invoice || rawBody.InvoiceId || rawBody.InvoiceNum || rawBody.CustInvoiceId || 
                       rawBody.FreeTextInvoiceNumber || rawBody.id || rawBody.number || rawBody.Header?.InvoiceNumber || 
                       rawBody.Header?.InvoiceId || rawBody.Header?.Invoice;

        const issueDt = rawBody.issueDate || rawBody.issue_date || rawBody.IssueDate || rawBody.InvoiceDate || 
                        rawBody.date || rawBody.Date || rawBody.CreatedDateTime || new Date().toISOString();

        const custVat = rawBody.customer?.vatNumber || rawBody.customer_vat || rawBody.CustomerVat || 
                        rawBody.CustVatNum || rawBody.VATNum || rawBody.TaxRegistrationNumber;

        const custName = rawBody.customer?.name || rawBody.customer_name || rawBody.CustomerName || 
                         rawBody.CustomerAccount || rawBody.Customer || 'Customer';

        const parsedItems = rawBody.items || rawBody.invoiceLines || rawBody.InvoiceLines || 
                            rawBody.SalesInvoiceLines || rawBody.FreeTextInvoiceLine || 
                            rawBody.FreeTextInvoiceLines || rawBody.lines || rawBody.Lines || [];

        let itemsArray = Array.isArray(parsedItems) ? parsedItems : [parsedItems];
        if (itemsArray.length === 0) {
            const netAmt = Number(rawBody.taxExclusiveAmount || rawBody.TaxExclusiveAmount || rawBody.NetAmount || rawBody.LineAmount || 
                          (Number(rawBody.totalAmount || rawBody.TotalAmount || rawBody.InvoiceAmount || 0) - Number(rawBody.vatAmount || rawBody.VatAmount || rawBody.TaxAmount || 0)));
            itemsArray = [{
                name: rawBody.Description || rawBody.Note || 'Invoice Item / Service',
                quantity: 1,
                unitPrice: netAmt > 0 ? netAmt : 1000.00,
                vatRate: 0.15,
                taxCategory: 'S'
            }];
        }

        const normalized = {
            ...rawBody,
            invoiceNumber: invNum,
            issueDate: issueDt,
            invoiceSubtype: (rawBody.invoiceSubtype || rawBody.invoice_subtype || rawBody.InvoiceSubtype || rawBody.InvoiceType || (custVat ? 'STANDARD' : 'SIMPLIFIED')).toString().toUpperCase(),
            documentType: (rawBody.documentType || rawBody.document_type || rawBody.DocumentType || rawBody.type || 'INVOICE').toString().toUpperCase().replace(/\s+/g, '_'),
            customer: rawBody.customer || {
                name: custName,
                vatNumber: custVat || '',
                address: {
                    streetName: rawBody.CustomerStreet || rawBody.Street || 'King Fahd Road',
                    buildingNumber: rawBody.CustomerBuilding || rawBody.Building || '2222',
                    cityName: rawBody.CustomerCity || rawBody.City || 'RIYADH',
                    postalZone: rawBody.CustomerPostalCode || rawBody.PostalCode || '12211',
                    countryCode: rawBody.CustomerCountry || rawBody.Country || 'SA'
                }
            },
            items: itemsArray
        };

        const invoice = calculateInvoiceTotals(normalized);
        console.log('[DEBUG] Invoice after calculateInvoiceTotals:', JSON.stringify(invoice, null, 2));
        const parsedDate = parseInvoiceDate(invoice.issueDate);
        
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
        const required = ['invoiceNumber', 'invoiceSubtype', 'issueDate'];
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

        if (erpConfig) {
            console.log(`[ERP Push] Auth Success: Config ID ${erpConfig.id} (Company: ${erpConfig.company.registered_name})`);
        } else {
            console.warn(`[ERP Push] Auth Failed: No configuration found for API Key ${apiKey ? apiKey.substring(0, 8) + '...' : 'N/A'}`);
        }

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

        // ── 0. Auto-populate Supplier (ZATCA Data Normalization) ──
        if (!invoice.supplier) {
            invoice.supplier = {
                name: company.registered_name,
                registrationName: company.registered_name,
                vatNumber: company.vat_number,
                crNumber: company.cr_number,
                address: {
                    streetName: company.street_name || 'Main Street',
                    buildingNumber: company.building_number || '0000',
                    cityName: company.city || 'Riyadh',
                    postalZone: company.postal_zone || '00000',
                    citySubdivision: company.city_subdivision || company.city || 'Riyadh',
                    countryCode: company.country || 'SA'
                }
            };
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
        const zatcaInvoice = injectComplianceFields(invoice, invoice.invoiceSubtype || 'Simplified');
        
        // Final overrides for ZATCA logic
        zatcaInvoice.issueDate = parsedDate.toISOString();
        zatcaInvoice.previousInvoiceHash = pih;
        zatcaInvoice.taxCategory = zatcaInvoice.taxCategory || (zatcaInvoice.items?.[0]?.taxCategory || 'S');
        zatcaInvoice.documentType = zatcaInvoice.documentType || 'Invoice';

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

            if (!cert) {
                throw new Error("No active certificate found for this company/environment.");
            }

            let certPem = cert.certificate;
            const privateKey = SecurityService.decrypt(cert.private_key);
            const secret = cert.secret ? SecurityService.decrypt(cert.secret) : '';

            if (certPem.includes('BEGIN CERTIFICATE')) {
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
            } catch (signErr: any) {
                console.error('[ERP Push] Signing Error:', signErr.message);
                throw new Error(`Invoice signing failed: ${signErr.message}`);
            }

            // ── ZATCA Report / Clear ──
            const normalizedEnv = targetEnv.toString().toLowerCase();
            if (cert?.csid) {
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
                    console.error(`ZATCA call failed for ${normalizedEnv}:`, zErr.message);
                    throw zErr;
                }
            } else {
                throw new Error("No active CSID found for ZATCA submission.");
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
            savedInvoice = await InvoiceService.createInvoice({
                company_id: company.id,
                invoice_number: invoice.invoiceNumber,
                uuid: zatcaInvoice.uuid,
                date: parsedDate,
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
                }),
                items: zatcaInvoice.items,
                customer: invoice.customer,
                metadata: {
                    erp_raw: invoice
                }
            });


            // NEW: Reflect status to ERP
            const erpStatus = status === 'SIMULATED' ? 'reported' : (isCleared ? 'cleared' : (isReported ? 'reported' : 'rejected'));
            await reflectStatusToERP(company.id, invoice.invoiceNumber, zatcaInvoice.uuid, erpStatus, zatcaResult);

            // Compliance Audit Log with full XML payload
            AuditService.log({
                action: 'ZATCA Compliance Submission',
                category: 'Compliance',
                user: 'External ERP API',
                role: 'IT_ADMIN',
                ipAddress: req.ip || '127.0.0.1',
                details: `Invoice ${invoice.invoiceNumber} submitted and ${status}`,
                status: 'Success',
                resourceId: String(savedInvoice.id),
                payload: signedXml || undefined,
                metadata: {
                    invoice_number: invoice.invoiceNumber,
                    uuid: zatcaInvoice.uuid,
                    zatca_status: status
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

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/erp/config/:id  — remove an ERP configuration
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/config/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        console.log(`[ERP Config] Deleting config ID: ${id}`);

        if (!id) {
            return res.status(400).json({ success: false, error: 'Config ID is required' });
        }

        // Use any and explicit include to ensure we get company data
        const config = await (prisma.erp_configuration as any).findUnique({
            where: { id: id },
            include: { company: true }
        });

        if (!config) {
            return res.status(404).json({ success: false, error: 'Configuration not found' });
        }

        await (prisma.erp_configuration as any).delete({
            where: { id: id }
        });

        // Audit Log for Disconnection
        await AuditService.log({
            action: 'ERP Disconnected',
            category: 'Operational',
            user: 'System', 
            role: 'IT_ADMIN',
            ipAddress: getSafeString(req.ip || '127.0.0.1'),
            details: `ERP System "${config.name || 'External ERP'}" disconnected for VAT ${config.company?.vat_number || 'Unknown'}`,
            status: 'Success',
            resourceId: String(id),
            metadata: {
                configName: config.name,
                configType: config.type,
                vat: config.company?.vat_number
            }
        });

        res.json({ success: true, message: 'ERP Configuration deleted successfully' });

    } catch (error: any) {
        console.error('ERP Delete Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mock Server for Real-time Testing
router.get('/mock-server', (req, res) => {
    res.json({
        status: 'success',
        invoices: [
            {
                invoiceNumber: 'SIM-MOCK-001',
                issueDate: '2026-06-07',
                invoiceSubtype: 'Simplified',
                totalAmount: 115.00,
                vatAmount: 15.00,
                customer: { name: 'Realtime Test Client', city: 'Riyadh' },
                items: [
                    { name: 'Simulated Goods', quantity: 1, unitPrice: 100.00, taxAmount: 15.00, totalAmount: 115.00 }
                ]
            }
        ]
    });
});

// NEW: Status Update Receiver Mock for Real-time Testing
router.post('/mock-server/invoices/status', (req, res) => {
    const { invoiceNumber, uuid, status, zatcaResponse } = req.body;
    console.log(`[ERP MOCK] Received status update for ${invoiceNumber}: ${status}`);
    console.log(`[ERP MOCK] UUID: ${uuid}`);
    res.json({ success: true, received: { invoiceNumber, status } });
});

export default router;
