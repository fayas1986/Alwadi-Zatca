import axios from 'axios';
import * as crypto from 'crypto';
import prisma from './server/src/lib/prisma.js';

function stableStringify(obj: any): string {
    if (obj === null) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
        return '[' + obj.map(item => stableStringify(item)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const pairs = keys.map(key => {
        return JSON.stringify(key) + ':' + stableStringify(obj[key]);
    });
    return '{' + pairs.join(',') + '}';
}

async function testHmac() {
    try {
        const erpConfigs = await prisma.erp_configuration.findMany({
            include: { company: true }
        });

        // Use the simulation config
        const erpConfig = erpConfigs.find(c => c.environment === 'SIMULATION') || erpConfigs[0];
        if (!erpConfig) {
            console.error('No configurations found.');
            process.exit(1);
        }

        const clientId = erpConfig.id; // or api_key
        const apiKey = erpConfig.api_key!;
        const timestamp = new Date().toISOString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const method = 'GET';

        // Find latest invoice uuid
        const lastInv = await prisma.invoice.findFirst({
            where: { company_id: erpConfig.company_id },
            orderBy: { created_at: 'desc' }
        });

        if (!lastInv) {
            console.error('No invoices found to check status.');
            process.exit(1);
        }

        const jobId = lastInv.uuid;
        const path = `/api/v1/erp/status/${jobId}`;
        const bodyHash = ''; // GET request has no body

        const dataToSign = `${timestamp}${nonce}${method}${path}${bodyHash}`;
        const signature = crypto.createHmac('sha256', apiKey).update(dataToSign).digest('hex');

        console.log('[HMAC TEST] Request info:');
        console.log('- Client ID:', clientId);
        console.log('- API Key (Secret):', apiKey.substring(0, 4) + '****' + apiKey.slice(-4));
        console.log('- Timestamp:', timestamp);
        console.log('- Nonce:', nonce);
        console.log('- Method:', method);
        console.log('- Path:', path);
        console.log('- Signature:', signature);

        const baseUrl = 'http://localhost:3001';
        const headers = {
            'x-client-id': clientId,
            'x-api-key': apiKey,
            'x-timestamp': timestamp,
            'x-nonce': nonce,
            'x-signature': signature,
            'Content-Type': 'application/json'
        };

        console.log(`[HMAC TEST] Hitting ${baseUrl}${path}...`);
        const response = await axios.get(`${baseUrl}${path}`, { headers });
        console.log('SUCCESS:', JSON.stringify(response.data, null, 2));

        // Now test Replay Protection (Nonce Uniqueness)
        const replayNonce = crypto.randomBytes(16).toString('hex');
        const replayTimestamp = new Date().toISOString();
        const replayPath = `/api/v1/erp/status/${jobId}`;
        const replayDataToSign = `${replayTimestamp}${replayNonce}${method}${replayPath}${bodyHash}`;
        const replaySignature = crypto.createHmac('sha256', apiKey).update(replayDataToSign).digest('hex');

        const replayHeaders = {
            ...headers,
            'x-timestamp': replayTimestamp,
            'x-nonce': replayNonce,
            'x-signature': replaySignature
        };
        console.log(`[HMAC TEST] Hitting again to test replay protection: ${baseUrl}${replayPath}...`);
        const response2 = await axios.get(`${baseUrl}${replayPath}`, { headers: replayHeaders });
        console.log('SUCCESS (Replay protection passed):', JSON.stringify(response2.data, null, 2));

        process.exit(0);
    } catch (error: any) {
        console.error('HMAC TEST FAILED');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

testHmac();
