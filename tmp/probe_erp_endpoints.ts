import axios from 'axios';

const BASE = 'http://uat01.factslite.com:8087/api';
const KEY = 'sk_cus_test_4anvtlha245kq3v9';

async function testEndpoints() {
    const endpoints = [
        '/token?vendorId=2',
        '/invoices?vendorId=2',
        '/zatca/invoices?vendorId=2',
        '/external/invoices?vendorId=2',
        '/v1/invoices?vendorId=2'
    ];

    for (const ep of endpoints) {
        try {
            console.log(`Testing ${BASE}${ep}...`);
            const res = await axios.get(`${BASE}${ep}`, {
                headers: { 'Authorization': KEY }
            });
            console.log(`  [${res.status}] Length: ${JSON.stringify(res.data).length}`);
            console.log(`  Snippet: ${JSON.stringify(res.data).substring(0, 200)}`);
        } catch (err: any) {
            console.log(`  [${err.response?.status || 'ERR'}] ${err.message}`);
        }
    }
}

testEndpoints();
