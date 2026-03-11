
import { Router } from 'express';
import { getPrisma } from '../lib/prisma';
import { runSync } from '../jobs/syncWorker';

const router = Router();
const prisma = getPrisma();

router.post('/config', async (req, res) => {
    try {
        const { companyId, type, baseUrl, apiKey, username, password, syncInterval } = req.body;

        const config = await prisma.eRPConfig.upsert({
            where: { companyId },
            update: {
                type,
                baseUrl,
                apiKey,
                username,
                password,
                syncInterval: syncInterval || 30,
                isActive: true
            },
            create: {
                companyId,
                type,
                baseUrl,
                apiKey,
                username,
                password,
                syncInterval: syncInterval || 30
            }
        });

        res.json({ success: true, data: config });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/sync', async (req, res) => {
    try {
        await runSync();
        res.json({ success: true, message: 'Sync triggered successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/invoices/submit', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ success: false, error: 'Missing Authorization header' });
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        const config = await prisma.eRPConfig.findFirst({
            where: { apiKey, isActive: true },
            include: { company: true }
        });

        if (!config) {
            return res.status(401).json({ success: false, error: 'Invalid or inactive API Key' });
        }

        const erpInv = req.body;
        
        // Basic validation
        if (!erpInv.invoiceNumber || !erpInv.totalAmount) {
            return res.status(400).json({ success: false, error: 'Invalid invoice payload' });
        }

        // Check if already exists
        const existing = await prisma.invoice.findUnique({
            where: { invoiceNumber: erpInv.invoiceNumber }
        });
        
        if (existing) {
            return res.status(409).json({ success: false, error: 'Invoice already exists' });
        }

        // Process (Generate XML, Sign, Submit)
        const { generateInvoiceXML, signInvoiceXML } = require('../services/xmlService');
        const { reportInvoice, clearInvoice } = require('../services/zatcaService');
        const { decrypt } = require('../utils/crypto');

        // 1. Generate XML
        const { xml, uuid } = generateInvoiceXML(erpInv as any);

        // 2. Sign
        const privateKey = decrypt(config.company.privateKey!);
        let cert = config.company.productionCSID!;
        if (!cert.includes('BEGIN CERTIFICATE')) {
            cert = `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----`;
        }

        const { signedXml, invoiceHash, qr } = await signInvoiceXML(xml, cert, privateKey);

        // 3. Submit to ZATCA
        const secret = decrypt(config.company.productionSecret!);
        let result;
        if (erpInv.invoiceSubtype === 'Standard') {
            result = await clearInvoice(config.company.environment as any, config.company.productionCSID!, secret, invoiceHash, Buffer.from(signedXml).toString('base64'), uuid);
        } else {
            result = await reportInvoice(config.company.environment as any, config.company.productionCSID!, secret, invoiceHash, Buffer.from(signedXml).toString('base64'), uuid);
        }

        const status = (result.reportingStatus === 'REPORTED' || result.clearanceStatus === 'CLEARED') ? 'Reported' : 'Failed';

        // 4. Save locally
        const savedInvoice = await prisma.invoice.create({
            data: {
                invoiceNumber: erpInv.invoiceNumber,
                issueDate: new Date(erpInv.issueDate),
                totalAmount: erpInv.totalAmount,
                uuid: uuid,
                hash: invoiceHash,
                qrCode: qr || '',
                xml: signedXml,
                status: status,
                zatcaResponse: result,
                companyId: config.companyId
            }
        });

        res.json({ success: true, message: 'Invoice processed successfully', data: savedInvoice, zatcaResponse: result });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
