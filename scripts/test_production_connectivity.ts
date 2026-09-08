import prisma from '../server/src/lib/prisma.js';
import { SecurityService } from '../server/src/services/securityService.js';
import axios from 'axios';
import 'dotenv/config';

async function testAllCerts() {
    console.log('========================================================');
    console.log('🌐 TESTING ZATCA PRODUCTION CONNECTIVITY FOR ALL CERTS');
    console.log('========================================================\n');

    const company = await prisma.company.findFirst({
        where: { vat_number: '311499218600003' },
        include: { certificates: true }
    });

    if (!company || !company.certificates.length) {
        console.log('No company/certificates found.');
        return;
    }

    const url = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/invoices/clearance/single';

    for (const cert of company.certificates) {
        if (!cert.csid || !cert.secret) continue;

        const csid = cert.csid.trim();
        const secret = SecurityService.decrypt(cert.secret.trim());

        const cleanCsid = csid.replace(/-----BEGIN CERTIFICATE-----/g, '')
                              .replace(/-----END CERTIFICATE-----/g, '')
                              .replace(/\s+/g, '');

        if (cleanCsid.startsWith('MOCK_')) {
            console.log(`[Cert ID ${cert.id}] Type: ${cert.type} - Skipping Mock CSID test.`);
            continue;
        }

        const authHeader = 'Basic ' + Buffer.from(`${cleanCsid}:${secret}`).toString('base64');

        const probeBody = {
            invoiceHash: 'probe_connectivity_check_hash',
            uuid: '00000000-0000-0000-0000-000000000000',
            invoice: 'cHJvYmVfY29ubmVjdGl2aXR5X2NoZWNr'
        };

        try {
            const response = await axios.post(url, probeBody, {
                headers: {
                    'Authorization': authHeader,
                    'Accept-Version': 'V2',
                    'Content-Type': 'application/json',
                    'Accept-Language': 'en'
                },
                validateStatus: () => true
            });

            console.log(`[Cert ID ${cert.id}] Type: ${cert.type} | Active: ${cert.is_active}`);
            console.log(`   - Common Name: ${cert.common_name}`);
            console.log(`   - HTTP Status: ${response.status} ${response.statusText}`);
            console.log(`   - Request ID: ${response.headers['x-request-id'] || response.headers['correlation-id'] || 'N/A'}`);
            console.log(`   - Response Summary:`, JSON.stringify(response.data || {}).substring(0, 150));
            console.log('--------------------------------------------------------');
        } catch (err: any) {
            console.error(`[Cert ID ${cert.id}] Request failed: ${err.message}`);
        }
    }
}

testAllCerts().catch(console.error).finally(() => prisma.$disconnect());
