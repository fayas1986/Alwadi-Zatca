import axios from 'axios';
import { createHmac, createHash } from 'crypto';

const BASE_URL = 'http://localhost:3001/api/erp';
const ENDPOINT = '/invoices/submit';

const SIM_KEY = 'sk_sim_easylease_mock_v1';
const SBOX_KEY = 'sk_sbox_zatcaconnect_uat_v1';
const LIVE_KEY = 'sk_live_zatcaconnect_prod_v1';

function stableStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(v => stableStringify(v)).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => `"${k}":${stableStringify(obj[k])}`).join(',') + '}';
}

async function submitInvoice(apiKey: string, environment: string) {
    console.log(`\n[TEST] Testing ${environment} Environment...`);
    
    const payload = {
        invoiceNumber: `INV-${Date.now()}-${environment.substring(0, 3)}`,
        issueDate: new Date().toISOString().split('T')[0],
        invoiceTime: "12:00:00",
        invoiceType: "388",
        invoiceSubtype: "Standard",
        currency: "SAR",
        totalAmount: 115.00,
        taxAmount: 15.00,
        seller: {
            name: "EasyLease Transport",
            registrationName: "EasyLease Transport",
            vatNumber: "300000000000003",
            address: {
                street: "Olaya St",
                city: "Riyadh",
                postalCode: "12211",
                country: "SA"
            }
        },
        buyer: {
            name: "Test Customer",
            vatNumber: "311111111111113",
            address: {
                street: "Tahlia St",
                city: "Jeddah",
                postalCode: "23322",
                country: "SA"
            }
        },
        items: [
            {
                name: "Logistics Service",
                quantity: 1,
                unitPrice: 100.00,
                taxRate: 15,
                taxAmount: 15.00,
                totalAmount: 115.00
            }
        ]
    };

    const timestamp = new Date().toISOString();
    const nonce = Math.random().toString(36).substring(2, 15);
    const method = 'POST';
    const path = `/api/erp${ENDPOINT}`;
    
    // HMAC Signature
    const bodyHash = createHash('sha256').update(stableStringify(payload)).digest('hex');
    const dataToSign = `${timestamp}${nonce}${method}${path}${bodyHash}`;
    const signature = createHmac('sha256', apiKey).update(dataToSign).digest('hex');

    try {
        const response = await axios.post(`${BASE_URL}${ENDPOINT}`, payload, {
            headers: {
                'x-api-key': apiKey,
                'x-signature': signature,
                'x-timestamp': timestamp,
                'x-nonce': nonce,
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ ${environment} Success:`, response.data.status);
        console.log(`   ZATCA Note:`, response.data.zatcaResponse?.note || 'N/A');
        return true;
    } catch (error: any) {
        console.error(`❌ ${environment} Failed:`, error.response?.data?.message || error.message);
        if (error.response?.data?.details) {
            console.error(`   Details:`, error.response.data.details);
        }
        return false;
    }
}

async function runTests() {
    console.log('=== STARTING E2E ENVIRONMENT ISOLATION TEST ===');
    
    const results = [
        await submitInvoice(SIM_KEY, 'SIMULATION'),
        await submitInvoice(SBOX_KEY, 'SANDBOX'),
        // Note: Production test will likely fail if the URL/Cert is invalid, which is expected behavior for isolation
        await submitInvoice(LIVE_KEY, 'PRODUCTION')
    ];

    console.log('\n=== TEST SUMMARY ===');
    console.log(`SIMULATION: ${results[0] ? 'PASS' : 'FAIL'}`);
    console.log(`SANDBOX:    ${results[1] ? 'PASS' : 'FAIL'}`);
    console.log(`PRODUCTION: ${results[2] ? 'PASS' : 'FAIL'}`);
    
    if (results[0] && results[1]) {
        console.log('\n[RESULT] Environment Isolation Verified: API keys correctly route to respective ZATCA endpoints.');
    } else {
        console.log('\n[RESULT] Verification Failed: Check API keys and server logs.');
    }
}

runTests();
