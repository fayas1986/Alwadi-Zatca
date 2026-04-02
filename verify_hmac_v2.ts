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

        // dataToSign = timestamp + method + path + bodyHash(empty for GET)
        const dataToSign = `${timestamp}${method}${path}`;
        
        console.log('[Client] Data to sign:', dataToSign);

        const signature = crypto.createHmac('sha256', secret!).update(dataToSign).digest('hex');

        const headers = {
            'x-client-id': clientId,
            'x-timestamp': timestamp,
            'x-signature': signature
        };

        const response = await axios.get(`${baseUrl}${path}`, { headers });
        console.log('SUCCESS:', response.data);
        process.exit(0);
    } catch (error: any) {
        if (error.response) {
            console.error('FAILED Status:', error.response.status);
            console.error('Server Expected:', error.response.data.expectedDataToSign);
            console.error('Client Sent Data:', `${new Date().toISOString()}GET/api/v1/erp/test-auth`); // Simplified trace
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

main();
