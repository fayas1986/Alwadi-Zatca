
const axios = require('axios');

const ZATCA_URLS = [
    'https://gw-fatoora.zatca.gov.sa/api/v2/compliance',
    'https://gw-fatoora.zatca.gov.sa/api/v2/production/csids'
];

async function testConnection() {
    console.log('--- TESTING ZATCA CONNECTIVITY ---');
    for (const url of ZATCA_URLS) {
        try {
            console.log(`Checking ${url}...`);
            // We expect a 401 or 405, but not a timeout or DNS error
            const response = await axios.get(url, { timeout: 5000 });
            console.log(`[PASS] Reached ${url} - Status: ${response.status}`);
        } catch (error) {
            if (error.response) {
                // The server responded with a status code that falls out of the range of 2xx
                console.log(`[PASS] Reached ${url} - Status: ${error.response.status} (Expected error)`);
            } else if (error.request) {
                // The request was made but no response was received
                console.error(`[FAIL] Could not reach ${url} - No response (Check internet/DNS)`);
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error(`[ERROR] ${url}: ${error.message}`);
            }
        }
    }
}

testConnection();
