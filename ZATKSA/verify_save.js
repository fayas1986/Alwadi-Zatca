
const axios = require('axios');

async function verify() {
  try {
    console.log('Checking GET /api/items?companyId=org-001 ...');
    const getRes = await axios.get('http://localhost:3001/api/items?companyId=org-001');
    console.log('GET Response Status:', getRes.status);
    console.log('Items:', getRes.data);

    console.log('Sending test POST request to http://localhost:3001/api/items ...');
    const response = await axios.post('http://localhost:3001/api/items', {
      sku: 'SKU-' + Date.now(),
      name: 'Verification Item',
      unitPrice: 150.50,
      companyId: 'org-001'
    });
    console.log('POST Response Status:', response.status);
  } catch (error) {
    if (error.response) {
      console.error('API Error Response:', error.response.status, error.response.data);
    } else {
      console.error('API Error:', error.message);
    }
  }
}

verify();
