import axios from 'axios';

async function verifyItemFix() {
    const API_URL = 'http://localhost:3001/api/items';
    const companyId = 38;
    const headers = {
        'x-user-role': 'IT_ADMIN',
        'x-user-email': 'admin@satguru.com'
    };

    console.log('--- Verifying Item Master Fix ---');

    try {
        // 1. Create a test item
        console.log('1. Attempting to create a test item...');
        const createRes = await axios.post(API_URL, {
            name: 'Verification Test Item',
            sku: 'V-TEST-001',
            description: 'Test item for verification',
            unitPrice: 99.99,
            unitOfMeasure: 'PCS',
            taxCategory: 'S',
            companyId: companyId
        }, { headers });
        
        console.log('SUCCESS: Item created with ID:', createRes.data.id);

        // 2. Fetch items for the company
        console.log('2. Attempting to fetch items for company 38...');
        const fetchRes = await axios.get(`${API_URL}?companyId=${companyId}`, { headers });
        
        const testItem = fetchRes.data.find((item: any) => item.sku === 'V-TEST-001');
        if (testItem) {
            console.log('SUCCESS: Item found in list:', testItem.name);
        } else {
            console.error('FAILURE: Test item not found in list!');
        }

        // 3. Cleanup: Delete the test item
        if (testItem) {
            console.log('3. Cleaning up test item...');
            await axios.delete(`${API_URL}/${testItem.id}`, { headers });
            console.log('SUCCESS: Test item deleted.');
        }

    } catch (error: any) {
        console.error('VERIFICATION FAILED:', error.response?.data || error.message);
    }
}

verifyItemFix();
