import axios from 'axios';

async function testSync() {
    const url = 'http://uat01.factslite.com:8087/api/token?vendorId=2';
    const apiKey = 'sk_cus_test_4anvtlha245kq3v9';
    
    console.log(`Testing connection to ${url}...`);
    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            timeout: 10000
        });
        console.log('Sync Test Result:', response.status, response.data);
    } catch (error: any) {
        console.error('Sync Test Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
            console.error('Response Status:', error.response.status);
        }
    }
}

testSync();
