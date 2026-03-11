const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';
const companyId = 'org-001';

async function verifyFlow() {
    console.log('--- STARTING E2E FLOW VERIFICATION ---');

    try {
        // 1. Item Master: Create an item
        console.log('1. Testing Item Master...');
        const newItem = {
            sku: `TEST-SKU-${Date.now()}`,
            name: 'Verification Test Item',
            description: 'Created during E2E flow',
            unitPrice: 150.00,
            unitOfMeasure: 'each',
            taxCategory: 'S',
            taxRate: 0.15,
            companyId: companyId
        };
        const itemRes = await axios.post(`${API_BASE}/items`, newItem);
        console.log('   [SUCCESS] Created Item:', itemRes.data.sku);

        // 2. ERP Sync: Configure ERP
        console.log('2. Testing ERP Config...');
        const erpConfig = {
            companyId: companyId,
            type: 'CUSTOM', // using the custom connector
            baseUrl: 'http://localhost:3001/mock-erp', // pointing to a mock we won't actually query fully
            apiKey: 'test-key',
            syncInterval: 5
        };
        const configRes = await axios.post(`${API_BASE}/erp/config`, erpConfig);
        console.log('   [SUCCESS] Configured ERP:', configRes.data.data.type);

        // 3. ERP Sync: Trigger Sync
        console.log('3. Testing ERP Sync trigger...');
        const syncRes = await axios.post(`${API_BASE}/erp/sync`);
        console.log('   [SUCCESS] Sync Trigger Result:', syncRes.data.message);

        console.log('--- ALL VERIFICATION STEPS COMPLETED SUCCESSFULLY ---');
    } catch (e) {
        if (e.response) {
            console.error('--- VERIFICATION FAILED ---', e.response.status, JSON.stringify(e.response.data, null, 2));
        } else {
            console.error('--- VERIFICATION FAILED ---', e.message);
        }
    }
}

verifyFlow();
