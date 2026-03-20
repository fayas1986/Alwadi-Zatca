import app from '../server/src/index.js';
import axios from 'axios';

const PORT = 3002;
const API_URL = `http://localhost:${PORT}/api/items`;

async function runTest() {
    console.log(`Starting test server on port ${PORT}...`);
    const server = app.listen(PORT, async () => {
        console.log(`Test server is running on port ${PORT}`);
        
        const companyId = 38;
        const headers = {
            'x-user-role': 'IT_ADMIN',
            'x-user-email': 'admin@satguru.com'
        };

        try {
            console.log('1. Attempting to create a test item (Role-based)...');
            const createRes = await axios.post(API_URL, {
                name: 'Port 3002 Verification',
                sku: 'V-PORT-3002',
                description: 'Test item for port 3002',
                unitPrice: 50.00,
                unitOfMeasure: 'PCS',
                taxCategory: 'S',
                companyId: companyId
            }, { headers });
            
            console.log('SUCCESS: Item created with ID:', createRes.data.id);

            console.log('2. Fetching items...');
            const fetchRes = await axios.get(`${API_URL}?companyId=${companyId}`, { headers });
            const itemFound = fetchRes.data.some((i: any) => i.sku === 'V-PORT-3002');
            
            if (itemFound) {
                console.log('SUCCESS: Item confirmed in list.');
            } else {
                console.error('FAILURE: Item not found.');
            }

            // Cleanup
            if (createRes.data.id) {
                await axios.delete(`${API_URL}/${createRes.data.id}`, { headers });
                console.log('3. Cleanup: Test item deleted.');
            }

        } catch (error: any) {
            console.error('TEST FAILED:', error.response?.data || error.message);
        } finally {
            console.log('Closing test server...');
            server.close();
        }
    });

    server.on('error', (err: any) => {
        console.error('Server error:', err.message);
        process.exit(1);
    });
}

runTest();
