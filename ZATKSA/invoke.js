const axios = require('axios');
axios.post('http://localhost:3001/api/items', {
    sku: 'TEST-1',
    name: 'Test',
    companyId: 'org-001'
}).then(res => console.log('success', res.data))
  .catch(err => {
      console.log('Error caught:');
      if (err.response) {
          console.log('Response Error:', err.response.status, err.response.data);
      } else {
          console.log('Request Error Code:', err.code);
          console.log('Request Error Message:', err.message);
      }
  });
