import axios from 'axios';
import crypto from 'crypto';
import prisma from './server/src/lib/prisma.js';

async function main() {
    try {
        const erpConfig = await prisma.erp_configuration.findFirst({
            where: { is_active: true },
            include: { company: true }
        });

        if (!erpConfig) {
            console.error('No ACTIVE ERP configuration found');
            process.exit(1);
        }

        const clientId = erpConfig.id;
        const secret = erpConfig.api_key!.trim();
        const baseUrl = 'http://localhost:3001';

        async function testRequest(method: string, path: string, body: any = null) {
            console.log(`\n--- Testing ${method} ${path} ---`);
            const timestamp = new Date().toISOString();
            
            let bodyHash = '';
            if (body && Object.keys(body).length > 0) {
                bodyHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
            }

            const dataToSign = `${timestamp}${method.toUpperCase()}${path}${bodyHash}`;
            const signature = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');

            const headers = {
                'x-client-id': clientId,
                'x-timestamp': timestamp,
                'x-signature': signature
            };

            try {
                const url = `${baseUrl}${path}`;
                const response = method === 'GET' 
                    ? await axios.get(url, { headers })
                    : await axios.post(url, body, { headers });
                console.log('SUCCESS:', response.data);
            } catch (error: any) {
                console.log('FAILED:', error.response?.status, error.response?.data);
            }
        }

        // Test GET
        await testRequest('GET', '/api/v1/erp/test-auth');

        // Test POST (Invoice Submission)
        const invoicePayload = {
            invoiceNumber: `V2-TEST-${Date.now()}`,
            issueDate: new Date().toISOString(),
            invoiceSubtype: 'Simplified',
            totalAmount: 115.00,
            vatAmount: 15.00,
            items: [{ name: 'V2 Test Item', quantity: 1, unitPrice: 100 }]
        };
        await testRequest('POST', '/api/v1/erp/invoices', invoicePayload);

    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

main();
