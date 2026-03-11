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
    const environments = [
        { name: 'Simulation', key: 'simulation', url: 'https://gw-fatoora.zatca.gov.sa/api/v2/compliance', description: 'ZATCA Testing Gateway' },
        { name: 'Sandbox',    key: 'sandbox',    url: 'https://gw-fatoora.zatca.gov.sa/api/v2/compliance', description: 'ZATCA Integration Sandbox' },
        { name: 'Production', key: 'production', url: 'https://core.zatca.gov.sa/api/v2/invoices/reporting/single', description: 'ZATCA Live Production Gateway' }
    ];

    const results = await Promise.all(environments.map(async (env) => {
        const start = Date.now();
        console.log(`Pinging ${env.name}: ${env.url}...`);
        try {
            // Use a shorter 3s timeout for health checks
            const pingResponse = await axios.get(env.url, { 
                timeout: 3000,
                validateStatus: (status) => true // Don't throw for 404/405/etc.
            });
            const latency = Date.now() - start;
            console.log(`  - ${env.name} responded in ${latency}ms (Status: ${pingResponse.status})`);
            return { 
                ...env, 
                status: 'Reachable', 
                latencyMs: latency, 
                reachable: true, 
                code: pingResponse.status 
            };
        } catch (error: any) {
            const latency = Date.now() - start;
            console.log(`  - ${env.name} failed after ${latency}ms: ${error.code || error.message}`);
            return { 
                ...env, 
                status: 'Unreachable', 
                error: error.code || error.message, 
                latencyMs: latency, 
                reachable: false 
            };
        }
    }));

    const allReachable = results.every(r => r.reachable);
    console.log(`ZATCA Health Check Summary: ${allReachable ? 'ALL REACHABLE' : 'SOME UNREACHABLE'}`);
    
    res.json({
        success: true,
        overall: allReachable ? 'All environments reachable' : 'Some environments unreachable',
        environments: results,
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
