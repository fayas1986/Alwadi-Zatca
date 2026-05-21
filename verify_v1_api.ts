import axios from 'axios';
import prisma from './server/src/lib/prisma.js';

async function main() {
    try {
        const erpConfigs = await prisma.erp_configuration.findMany({
            include: { 
                company: {
                    include: { certificates: true }
                }
             }
        });

        // Filter for a config with a company that has certificates
        const erpConfig = erpConfigs.find(c => c.company && c.company.certificates && c.company.certificates.length > 0) || erpConfigs[0];

        if (!erpConfig) {
            console.error('No ERP configuration found in DB');
            process.exit(1);
        }

        console.log(`[Test] Testing with ClientID: ${erpConfig.id}`);
        console.log(`[Test] Company: ${erpConfig.company.registered_name}`);

        const baseUrl = 'http://localhost:3001/api/v1';
        const headers = {
            'x-api-key': erpConfig.api_key,
            'Content-Type': 'application/json'
        };

        const payload = {
            idempotencyKey: 'test-v1-' + Date.now(),
            invoiceNumber: 'V1-TEST-' + Math.floor(Math.random() * 10000),
            invoiceSubtype: 'Simplified',
            issueDate: new Date().toISOString(),
            totalAmount: 115.00,
            vatAmount: 15.00,
            taxExclusiveAmount: 100.00,
            items: [{ name: 'Test Product', quantity: 1, unitPrice: 100, vatRate: 0.15, vatAmount: 15, total: 115 }]
        };

        console.log(`[Test] Submitting to ${baseUrl}/erp/invoices...`);
        const res1 = await axios.post(`${baseUrl}/erp/invoices`, payload, { headers });
        console.log('SUCCESS_1:', JSON.stringify(res1.data, null, 2));

        process.exit(0);
    } catch (error: any) {
        console.error('TEST_FAILED');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

main();
