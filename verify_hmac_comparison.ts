import axios from 'axios';
import crypto from 'crypto';
import prisma from './server/src/lib/prisma.js';

async function main() {
    try {
        const erpConfig = await prisma.erp_configuration.findFirst({
            include: { company: true }
        });

        if (!erpConfig) {
            console.error('No ERP configuration found in DB');
            process.exit(1);
        }

        const clientId = erpConfig.id;
        const secret = erpConfig.api_key;
        const baseUrl = 'http://localhost:3001';
        const path = '/api/v1/erp/test-auth';
        const method = 'GET';
        const timestamp = new Date().toISOString();

        const dataToSign = `${timestamp}${method}${path}`;
        const signature = crypto.createHmac('sha256', secret!).update(dataToSign).digest('hex');

        const headers = {
            'x-client-id': clientId,
            'x-timestamp': timestamp,
            'x-signature': signature
        };

        console.log('[Client] Data string:', dataToSign);

        const response = await axios.get(`${baseUrl}${path}`, { headers });
        console.log('--- SUCCESS ---');
        console.log(response.data);
    } catch (error: any) {
        console.log('--- FAILED ---');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Full Response Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
    }
    process.exit(0);
}

main();
