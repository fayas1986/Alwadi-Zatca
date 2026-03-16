import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const API_BASE_URL = 'http://localhost:3001/api';

const client = axios.create({
    timeout: 30000, // 30 seconds
    headers: { 'Content-Type': 'application/json' }
});

async function testERPIntegration() {
    console.log('--- Starting ERP Integration Verification ---');

    try {
        // 1. Verify /api/erp/config (Save Config)
        console.log('\n[1/4] Verifying /api/erp/config...');
        const configPayload = {
            companyId: 'org-001',
            type: 'Custom REST',
            baseUrl: 'http://localhost:3001/api/erp/mock-server',
            apiKey: 'test-api-key-123',
            syncInterval: 30
        };
        const configRes = await client.post(`${API_BASE_URL}/erp/config`, configPayload);
        if (configRes.data.success) {
            console.log('✅ Success: ERP Configuration saved.');
            console.log('   Config ID:', configRes.data.data.id);
        } else {
            console.error('❌ Failed: ERP Configuration save error:', configRes.data.error);
        }

        // 2. Verify /api/erp/invoices/submit (Push API)
        console.log('\n[2/4] Verifying /api/erp/invoices/submit...');
        const invoicePayload = {
            invoiceNumber: `VER-INV-${Date.now()}`,
            invoiceSubtype: 'Simplified',
            issueDate: new Date().toISOString(),
            totalAmount: 575.00,
            vatAmount: 75.00,
            taxExclusiveAmount: 500.00,
            currencyCode: 'SAR',
            customer: { name: 'Test Client' },
            supplier: { vatNumber: '300000000000003' }
        };
        const submitRes = await client.post(`${API_BASE_URL}/erp/invoices/submit`, invoicePayload, {
            headers: { 'Authorization': 'Bearer test_api_key' }
        });
        
        if (submitRes.data.success) {
            console.log('✅ Success: Invoice submitted via Push API.');
            console.log('   Status:', submitRes.data.status);
            console.log('   UUID:', submitRes.data.uuid);
            
            // 3. Verify /api/erp/invoices/:uuid/status
            console.log('\n[3/4] Verifying /api/erp/invoices/:uuid/status...');
            // Wait 1 second to ensure DB consistency (though should be synchronous)
            await new Promise(r => setTimeout(r, 1000));
            const statusRes = await client.get(`${API_BASE_URL}/erp/invoices/${submitRes.data.uuid}/status`);
            if (statusRes.data.success) {
                console.log('✅ Success: Invoice status retrieved.');
                console.log('   Status:', statusRes.data.status);
            } else {
                console.error('❌ Failed: Could not retrieve invoice status.');
            }
        } else {
            console.error('❌ Failed: Invoice submission error:', submitRes.data.error);
        }

        // 4. Verify /api/erp/pull (Pull API with Mock Server)
        console.log('\n[4/4] Verifying /api/erp/pull...');
        const pullPayload = {
            sourceUrl: 'http://localhost:3001/api/erp/mock-server',
            authHeader: 'Bearer test_token',
            vat: '300000000000003'
        };
        const pullRes = await client.post(`${API_BASE_URL}/erp/pull`, pullPayload);
        if (pullRes.data.success) {
            console.log('✅ Success: ERP Pull triggered.');
            console.log('   Results:', pullRes.data.results?.length || 0, 'invoices processed');
            if (pullRes.data.results) {
                pullRes.data.results.forEach((r: any) => console.log(`   - Invoice ${r.invoice}: ${r.status}`));
            }
        } else {
            console.error('❌ Failed: ERP Pull error:', pullRes.data.error);
        }

        console.log('\n--- ERP Integration Verification Complete ---');
    } catch (error: any) {
        console.error('\n❌ Critical Error during verification:', error.message);
        if (error.response) {
            console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
        }
    } finally {
        process.exit(0);
    }
}

testERPIntegration();
