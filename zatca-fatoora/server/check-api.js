
const axios = require('axios');

const ZATCA_URLS = {
    sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
    simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core'
};

async function checkConnectivity() {
    console.log("Checking connectivity to ZATCA APIs...");

    for (const [env, url] of Object.entries(ZATCA_URLS)) {
        try {
            console.log(`\nTesting ${env} (${url})...`);
            // We expect 405 Method Not Allowed or 401 Unauthorized or 400 Bad Request
            // Just getting a response means we are connected.
            const response = await axios.get(url, {
                validateStatus: () => true, // Accept any status code
                timeout: 5000
            });
            console.log(`[SUCCESS] Connected to ${env}. Status: ${response.status} ${response.statusText}`);
        } catch (error) {
            console.error(`[FAILED] Could not connect to ${env}. Error: ${error.message}`);
            if (error.code === 'ENOTFOUND') {
                console.error("DNS resolution failed. Check internet connection.");
            } else if (error.code === 'ETIMEDOUT') {
                console.error("Connection timed out.");
            }
        }
    }
}

checkConnectivity();
