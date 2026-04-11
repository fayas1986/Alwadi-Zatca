import { Router } from 'express';
import { generateCSR, signInvoice, validateInvoice } from '../services/sdkService.js';
import { onboardCompliance, requestProductionCSID, reportInvoice, clearInvoice, checkCompliance, renewProductionCSID } from '../services/zatcaService.js';
import { generateInvoiceXML } from '../services/xmlService.js';
import { reflectStatusToERP } from '../services/integrationService.js';
import reportsRouter from './reports.js';
import QueueService from '../services/queueService.js';
import { NotificationService } from '../services/notificationService.js';
import prisma from '../lib/prisma.js';
import { SecurityService } from '../services/securityService.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { AuditService } from '../services/auditService.js';
import { invoice_status } from '@prisma/client';

const router = Router();

// Helper for logging onboarding activity
// Helper: Mask sensitive data for logs
const mask = (str: string | null) => {
    if (!str) return 'N/A';
    return str.substring(0, 4) + '****' + str.substring(str.length - 4);
};

// OPT 1: Clock Drift Check
const checkClockDrift = async () => {
    try {
        const response = await fetch('http://worldtimeapi.org/api/timezone/Asia/Riyadh');
        const data = await response.json();
        const externalTime = new Date(data.datetime).getTime();
        const localTime = Date.now() + (3 * 60 * 60 * 1000); // KSA Offset
        const drift = Math.abs(externalTime - localTime);

        if (drift > 5000) { // 5 seconds
            await NotificationService.alert({
                title: 'CRITICAL: Clock Drift Detected',
                message: `Server clock is out of sync with KSA time by ${Math.round(drift / 1000)} seconds. This WILL cause ZATCA rejections.`,
                severity: 'CRITICAL'
            });
        } else {
            console.log(`[System] Clock drift check passed. Drift: ${drift}ms`);
        }
    } catch (error) {
        console.warn('[System] Failed to check clock drift:', error);
    }
};

// Run check on startup
// checkClockDrift();

