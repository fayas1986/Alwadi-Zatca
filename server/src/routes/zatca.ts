import { Router } from 'express';
import { generateCSR, signInvoice } from '../services/sdkService.js';
import { onboardCompliance, requestProductionCSID, reportInvoice, clearInvoice, checkCompliance, renewProductionCSID } from '../services/zatcaService.js';
import { generateInvoiceXML } from '../services/xmlService.js';
import { PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import https from 'https';

import { validateInvoice } from '../services/sdkService.js';
import { AuditService } from '../services/auditService.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/zatca/validate  — validate an XML invoice using ZATCA SDK
// ─────────────────────────────────────────────────────────────────────────────
router.post('/validate', async (req, res) => {
    try {
        const { xml } = req.body;
        if (!xml) {
            return res.status(400).json({ success: false, error: 'Missing XML content' });
        }

        const result = await validateInvoice(xml);
        res.json({ success: true, ...result });

    } catch (error: any) {
        console.error('Validation Route Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper to map string environment to Prisma enum
const mapEnv = (env: string) => {
    switch (env.toLowerCase()) {
        case 'simulation': return 'SIMULATION';
        case 'production': return 'PRODUCTION';
        default: return 'SANDBOX';
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/zatca/ping/:env  — real-time ZATCA environment reachability check
//  Returns: { online, latencyMs, host, statusCode, environment, checkedAt }
// ─────────────────────────────────────────────────────────────────────────────
const ZATCA_HOSTS: Record<string, string> = {
    sandbox:    'sandbox.zatca.gov.sa',
    simulation: 'gw-fatoora.zatca.gov.sa',
    production: 'core.zatca.gov.sa'
};

router.get('/ping/:env', async (req, res) => {
    const envKey = req.params.env.toLowerCase();
    const host = ZATCA_HOSTS[envKey];
    console.log(`[ZATCA Ping] Attempting to ping ${envKey} at ${host}...`);

    if (!host) {
        console.warn(`[ZATCA Ping] Unknown environment requested: ${req.params.env}`);
        return res.status(400).json({ success: false, error: `Unknown environment: ${req.params.env}` });
    }

    const start = Date.now();

    const pingHost = (hostname: string): Promise<{ online: boolean; statusCode: number | null; latencyMs: number }> => {
        return new Promise((resolve) => {
            const reqStart = Date.now();
            const pingReq = https.request(
                { hostname, port: 443, path: '/', method: 'HEAD', timeout: 6000 },
                (r) => {
                    // Any HTTP response means the server is REACHABLE (even 4xx/5xx/3xx)
                    resolve({ online: true, statusCode: r.statusCode ?? null, latencyMs: Date.now() - reqStart });
                    r.resume();
                }
            );
            pingReq.on('timeout', () => {
                pingReq.destroy();
                resolve({ online: false, statusCode: null, latencyMs: Date.now() - reqStart });
            });
            pingReq.on('error', (err: any) => {
                // ECONNRESET/ECONNREFUSED → offline; but if we got a response already → online
                resolve({ online: false, statusCode: null, latencyMs: Date.now() - reqStart });
            });
            pingReq.end();
        });
    };

    try {
        const result = await pingHost(host);
        res.json({
            success: true,
            environment: req.params.env,
            host,
            online: result.online,
            latencyMs: result.latencyMs,
            statusCode: result.statusCode,
            checkedAt: new Date().toISOString()
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @swagger
 * /api/zatca/certificates:
 *   get:
 *     summary: List all certificates for a company
 *     tags: [ZATCA - Certificates]
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of certificates
 */
router.get('/certificates', async (req, res) => {
    try {
        const { companyId } = req.query;
        if (!companyId) {
            return res.status(400).json({ error: 'companyId is required' });
        }

        const certificates = await prisma.certificate.findMany({
            where: { company_id: parseInt(companyId as string) },
            orderBy: { created_at: 'desc' }
        });

        // Map to frontend interface if needed
        const mappedCerts = certificates.map(c => ({
            id: c.id.toString(),
            branchId: `br-${c.company_id}`, // Mock branch mapping
            commonName: c.type === 'PRODUCTION' ? 'Production Cert' : (c.type === 'SIMULATION' ? 'Simulation Cert' : 'Sandbox Cert'),
            serialNumber: c.serial_number || 'N/A',
            validFrom: c.created_at.toISOString().split('T')[0],
            validTo: c.expiry_date ? c.expiry_date.toISOString().split('T')[0] : '2099-12-31',
            status: c.is_active ? 'Active' : 'Expired',
            type: c.type === 'PRODUCTION' ? 'Production' : (c.type === 'SIMULATION' ? 'Simulation' : 'Sandbox'),
            hasPrivateKey: !!c.private_key,
            publicKey: c.public_key || ''
        }));

        res.json(mappedCerts);
    } catch (error: any) {
        console.error('Error fetching certificates:', error);
        res.status(500).json({ error: 'Failed to fetch certificates' });
    }
});

// Helper to map DB Invoice to Frontend Invoice interface
const mapInvoiceToFrontend = (inv: any) => {
    // Map DB status (UPPERCASE) to Frontend Status (Sentence Case)
    const mapStatus = (s: string): string => {
        switch (s) {
            case 'CLEARED': return 'Cleared';
            case 'REPORTED': return 'Reported';
            case 'FAILED': return 'Failed';
            case 'SUBMITTED': return 'Reported'; // Map submitted to reported for UI
            default: return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        }
    };

    return {
        id: inv.id.toString(),
        branchId: `br-${inv.company_id}`,
        uuid: inv.uuid,
        invoiceNumber: inv.invoice_number,
        issueDate: inv.date.toISOString(),
        supplyDate: inv.date.toISOString(),
        invoiceSubtype: inv.type === 'B2B' ? 'Standard' : 'Simplified',
        documentType: 'Invoice',
        totalAmount: Number(inv.total_amount),
        vatAmount: Number(inv.tax_amount),
        taxExclusiveAmount: Number(inv.total_amount) - Number(inv.tax_amount),
        status: mapStatus(inv.status || 'REPORTED'),
        qrCode: inv.qr_code,
        xmlContent: inv.xml_payload,
        zatcaResponse: inv.submission_response ? JSON.parse(inv.submission_response) : null,
        supplier: {
            name: inv.company.registered_name,
            vatNumber: inv.company.vat_number,
            address: {
                streetName: inv.company.address || '',
                cityName: inv.company.city || '',
                countryCode: inv.company.country || 'SA'
            }
        },
        customer: inv.customer ? {
            name: inv.customer.name,
            vatNumber: inv.customer.vat_number || 'N/A',
            address: {
                streetName: inv.company.address || '',
                cityName: inv.company.city || '',
                countryCode: inv.company.country || 'SA'
            }
        } : {
            name: 'Unknown Customer',
            vatNumber: 'N/A',
            address: { streetName: '', cityName: '', countryCode: 'SA' }
        },
        items: [], // Expand later if stored in separate table
        history: [], // Expand later if stored in separate table
        currencyCode: 'SAR'
    };
};

/**
 * @swagger
 * /api/zatca/invoices:
 *   get:
 *     summary: List all invoices for a company
 *     tags: [ZATCA - Invoices]
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of invoices
 */
router.get('/invoices', async (req, res) => {
    try {
        const { companyId } = req.query;
        if (!companyId) {
            return res.status(400).json({ error: 'companyId is required' });
        }

        const invoices = await prisma.invoice.findMany({
            where: { company_id: parseInt(companyId as string) },
            orderBy: { date: 'desc' },
            include: {
                company: true,
                customer: true
            }
        });

        const mappedInvoices = invoices.map(mapInvoiceToFrontend);

        console.log(`[ZATCA API] Returning ${mappedInvoices.length} invoices for company ${companyId}`);
        res.json(mappedInvoices);
    } catch (error: any) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

/**
 * @swagger
 * /api/zatca/invoices/{id}:
 *   get:
 *     summary: Get a specific invoice by ID
 *     tags: [ZATCA - Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice details
 */
router.get('/invoices/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const invoice = await prisma.invoice.findUnique({
            where: { id: parseInt(id as string) },
            include: {
                company: true,
                customer: true
            }
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        res.json(mapInvoiceToFrontend(invoice));
    } catch (error: any) {
        console.error('Error fetching invoice detail:', error);
        res.status(500).json({ error: 'Failed to fetch invoice details' });
    }
});

router.post('/onboard', async (req, res) => {
    try {
        const { vat, otp, environment, companyName, branchName, location, industry, invoiceType, serialNumber } = req.body;

        const formattedSerial = serialNumber?.includes('|')
            ? serialNumber
            : `1-ZatcaConnect|2-Desktop|3-${serialNumber || crypto.randomUUID()}`;

        const csrConfig = `csr.common.name=${companyName}
csr.serial.number=${formattedSerial}
csr.organization.identifier=${vat}
csr.organization.unit.name=${branchName}
csr.organization.name=${companyName}
csr.country.name=SA
csr.invoice.type=${invoiceType || '1100'}
csr.location.address=${location || 'Riyadh'}
csr.industry.business.category=${industry || 'IT'}`;

        const { csr, privateKey } = await generateCSR(csrConfig, environment !== 'Production');

        const complianceResult = await onboardCompliance(environment, csr, otp);
        const complianceCSID = complianceResult.binarySecurityToken;
        const complianceSecret = complianceResult.secret;

        const sampleInvoice = {
            invoiceNumber: 'COMPLIANCE-001',
            uuid: crypto.randomUUID(),
            issueDate: new Date().toISOString(),
            invoiceSubtype: 'Standard',
            documentType: 'Invoice',
            currencyCode: 'SAR',
            supplier: {
                name: companyName,
                vatNumber: vat,
                address: {
                    streetName: 'Test Street',
                    buildingNumber: '1111',
                    citySubdivisionName: 'District',
                    cityName: 'Riyadh',
                    postalZone: '11111',
                    countryCode: 'SA'
                }
            },
            customer: {
                name: 'Test Customer',
                vatNumber: '300000000000003',
                address: {
                    streetName: 'Test Street',
                    buildingNumber: '1111',
                    citySubdivisionName: 'District',
                    cityName: 'Riyadh',
                    postalZone: '11111',
                    countryCode: 'SA'
                }
            },
            items: [{
                name: 'Test Item',
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
                taxCategory: 'S',
                vatRate: 0.15,
                vatAmount: 15,
                total: 115
            }],
            totalAmount: 115,
            vatAmount: 15,
            taxExclusiveAmount: 100
        };

        const xml = generateInvoiceXML(sampleInvoice as any);
        const complianceCertPem = complianceCSID.trim();

        const { signedXml, hash } = await signInvoice(xml, complianceCertPem, privateKey);

        console.log("Running Compliance Check...");
        await checkCompliance(environment, complianceCSID, complianceSecret, hash, Buffer.from(signedXml).toString('base64'), sampleInvoice.uuid);
        console.log("Compliance Check Passed!");

        const prodResult = await requestProductionCSID(
            environment,
            complianceCSID,
            complianceSecret,
            complianceResult.requestID
        );

        let user = await prisma.user.findFirst();
        if (!user) {
            user = await prisma.user.create({
                data: {
                    id: crypto.randomUUID(),
                    email: 'admin@zatca-fatoora.com',
                    company_name: companyName
                }
            });
        }

        const dbEnv = mapEnv(environment) as any;

        const company = await prisma.company.upsert({
            where: { vat_number: vat },
            update: {
                registered_name: companyName,
                branch_name: branchName,
                environment: dbEnv,
                user: { connect: { id: user.id } }
            },
            create: {
                vat_number: vat,
                registered_name: companyName,
                branch_name: branchName,
                environment: dbEnv,
                user: { connect: { id: user.id } },
                cr_number: '1234567890'
            }
        });

        const existingCert = await prisma.certificate.findFirst({ where: { company_id: company.id } });
        await prisma.certificate.upsert({
            where: { id: existingCert?.id || 0 },
            update: {
                type: 'PRODUCTION',
                certificate: prodResult.binarySecurityToken,
                private_key: encrypt(privateKey),
                public_key: '',
                csid: prodResult.binarySecurityToken,
                secret: encrypt(prodResult.secret),
                is_active: true
            },
            create: {
                company: { connect: { id: company.id } },
                type: 'PRODUCTION',
                certificate: prodResult.binarySecurityToken,
                private_key: encrypt(privateKey),
                public_key: '',
                csid: prodResult.binarySecurityToken,
                secret: encrypt(prodResult.secret),
                is_active: true
            }
        });

        await AuditService.log({
            action: 'Solution Onboarded',
            category: 'Compliance',
            user: 'System',
            role: 'IT_ADMIN',
            ipAddress: req.ip || '127.0.0.1',
            details: `Company ${companyName} (${vat}) successfully onboarded to ${environment}`,
            status: 'Success',
            resourceId: vat,
            metadata: {
                companyId: company.id,
                environment
            }
        });

        res.json({ success: true, message: 'Onboarding successful', companyId: company.id });
    } catch (error: any) {
        const errorLog = `
--- ONBOARDING ERROR [${new Date().toISOString()}] ---
Message: ${error.message}
Stack: ${error.stack}
Response Data: ${JSON.stringify(error.response?.data || {}, null, 2)}
---------------------------------------
`;
        fs.appendFileSync(path.join(process.cwd(), 'onboarding_errors.log'), errorLog);

        if (error.response?.data) {
            console.error('ZATCA API Error:', JSON.stringify(error.response.data, null, 2));
            res.status(400).json({ success: false, error: 'ZATCA Onboarding Failed', details: error.response.data });
        } else {
            console.error('Onboarding Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

router.post('/renew', async (req, res) => {
    try {
        const { vat, otp, environment } = req.body;

        const company = await prisma.company.findUnique({
            where: { vat_number: vat },
            include: { certificates: true }
        });

        if (!company) throw new Error('Company not found');

        const cert = company.certificates.find((c: any) => c.is_active);
        if (!cert) throw new Error('Active certificate not found');

        const currentCSID = cert.csid!;
        const currentSecret = decrypt(cert.secret!);

        const newProdResult = await renewProductionCSID(environment, currentCSID, currentSecret, otp);

        await prisma.certificate.update({
            where: { id: cert.id },
            data: {
                certificate: newProdResult.binarySecurityToken,
                csid: newProdResult.binarySecurityToken,
                secret: encrypt(newProdResult.secret),
            }
        });

        res.json({ success: true, message: 'Renewal successful' });
    } catch (error: any) {
        if (error.response?.data) {
            console.error('ZATCA Renewal Error:', JSON.stringify(error.response.data, null, 2));
            res.status(400).json({ success: false, error: 'Renewal Failed', details: error.response.data });
        } else {
            console.error('Renewal Error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

router.post('/invoice/report', async (req, res) => {
    try {
        const { invoice, vat } = req.body;

        const company = await prisma.company.findUnique({
            where: { vat_number: vat },
            include: { certificates: true }
        });

        if (!company) throw new Error('Company not onboarded');
        const cert = company.certificates.find((c: any) => c.is_active && c.type === company.environment);
        if (!cert) {
            console.warn(`No active ${company.environment} certificate found for company ${company.registered_name}`);
            throw new Error(`No active ${company.environment} certificate found. Please onboard the solution for ${company.environment} mode.`);
        }

        const xml = generateInvoiceXML(invoice);
        const decryptedPrivateKey = decrypt(cert.private_key);
        
        let certPem = cert.certificate;
        
        if (certPem.includes('BEGIN CERTIFICATE')) {
            certPem = certPem.replace(/-----BEGIN CERTIFICATE-----/g, '')
                             .replace(/-----END CERTIFICATE-----/g, '')
                             .replace(/\s/g, '');
        } else {
            certPem = certPem.replace(/\s/g, '');
        }

        const { signedXml, hash, qr } = await signInvoice(xml, certPem, decryptedPrivateKey);

        let result;
        const isMock = cert.certificate.startsWith('MOCK_') || cert.csid?.startsWith('MOCK_');

        if (isMock) {
            console.log(`[ZATCA] Mock certificate detected for ${company.registered_name}. Bypassing real ZATCA API call.`);
            result = {
                reportingStatus: invoice.invoiceSubtype === 'Simplified' ? 'REPORTED' : undefined,
                clearanceStatus: invoice.invoiceSubtype === 'Standard' ? 'CLEARED' : undefined,
                validationResults: { status: 'PASS', status_code: 200, messages: [] },
                hash,
                qr,
                note: 'Simulated response for Mock Certificate'
            };
        } else {
            const decryptedSecret = decrypt(cert.secret!);

            if (invoice.invoiceSubtype === 'Standard') {
                result = await clearInvoice(
                    company.environment as any,
                    cert.csid!,
                    decryptedSecret,
                    hash,
                    Buffer.from(signedXml).toString('base64')
                );
            } else {
                result = await reportInvoice(
                    company.environment as any,
                    cert.csid!,
                    decryptedSecret,
                    hash,
                    Buffer.from(signedXml).toString('base64')
                );
            }
        }

        const submissionStatus = (result.reportingStatus === 'REPORTED' || result.clearanceStatus === 'CLEARED')
            ? (result.clearanceStatus === 'CLEARED' ? 'CLEARED' : 'REPORTED')
            : 'FAILED';

        await prisma.invoice.create({
            data: {
                company: { connect: { id: company.id } },
                invoice_number: invoice.invoiceNumber,
                xml_payload: signedXml,
                hash,
                qr_code: qr,
                status: submissionStatus as any,
                date: new Date(invoice.issueDate),
                total_amount: invoice.totalAmount,
                tax_amount: invoice.vatAmount,
                type: invoice.invoiceSubtype === 'Standard' ? 'B2B' : 'B2C',
                submission_response: JSON.stringify(result)
            }
        });

        await AuditService.log({
            action: invoice.invoiceSubtype === 'Standard' ? 'Standard Invoice Cleared' : 'Simplified Invoice Reported',
            category: 'Compliance',
            user: 'System',
            role: 'TAX_OFFICER',
            ipAddress: req.ip || '127.0.0.1',
            details: `${invoice.invoiceType} ${invoice.invoiceNumber} reported successfully`,
            status: 'Success',
            resourceId: invoice.invoiceNumber,
            metadata: {
                invoiceUuid: invoice.uuid,
                zatcaResponse: result
            }
        });

        res.json({ ...result, signedXml, qr });
    } catch (error: any) {
        console.error('Invoice Reporting Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
