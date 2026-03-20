import axios from 'axios';

async function test() {
    try {
        const res = await axios.post('http://localhost:3001/api/items', {
            name: 'Test Final',
            unitPrice: 10,
            companyId: 38
        }, {
            headers: {
                'x-user-role': 'IT_ADMIN',
                'x-user-email': 'admin@satguru.com'
            }
        });
        console.log('SUCCESS:', JSON.stringify(res.data, null, 2));
    } catch (err: any) {
        if (err.response) {
            console.error('FAILED Status:', err.response.status);
            console.error('FAILED Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error('FAILED Error:', err.message);
        }
    }
}
test();