// Helper: Log activity with security masking
const logActivity = async (action: string, status: 'Success' | 'Failure', details: string, resourceId?: string, metadata?: any) => {
    // Mask metadata if it contains sensitive keys
    const maskedMetadata = metadata ? { ...metadata } : {};
    if (maskedMetadata.secret) maskedMetadata.secret = mask(maskedMetadata.secret);
    if (maskedMetadata.privateKey) maskedMetadata.privateKey = mask(maskedMetadata.privateKey);
    if (maskedMetadata.bst) maskedMetadata.bst = mask(maskedMetadata.bst);

    try {
        await AuditService.log({
            action,
            category: 'Compliance',
            user: 'System',
            role: 'SYSTEM',
            ipAddress: '127.0.0.1',
            details,
            status,
            resourceId,
            metadata: maskedMetadata
        });
    } catch (e) {
        console.error('Failed to log activity:', e);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/zatca/validate  — validate an XML invoice using ZATCA SDK
// ─────────────────────────────────────────────────────────────────────────────
router.post('/validate', async (req, res) => {
    try {
        const { xml, environment } = req.body;
        if (!xml) {
            return res.status(400).json({ success: false, error: 'Missing XML content' });
        }

        const isSimulation = environment?.toLowerCase() === 'simulation';
        const result = await validateInvoice(xml, isSimulation);
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

/**
 * @swagger
 * /api/zatca/ping/{env}:
 *   get:
 *     summary: real-time ZATCA environment reachability check
 *     tags: [ZATCA - Utilities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: env
 *         required: true
 *         schema:
 *           type: string
 *           enum: [sandbox, simulation, production]
 *         description: The ZATCA environment to ping.
 *     responses:
 *       200:
 *         description: Reachability status
 */
router.get('/ping/:env', async (req, res) => {
    // ─── Security: Ping utility used by portal and external ERPs ───
    const authHeader = req.headers['authorization'] || '';
    const apiKey = authHeader.replace(/^Bearer\s+/i, '');

    // Allow portal requests (without apiKey) to check reachability
    if (apiKey) {
        console.log(`[ZATCA Ping] Authorized ping request received.`);
    } else {
        console.log(`[ZATCA Ping] Public/Portal ping request received.`);
    }

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

        const userRole = req.headers['x-user-role'];
        const userEmail = req.headers['x-user-email'] as string;

        const where: any = { company_id: parseInt(companyId as string) };
        
        // If not SUPER_ADMIN, verify ownership OR membership
        if (userRole !== 'SUPER_ADMIN' && userEmail) {
            const user = await prisma.user.findUnique({ where: { email: userEmail } });
            if (!user) return res.status(403).json({ error: 'User not found' });

            where.company = {
                OR: [
                    { user: { email: userEmail } },
                    { registered_name: user.company_name || '___NEVER_MATCH___' }
                ]
            };
        }

        const certificates = await prisma.certificate.findMany({
            where,
            orderBy: { created_at: 'desc' }
        });

        // Map to frontend interface if needed
        const mappedCerts = certificates.map((c: any) => ({
            id: c.id.toString(),
            branchId: `br-${c.company_id}`, // Mock branch mapping
            commonName: c.common_name || (c.type === 'PRODUCTION' ? 'Production Cert' : (c.type === 'SIMULATION' ? 'Simulation Cert' : 'Sandbox Cert')),
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
        zatcaResponse: (() => {
            if (!inv.submission_response) return null;
            try {
                return typeof inv.submission_response === 'string' 
                    ? JSON.parse(inv.submission_response) 
                    : inv.submission_response;
            } catch (e) {
                console.warn(`[ZATCA API] Failed to parse submission_response for invoice ${inv.id}:`, e);
                return { status: 'ERROR', message: 'Malformed ZATCA response stored in DB' };
            }
        })(),
        supplier: {
            name: inv.company.registered_name,
            vatNumber: inv.company.vat_number,
            address: {
                streetName: inv.company.street_name || inv.company.address || '',
                buildingNumber: inv.company.building_number || '',
                citySubdivisionName: inv.company.city_subdivision || '',
                cityName: inv.company.city || '',
                postalZone: inv.company.postal_zone || '',
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
        items: inv.metadata?.items || [],
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
        const userRole = req.headers['x-user-role'];
        const userEmail = req.headers['x-user-email'] as string;

        console.log(`[ZATCA API] Fetching invoices. CompanyID: ${companyId}, Role: ${userRole}, Email: ${userEmail}`);

        if (!companyId) {
            return res.status(400).json({ error: 'companyId is required' });
        }

        const where: any = { company_id: parseInt(companyId as string) };

        // If not SUPER_ADMIN, verify ownership OR membership
        if (userRole !== 'SUPER_ADMIN' && userEmail && userEmail.trim() !== '' && userEmail !== 'undefined') {
            console.log(`[ZATCA API] Applying membership-aware filter for email: ${userEmail}`);
            const user = await prisma.user.findUnique({ where: { email: userEmail } });
            if (!user) {
                console.warn(`[ZATCA API] User not found for email ${userEmail}. Returning empty list.`);
                return res.json([]);
            }

            where.company = {
                OR: [
                    { user: { email: userEmail } },
                    { registered_name: user.company_name || '___NEVER_MATCH___' }
                ]
            };
        } else {
            console.log(`[ZATCA API] NO ownership filter applied (Role: ${userRole}, Email: ${userEmail})`);
        }

        const invoices = await prisma.invoice.findMany({
            where,
            orderBy: { date: 'desc' },
            include: {
                company: {
                    include: { user: true }
                },
                customer: true
            }
        });

        const mappedInvoices = invoices.map(mapInvoiceToFrontend);

        console.log(`[ZATCA API] Returning ${mappedInvoices.length} invoices for company ${companyId}. (Total DB count for company: ${invoices.length})`);
        if (mappedInvoices.length === 0) {
            console.log(`[ZATCA API] No invoices found for CompanyID: ${companyId}. Query details: ${JSON.stringify(where)}`);
        }
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
        console.log(`[ZATCA API] Fetching invoice with ID/UUID: ${id}`);
        
        // Handle UUID vs Integer ID
        const isUuid = id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        console.log(`[ZATCA API] Detected as UUID: ${!!isUuid}`);
        
        const userRole = req.headers['x-user-role'];
        const userEmail = req.headers['x-user-email'] as string;

        const where: any = isUuid ? { uuid: id } : { id: parseInt(id) };

        // If not SUPER_ADMIN, verify ownership OR membership
        if (userRole !== 'SUPER_ADMIN' && userEmail) {
            const user = await prisma.user.findUnique({ where: { email: userEmail } });
            if (!user) return res.status(403).json({ error: 'User not found' });

            where.company = {
                OR: [
                    { user: { email: userEmail } },
                    { registered_name: user.company_name || '___NEVER_MATCH___' }
                ]
            };
        }

        const invoice = await prisma.invoice.findFirst({
            where,
            include: {
                company: true,
                customer: true
            }
        });

        if (!invoice) {
            console.warn(`[ZATCA API] Invoice not found: ${id}`);
            return res.status(404).json({ error: 'Invoice not found' });
        }

        console.log(`[ZATCA API] Successfully found invoice: ${invoice.invoice_number} (DB ID: ${invoice.id})`);

        res.json(mapInvoiceToFrontend(invoice));
    } catch (error: any) {
        console.error('Error fetching invoice detail:', error);
        res.status(500).json({ error: 'Failed to fetch invoice details' });
    }
});

router.post('/onboard', async (req, res) => {
    const { 
        vat, otp, companyName, commonName, branchName, 
        location, industry, invoiceType, serialNumber, tin,
        buildingNumber, streetName, citySubdivision, postalZone, city
    } = req.body;
    
    // ENT: Normalize environment for case-insensitivity
    const rawEnv = req.body.environment || 'Simulation';
    const environment = rawEnv.charAt(0).toUpperCase() + rawEnv.slice(1).toLowerCase();

    const userEmail = (req.headers['x-user-email'] as string) || 'portal-user';
    const userRole = (req.headers['x-user-role'] as string) || 'USER';
    const ipAddress = req.ip || 'unknown';

    console.log(`[ZATCA Onboard] New request: Env=${environment}, VAT=${vat}, TIN=${tin}`);

    // HARD BYPASS FOR SIMULATION: If environment is simulation, we don't even need to wait for real logic
    if (environment === 'Simulation') {
        console.log(`[ZATCA Onboard] HARD BYPASS TRIGGERED for Simulation mode.`);
        // Note: The rest of the function below also has 'Simulation' checks, 
        // but this early log confirms we hit this route correctly.
    }

    // ENT: Basic Validation
    if (!vat || vat.length !== 15) {
        return res.status(400).json({ success: false, error: 'VAT Number must be exactly 15 digits.' });
    }
    if (environment !== 'Simulation' && (!otp || otp.length !== 6)) {
        return res.status(400).json({ success: false, error: 'OTP must be exactly 6 digits for Sandbox/Production.' });
    }

    const logActivity = async (action: string, status: 'Success' | 'Failure' | 'Warning', details: string, metadata: any = {}) => {
        await AuditService.log({
            action,
            category: 'Compliance',
            user: userEmail,
            role: userRole,
            ipAddress,
            details,
            status,
            resourceId: vat,
            metadata: { ...metadata, environment }
        });
    };

    try {
        await logActivity('Onboarding Started', 'Success', `Initiating onboarding for ${companyName} in ${environment} mode.`);

        // Use a clean numeric TIN/VAT to avoid SDK validation failures 
        // especially when users enter placeholders like "3000XXXXXX"
        const orgIdentifier = (tin && /^\d+$/.test(tin)) ? tin : vat;

        // Organization Unit (OU) must be carefully formatted.
        const orgUnit = branchName || companyName || 'Main';

        const formattedSerial = serialNumber?.includes('|')
            ? serialNumber
            : `1-ZatcaConnect|2-Desktop|3-${serialNumber || crypto.randomUUID()}`;

        const csrConfig = `csr.common.name=${commonName || companyName}
csr.serial.number=${formattedSerial}
csr.organization.identifier=${orgIdentifier}
csr.organization.unit.name=${orgUnit}
csr.organization.name=${companyName}
csr.country.name=SA
csr.invoice.type=${invoiceType || '1100'}
csr.location.address=${location || 'Riyadh'}
csr.industry.business.category=${industry || 'IT'}`;

        let csr, privateKey;
        if (environment === 'Simulation') {
            console.log(`[ZATCA] Simulation mode active. Mocking CSR and Private Key.`);
            csr = 'MOCK_CSR_CONTENT';
            // Use a mock prefix that the signInvoice service recognizes for bypass
            privateKey = 'MOCK_PRIVATE_KEY_SIM'; 
            await logActivity('CSR Simulated', 'Success', 'Simulation mode: Local CSR and Private Key mocked.');
        } else {
            try {
                const result = await generateCSR(csrConfig, false);
                csr = result.csr;
                privateKey = result.privateKey;
                await logActivity('CSR Generated', 'Success', 'Local CSR and Private Key generated successfully.');
            } catch (err: any) {
                console.error('[ZATCA Onboard] CSR Generation SDK Error:', err.message);
                await logActivity('CSR Generation Failed', 'Failure', `Internal CSR error: ${err.message}`);
                return res.status(500).json({ success: false, error: `CSR Generation Error: ${err.message.substring(0, 100)}` });
            }
        }

        // 2. Obtain Compliance CSID (The OTP check)
        let complianceResult;
        if (environment === 'Simulation') {
            console.log(`[ZATCA] Simulation mode active. Generating mock Compliance CSID.`);
            complianceResult = {
                binarySecurityToken: `MOCK_COMPLIANCE_BST_${Date.now()}`,
                secret: `MOCK_SECRET_${Date.now()}`,
                requestID: `MOCK_REQ_${Date.now()}`
            };
            await logActivity('Compliance CSID Simulated', 'Success', 'Simulation mode: Mock Compliance CSID generated.');
        } else {
            try {
                complianceResult = await onboardCompliance(environment, csr, otp);
                await logActivity('Compliance CSID Obtained', 'Success', 'Successfully exchanged OTP for Compliance CSID.');
            } catch (err: any) {
                let errorMsg = 'ZATCA Connection Failed';
                if (err.response?.data?.code === 'Invalid-OTP' || (err.response?.status === 401)) {
                    errorMsg = 'Invalid OTP: The provided OTP is expired or invalid.';
                } else if (err.response?.data?.message) {
                    errorMsg = `ZATCA Error: ${err.response.data.message}`;
                }
                await logActivity('Compliance Auth Failed', 'Failure', errorMsg, { raw: err.response?.data });
                return res.status(401).json({ success: false, error: errorMsg, code: err.response?.data?.code });
            }
        }

        const complianceCSID = complianceResult.binarySecurityToken;
        const complianceSecret = complianceResult.secret;

        // 3. Compliance Checks (Signing & Testing)
        try {
            const sampleInvoice = {
                invoiceNumber: 'COMPLIANCE-001',
                uuid: crypto.randomUUID(),
                issueDate: new Date().toISOString(),
                invoiceSubtype: 'Standard',
                documentType: 'Invoice',
                currencyCode: 'SAR',
                supplier: { name: companyName, vatNumber: vat, address: { streetName: 'Test Street', buildingNumber: '1111', citySubdivisionName: 'District', cityName: 'Riyadh', postalZone: '11111', countryCode: 'SA' } },
                customer: { name: 'Test Customer', vatNumber: '300000000000003', address: { streetName: 'Test Street', buildingNumber: '1111', citySubdivisionName: 'District', cityName: 'Riyadh', postalZone: '11111', countryCode: 'SA' } },
                items: [{ name: 'Test Item', quantity: 1, unitPrice: 100, subtotal: 100, taxCategory: 'S', vatRate: 0.15, vatAmount: 15, total: 115 }],
                totalAmount: 115, vatAmount: 15, taxExclusiveAmount: 100
            };

            const xml = generateInvoiceXML(sampleInvoice as any);
            const isSimulation = environment === 'Simulation';
            const { signedXml, hash } = await signInvoice(xml, complianceCSID.trim(), privateKey, isSimulation);
            
            if (environment === 'Simulation') {
                console.log(`[ZATCA] Simulation mode: Skipping real compliance check API.`);
                await logActivity('Compliance Checks Simulated', 'Success', 'Sample invoice signed and local validation passed (Simulation).');
            } else {
                await checkCompliance(environment, complianceCSID, complianceSecret, hash, Buffer.from(signedXml).toString('base64'), sampleInvoice.uuid);
                await logActivity('Compliance Checks Passed', 'Success', 'Sample invoice signed and verified by ZATCA compliance API.');
            }
        } catch (err: any) {
            await logActivity('Compliance Verification Failed', 'Failure', `ZATCA refused the compliance check: ${err.message}`);
            return res.status(400).json({ success: false, error: 'Compliance verification failed. Check your company details and VAT.' });
        }

        // 4. Request Production CSID
        let prodResult;
        if (environment === 'Simulation') {
            console.log(`[ZATCA] Simulation mode: Generating mock Production CSID.`);
            prodResult = {
                binarySecurityToken: `MOCK_PROD_BST_${Date.now()}`,
                secret: `MOCK_PROD_SECRET_${Date.now()}`
            };
            await logActivity('Production CSID Simulated', 'Success', 'Simulation mode: Mock Production CSID generated.');
        } else {
            try {
                prodResult = await requestProductionCSID(environment, complianceCSID, complianceSecret, complianceResult.requestID);
                await logActivity('Production CSID Issued', 'Success', 'Successfully acquired Production CSID and finalized onboarding.');
            } catch (err: any) {
                await logActivity('Production CSID Failed', 'Failure', `Failed to transition to Production CSID: ${err.message}`);
                return res.status(500).json({ success: false, error: 'Onboarding partially successful, but failed to acquire Production CSID.' });
            }
        }

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
                building_number: buildingNumber,
                street_name: streetName,
                city_subdivision: citySubdivision,
                postal_zone: postalZone,
                city: city || location,
                environment: dbEnv,
                user: { connect: { id: user.id } }
            },
            create: {
                vat_number: vat,
                registered_name: companyName,
                branch_name: branchName,
                building_number: buildingNumber,
                street_name: streetName,
                city_subdivision: citySubdivision,
                postal_zone: postalZone,
                city: city || location,
                environment: dbEnv,
                user: { connect: { id: user.id } },
                cr_number: '1234567890'
            }
        });

        const existingCert = await prisma.certificate.findFirst({ 
            where: { 
                company_id: company.id,
                common_name: commonName,
                type: dbEnv
            } 
        });
        
        await (prisma.certificate as any).upsert({
            where: { id: existingCert?.id || 0 },
            update: {
                type: dbEnv, 
                common_name: commonName,
                certificate: prodResult.binarySecurityToken,
                private_key: SecurityService.encrypt(privateKey),
                public_key: '',
                csid: prodResult.binarySecurityToken,
                secret: SecurityService.encrypt(prodResult.secret),
                is_active: true
            },
            create: {
                company: { connect: { id: company.id } },
                type: dbEnv, 
                common_name: commonName,
                certificate: prodResult.binarySecurityToken,
                private_key: SecurityService.encrypt(privateKey),
                public_key: '',
                csid: prodResult.binarySecurityToken,
                secret: SecurityService.encrypt(prodResult.secret),
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
        const currentSecret = SecurityService.decrypt(cert.secret!);

        const newProdResult = await renewProductionCSID(environment, currentCSID, currentSecret, otp);

        await prisma.certificate.update({
            where: { id: cert.id },
            data: {
                certificate: newProdResult.binarySecurityToken,
                csid: newProdResult.binarySecurityToken,
                secret: SecurityService.encrypt(newProdResult.secret),
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
        const { invoice: invoiceData, companyId, vat } = req.body;

        // 1. Find company by ID or VAT
        let company;
        if (companyId) {
            company = await prisma.company.findUnique({
                where: { id: typeof companyId === 'string' ? parseInt(companyId) : companyId },
                include: { certificates: true }
            });
        } else if (vat) {
            company = await prisma.company.findUnique({
                where: { vat_number: vat },
                include: { certificates: true }
            });
        }

        if (!company) return res.status(404).json({ error: 'Company not found' });
        
        const cert = company.certificates.find(c => c.is_active && c.type === company.environment);
        if (!cert) {
            return res.status(400).json({ error: `EGS is not active for ${company.environment}. Please complete onboarding first.` });
        }

        // Expiry Check
        if (cert.expiry_date && new Date(cert.expiry_date) < new Date()) {
            return res.status(401).json({ error: 'Certificate has expired. Please re-onboard.' });
        }

        // 1. Time Skew Handling (UTC to KSA +3)
        // ZATCA requires KSA time. We use UTC+3.
        const nowKsa = new Date(new Date().getTime() + (3 * 60 * 60 * 1000));
        const issueDate = new Date(invoiceData.issueDate);
        
        // Prevent future-dated invoices (allow 5 min buffer for slight clock differences)
        if (issueDate.getTime() > nowKsa.getTime() + (5 * 60 * 1000)) {
            return res.status(400).json({ error: 'Invoice date/time cannot be in the future (Time Skew detected)' });
        }

        // 2. XML Generation (Step 1)
        const xml = await generateInvoiceXML(invoiceData);
        
        // 3. Signing (Step 2)
        const decryptedSecret = SecurityService.decrypt(cert.secret!);
        // signInvoice(xmlContent, certificate, privateKey)
        const isSimulation = company.environment === 'SIMULATION';
        const { signedXml, hash, qr } = await signInvoice(xml, cert.certificate, decryptedSecret, isSimulation);

        // 2. Early Idempotency Check
        const existingInvoice = await prisma.invoice.findFirst({
            where: { company_id: companyId, hash: hash } as any
        });

        if (existingInvoice && (existingInvoice.status === 'CLEARED' || existingInvoice.status === 'REPORTED')) {
            console.log(`[ZATCA API] Idempotency: Invoice already exists with status ${existingInvoice.status}`);
            return res.json(JSON.parse(existingInvoice.submission_response || '{}'));
        }

        // 4. Handle Customer Data if provided (especially for B2C/Simplified)
        let finalCustomerId = null;
        if (invoiceData.customer && invoiceData.customer.name && invoiceData.customer.name !== 'Unknown Customer') {
            try {
                // Simplified lookup/creation by name and company
                let customer = await prisma.customer.findFirst({
                    where: { 
                        company_id: company.id,
                        name: invoiceData.customer.name
                    }
                });

                if (!customer) {
                    customer = await prisma.customer.create({
                        data: {
                            company_id: company.id,
                            name: invoiceData.customer.name,
                            vat_number: invoiceData.customer.vatNumber || null,
                            address: invoiceData.customer.address?.streetName || '',
                            city: invoiceData.customer.address?.cityName || '',
                            country: 'SA'
                        }
                    });
                    console.log(`[ZATCA API] Created new customer record: ${customer.name} (ID: ${customer.id})`);
                } else {
                    // Optional: update existing customer info
                    await prisma.customer.update({
                        where: { id: customer.id },
                        data: {
                            vat_number: invoiceData.customer.vatNumber || customer.vat_number,
                            address: invoiceData.customer.address?.streetName || customer.address,
                            city: invoiceData.customer.address?.cityName || customer.city
                        }
                    });
                }
                finalCustomerId = customer.id;
                console.log(`[ZATCA API] Associated invoice with customer: ${customer.name} (ID: ${customer.id})`);
            } catch (custErr: any) {
                console.warn(`[ZATCA API] Failed to handle customer record: ${custErr.message}`);
            }
        }

        // 5. Ingest/Storage (Initial PENDING state)
        const invoice = await prisma.invoice.create({
            data: {
                company_id: company.id,
                customer_id: finalCustomerId,
                invoice_number: invoiceData.invoiceNumber,
                uuid: invoiceData.uuid,
                date: new Date(invoiceData.issueDate),
                total_amount: invoiceData.totalAmount,
                tax_amount: invoiceData.vatAmount,
                hash: hash,
                previous_invoice_hash: invoiceData.previousHash || null,
                xml_payload: signedXml,
                qr_code: qr,
                status: 'PENDING' as any,
                type: invoiceData.invoiceSubtype === 'Standard' ? 'B2B' : 'B2C',
                submission_response: JSON.stringify({ status: 'PENDING', message: 'Invoice received and awaiting processing' }),
                metadata: {
                    steps: [{ step: 'XML_SIGNED', timestamp: new Date().toISOString() }],
                    clientTime: invoiceData.issueDate,
                    serverTimeKsa: nowKsa.toISOString()
                } as any
            } as any
        });

        // NEW: Reflect Initial PENDING status to ERP
        await reflectStatusToERP(company.id, invoiceData.invoiceNumber, invoice.uuid, 'PENDING');

        let result;
        const isMock = cert.certificate.startsWith('MOCK_') || cert.csid?.startsWith('MOCK_');

        if (isMock) {
            console.log(`[ZATCA] Mock certificate detected for ${company.registered_name}. Bypassing real ZATCA API call.`);
            result = {
                reportingStatus: invoiceData.invoiceSubtype === 'Simplified' ? 'REPORTED' : undefined,
                clearanceStatus: invoiceData.invoiceSubtype === 'Standard' ? 'CLEARED' : undefined,
                validationResults: { status: 'PASS', status_code: 200, messages: [] },
                hash,
                qr,
                note: 'Simulated response for Mock Certificate'
            };
        } else {
            // Sign, then submit
            const result = await (invoiceData.invoiceSubtype === 'Standard' ? clearInvoice : reportInvoice)(
                company.environment as any,
                cert.csid!,
                decryptedSecret,
                hash,
                Buffer.from(signedXml).toString('base64'),
                invoiceData.uuid
            ) as any;

            if (invoiceData.invoiceSubtype === 'Simplified') {
                // ASYNC REPORTING for Simplified Invoices
                await prisma.invoice.update({
                    where: { id: (invoice as any).id },
                    data: {
                        status: 'REPORTED' as any,
                        submission_response: JSON.stringify(result),
                        qr_code: (result as any).qrCode || (qr as any),
                        retry_count: 0
                    } as any
                });

                QueueService.enqueue({
                    invoiceId: invoice.id,
                    companyId: company.id,
                    environment: company.environment!,
                    retryCount: 0
                });

                // NEW: Reflect REPORTED status to ERP for simplified invoices
                await reflectStatusToERP(company.id, invoiceData.invoiceNumber, invoice.uuid, 'REPORTED', result);

                await logActivity('Simplified Invoice Queued', 'Success', `B2C Invoice ${invoiceData.invoiceNumber} added to background reporting queue.`);

                return res.json({ 
                    reportingStatus: 'REPORTED',
                    clearanceStatus: undefined,
                    validationResults: { status: 'PASS', status_code: 202, messages: ['Invoice enqueued for reporting'] },
                    hash,
                    qr,
                    id: invoice.id,
                    uuid: invoice.uuid,
                    isQueued: true
                });
            }
        }

        const submissionStatus = (result.reportingStatus === 'REPORTED' || result.clearanceStatus === 'CLEARED')
            ? (result.clearanceStatus === 'CLEARED' ? 'CLEARED' : 'REPORTED')
            : 'FAILED';

        const savedInvoice = await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                status: submissionStatus as any,
                submission_response: JSON.stringify(result),
                qr_code: result.qrCode || qr,
                retry_count: 0
            } as any
        });

        // NEW: Reflect FINAL status to ERP
        await reflectStatusToERP(company.id, invoiceData.invoiceNumber, savedInvoice.uuid, submissionStatus, result);

        await AuditService.log({
            action: invoiceData.invoiceSubtype === 'Standard' ? 'Standard Invoice Cleared' : 'Simplified Invoice Reported',
            category: 'Compliance',
            user: 'System',
            role: 'TAX_OFFICER',
            ipAddress: req.ip || '127.0.0.1',
            details: `${invoice.type} ${invoice.invoice_number} reported successfully`,
            status: 'Success',
            resourceId: invoice.invoice_number,
            metadata: {
                invoiceUuid: invoice.uuid,
                zatcaResponse: result
            }
        });

        console.log(`[ZATCA API] Invoice saved to DB with ID: ${savedInvoice.id} and UUID: ${savedInvoice.uuid}`);
        res.json({ ...result, signedXml, qr, id: savedInvoice.id, uuid: savedInvoice.uuid });
    } catch (error: any) {
        console.error('Invoice Reporting Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /dlq/reprocess/:invoiceId - Reprocess a failed invoice
router.post('/dlq/reprocess/:invoiceId', async (req, res) => {
    const { invoiceId } = req.params;

    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: parseInt(invoiceId) }
        });

        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        
        // EDGE 1: Reprocess Safety Lock
        const status = (invoice.status as any);
        if (status !== 'DLQ' && status !== 'FAILED') {
            return res.status(400).json({ error: `Safety Lock: Only DLQ or FAILED invoices can be reprocessed. Current: ${status}` });
        }

        // Reset and Requeue
        await prisma.invoice.update({
            where: { id: parseInt(invoiceId) },
            data: { 
                status: 'PENDING' as any,
                retry_count: 0,
                next_attempt_at: null
            } as any
        });

        await QueueService.enqueue({
            invoiceId: invoice.id,
            companyId: invoice.company_id,
            environment: 'PRODUCTION', // Re-fetch environment in queue
            retryCount: 0
        });

        // NEW: Reflect PENDING status to ERP when re-processed from DLQ
        await reflectStatusToERP(invoice.company_id, invoice.invoice_number, invoice.uuid, 'PENDING');

        await logActivity('DLQ Reprocess Initiated', 'Success', `Invoice ${invoice.invoice_number} re-queued from ${invoice.status}`, invoice.invoice_number);
        
        res.json({ message: 'Invoice re-queued successfully', status: 'PENDING' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /metrics/sla - SLA Dashboard Data
router.get('/metrics/sla', async (req, res) => {
    try {
        const invoices = await (prisma.invoice as any).findMany({
            where: {
                status: { in: ['REPORTED' as any, 'CLEARED' as any] as any } as any,
                metadata: { not: null as any }
            } as any,
            select: { metadata: true } as any
        }) as any[];

        const metrics = invoices
            .map(inv => (inv as any).metadata?.performance)
            .filter(p => p && p.time_to_sign_ms && p.time_to_submit_ms);

        if (metrics.length === 0) {
            return res.json({ average_sign_ms: 0, average_submit_ms: 0, count: 0 });
        }

        const avgSign = metrics.reduce((acc, m) => acc + m.time_to_sign_ms, 0) / metrics.length;
        const avgSubmit = metrics.reduce((acc, m) => acc + m.time_to_submit_ms, 0) / metrics.length;

        res.json({
            average_sign_ms: Math.round(avgSign),
            average_submit_ms: Math.round(avgSubmit),
            total_processed: metrics.length,
            target_sla_ms: 2000,
            compliance_rate: (avgSign + avgSubmit < 2000 ? '100%' : '90%') // Simple logic
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// PATCH /companies/:id/deactivate - Soft Delete
router.patch('/companies/:id/deactivate', async (req, res) => {
    const { id } = req.params;
    try {
        await (prisma.company as any).update({
            where: { id: parseInt(id) },
            data: { is_active: false }
        });
        await logActivity('Company Deactivated', 'Success', `Soft delete applied to company ID ${id}`, id);
        res.json({ message: 'Company deactivated successfully (soft delete)' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
