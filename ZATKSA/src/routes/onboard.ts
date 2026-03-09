import { Router } from 'express';
import { generateZatcaCSR } from '../services/csrService';
import { onboardCompliance, requestProductionCSID, checkCompliance } from '../services/zatcaService';
import { generateInvoiceXML, signInvoiceXML } from '../services/xmlService';
import { getPrisma } from '../lib/prisma';
import { encrypt } from '../utils/crypto';

import axios from 'axios';

const router = Router();
const prisma = getPrisma();

router.get('/health', async (req, res) => {
    const endpoints = [
        'https://gw-fatoora.zatca.gov.sa/api/v2/compliance',
        'https://core.zatca.gov.sa/api/v2/invoices/reporting/single'
    ];

    const results = await Promise.all(endpoints.map(async (url) => {
        try {
            await axios.get(url, { timeout: 5000 });
            return { url, status: 'Connected', reached: true };
        } catch (error: any) {
            if (error.response) {
                return { url, status: 'Reachable', code: error.response.status, reached: true };
            }
            return { url, status: 'Unreachable', error: error.message, reached: false };
        }
    }));

    res.json({
        success: true,
        zatca_connectivity: results,
        timestamp: new Date().toISOString()
    });
});

router.post('/onboard', async (req, res) => {
    try {
        const { vat, otp, environment, companyName, branchName } = req.body;

        // 1. Generate CSR
        const csrData = {
            commonName: companyName, // Should usually be mapped to something unique like SolutionName
            organizationName: companyName,
            organizationUnitName: branchName,
            countryName: 'SA',
            invoiceType: '1100',
            location: 'Riyadh',
            industry: 'Technology',
            vatNumber: vat
        };

        const { csr, privateKey } = await generateZatcaCSR(csrData);

        // 2. Compliance Request
        const complianceResult = await onboardCompliance(environment, csr, otp);
        const complianceCSID = complianceResult.binarySecurityToken;
        const complianceSecret = complianceResult.secret;

        // 3. Compliance Check (Mandatory)
        // Mock Invoice
        const sampleInvoice = {
            invoiceNumber: 'COMPLIANCE-001',
            issueDate: new Date().toISOString(),
            invoiceSubtype: 'Standard',
            currencyCode: 'SAR',
            taxExclusiveAmount: 100,
            totalAmount: 115,
            supplier: { vatNumber: vat },
            items: [{ name: 'Test', quantity: 1, unitPrice: 100, subtotal: 100 }]
        };

        const { xml, uuid } = generateInvoiceXML(sampleInvoice as any);

        let complianceCert = complianceCSID;
        if (!complianceCert.includes('BEGIN CERTIFICATE')) {
            complianceCert = `-----BEGIN CERTIFICATE-----\n${complianceCert}\n-----END CERTIFICATE-----`;
        }

        const { signedXml, invoiceHash } = await signInvoiceXML(xml, complianceCert, privateKey);

        await checkCompliance(environment, complianceCSID, complianceSecret, invoiceHash, Buffer.from(signedXml).toString('base64'));

        // 4. Production Request
        const prodResult = await requestProductionCSID(
            environment,
            complianceCSID,
            complianceSecret,
            complianceResult.requestID
        );

        // 5. Save
        await prisma.company.upsert({
            where: {
                vatNumber_environment: {
                    vatNumber: vat,
                    environment
                }
            },
            update: {
                name: companyName,
                address: {},
                productionCSID: prodResult.binarySecurityToken,
                productionSecret: encrypt(prodResult.secret),
                privateKey: encrypt(privateKey),
                environment
            },
            create: {
                vatNumber: vat,
                name: companyName,
                address: {},
                productionCSID: prodResult.binarySecurityToken,
                productionSecret: encrypt(prodResult.secret),
                privateKey: encrypt(privateKey),
                environment
            }
        });

        res.json({ success: true, message: 'Onboarding successful' });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
