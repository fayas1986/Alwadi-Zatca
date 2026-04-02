import axios from 'axios';
import prisma from './server/src/lib/prisma.js';
import fs from 'fs';

async function main() {
    try {
        const erpConfigs = await prisma.erp_configuration.findMany({
            include: { company: { include: { certificates: true } } }
        });

        const erpConfig = erpConfigs.find(c => c.company && c.company.certificates && c.company.certificates.length > 0) || erpConfigs[0];

        if (!erpConfig) {
            fs.writeFileSync('v1_error.log', 'No ERP configuration found in DB');
            process.exit(1);
        }

        const baseUrl = 'http://localhost:3001/api/v1';
        const headers = {
            'x-api-key': erpConfig.id,
            'Authorization': `Bearer ${erpConfig.api_key}`,
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

        const res1 = await axios.post(`${baseUrl}/erp/invoices`, payload, { headers });
        fs.writeFileSync('v1_error.log', JSON.stringify(res1.data, null, 2));
        process.exit(0);
    } catch (error: any) {
        if (error.response) {
            fs.writeFileSync('v1_error.log', JSON.stringify(error.response.data, null, 2));
        } else {
            fs.writeFileSync('v1_error.log', error.message + '\n' + error.stack);
        }
        process.exit(1);
    }
}

main();
