
import axios from 'axios';
import http from 'http';

// 1. Setup a mock ERP server
const mockErpPort = 5555;
const mockErpServer = http.createServer((req, res) => {
    if (req.url === '/invoices' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            invoices: [
                {
                    invoiceNumber: 'ERP-INV-001',
                    issueDate: new Date().toISOString(),
                    invoiceSubtype: 'Simplified',
                    totalAmount: 115.00,
                    vatAmount: 15.00,
                    customer: { name: 'Local Customer', vatNumber: null },
                    items: [{ name: 'Test Product', quantity: 1, unitPrice: 100, taxAmount: 15, subtotal: 115 }]
                }
            ]
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

mockErpServer.listen(mockErpPort, async () => {
    console.log(`Mock ERP running on http://localhost:${mockErpPort}`);
    
    try {
        // 2. Trigger the /api/admin/groups creation
        console.log('--- Testing Group Creation ---');
        const groupRes = await axios.post('http://localhost:3005/api/admin/groups', {
            name: 'Test Group ' + Date.now(),
            description: 'A test group for verification'
        }, { headers: { 'x-user-role': 'SUPER_ADMIN' } });
        console.log('Group Created:', groupRes.data);
        const groupId = groupRes.data.id;

        // 3. Trigger the /api/admin/users creation (Fixing the reported bug)
        console.log('\n--- Testing User Creation ---');
        try {
            const userRes = await axios.post('http://localhost:3005/api/admin/users', {
                email: `testuser_${Date.now()}@example.com`,
                password: 'TestPassword123',
                role: 'IT_ADMIN',
                name: 'Test User'
            }, { headers: { 'x-user-role': 'SUPER_ADMIN' } });
            console.log('User Created:', userRes.data);
        } catch (uErr: any) {
            console.error('User Creation FAILED:', uErr.response?.data || uErr.message);
        }

        // 4. Trigger the /api/erp/pull
        console.log('\n--- Testing ERP Pull ---');
        const pullRes = await axios.post('http://localhost:3005/api/erp/pull', {
            sourceUrl: `http://localhost:${mockErpPort}/invoices`,
            vat: '300000000000003' // This should match a company in DB or it will use mock
        });
        console.log('ERP Pull Results:', JSON.stringify(pullRes.data, null, 2));

        console.log('\n✅ Verification Script Completed');
    } catch (err: any) {
        console.error('❌ Verification Failed:', err.response?.data || err.message);
    } finally {
        mockErpServer.close();
    }
});
