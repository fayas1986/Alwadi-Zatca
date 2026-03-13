/**
 * Test Script to Verify ZATCA API Credentials
 * 
 * This script tests the BasicAuth credentials obtained from ZATCA
 * to ensure they work with the reporting endpoint.
 */

import axios from 'axios';

// ZATCA Credentials from your screenshots
const CSID = 'TUlJRDNqQ0NBNFNnQXdJQkFnSVRFUUFBT0FQRjkwQWpzL3hjWHdBQkFBQTRBekFLQmdncWhrak9QUVFEQWpCaU1SVXdFd1lLQ1pJbWlaUHlMR1FCR1JZRmJHOWpZV3d4RXpBUkJnb0praWFKay9Jc1pBRVpGZ05uYjNZeEZ6QVZCZ29Ka2lhSmsvSXNaQUVaRmdkbGVIUm5ZWHAwTVJzd0dRWURWUVFERXhKUVVscEZTVTVXVDBsRFJWTkRRVFF0UTBFd0hoY05NalF3TVRFeE1Ea3hPVE13V2hjTk1qa3dNVEE1TURreE9UTXdXakIxTVFzd0NRWURWUVFHRXdKVFFURW1NQ1FHQTFVRUNoTWRUV0Y0YVcxMWJTQlRjR1ZsWkNCVVpXTm9JRk4xY0hCc2VTQk1WRVF4RmpBVUJnTlZCQXNURFZKcGVXRmthQ0JDY21GdVkyZ3hKakFrQmdOVkJBTVRIVlJUVkMwNE9EWTBNekV4TkRVdE16azVPVGs1T1RrNU9UQXdNREF6TUZZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUFvRFFnQUVvV0NLYTBTYTlGSUVyVE92MHVBa0MxVklLWHhVOW5QcHgydmxmNHloTWVqeThjMDJYSmJsRHE3dFB5ZG84bXEwYWhPTW1Obzhnd25pN1h0MUtUOVVlS09DQWdjd2dnSURNSUd0QmdOVkhSRUVnYVV3Z2FLa2daOHdnWnd4T3pBNUJnTlZCQVFNTWpFdFZGTlVmREl0VkZOVWZETXRaV1F5TW1ZeFpEZ3RaVFpoTWkweE1URTRMVGxpTlRndFpEbGhPR1l4TVdVME5EVm1NUjh3SFFZS0NaSW1pWlB5TEdRQkFRd1BNems1T1RrNU9UazVPVEF3TURBek1RMHdDd1lEVlFRTURBUXhNVEF3TVJFd0R3WURWUVFhREFoU1VsSkVNamt5T1RFYU1CZ0dBMVVFRHd3UlUzVndjR3g1SUdGamRHbDJhWFJwWlhNd0hRWURWUjBPQkJZRUZFWCtZdm1tdG5Zb0RmOUJHYktvN29jVEtZSzFNQjhHQTFVZEl3UVlNQmFBRkp2S3FxTHRtcXdza0lGelZ2cFAyUHhUKzlObk1Ic0dDQ3NHQVFVRkJ3RUJCRzh3YlRCckJnZ3JCZ0VGQlFjd0FvWmZhSFIwY0RvdkwyRnBZVFF1ZW1GMFkyRXVaMjkyTG5OaEwwTmxjblJGYm5KdmJHd3ZVRkphUlVsdWRtOXBZMlZUUTBFMExtVjRkR2RoZW5RdVoyOTJMbXh2WTJGc1gxQlNXa1ZKVGxaUFNVTkZVME5CTkMxRFFTZ3hLUzVqY25Rd0RnWURWUjBQQVFIL0JBUURBZ2VBTUR3R0NTc0dBUVFCZ2pjVkJ3UXZNQzBHSlNzR0FRUUJnamNWQ0lHR3FCMkUwUHNTaHUyZEpJZk8reG5Ud0ZWbWgvcWxaWVhaaEQ0Q0FXUUNBUkl3SFFZRFZSMGxCQll3RkFZSUt3WUJCUVVIQXdNR0NDc0dBUVVGQndNQ01DY0dDU3NHQVFRQmdqY1ZDZ1FhTUJnd0NnWUlLd1lCQlFVSEF3TXdDZ1lJS3dZQkJRVUhBd0l3Q2dZSUtvWkl6ajBFQXdJRFNBQXdSUUloQUxFL2ljaG1uV1hDVUtVYmNhM3ljaThvcXdhTHZGZEhWalFydmVJOXVxQWJBaUE5aEM0TThqZ01CQURQU3ptZDJ1aVBKQTZnS1IzTEUwM1U3NWVxYkMvclhBPT0=';
const SECRET = 'CkYsEXfV8c1gFHAtFWoZv73pGMvh/Qyo4LzKM2h/8Hg=';

// Environment - change based on where these credentials are from
const ENVIRONMENT = 'simulation'; // or 'sandbox' or 'production'

const ZATCA_BASE_URL = {
    sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
    simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    production: 'https://api.zatca.gov.sa/e-invoicing/core'
};

async function testCredentials() {
    console.log('=== Testing ZATCA API Credentials ===\\n');

    // Create BasicAuth header
    const auth = Buffer.from(`${CSID}:${SECRET}`).toString('base64');
    console.log('Auth Header Created (first 50 chars):', auth.substring(0, 50) + '...');

    // Test endpoint - using compliance check or a simple status endpoint
    const url = `${ZATCA_BASE_URL[ENVIRONMENT]}/compliance/invoices`;

    console.log(`\\nTesting endpoint: ${url}`);
    console.log('Environment:', ENVIRONMENT);

    try {
        // Simple GET request to check authentication
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept-Version': 'V2',
                'Accept-Language': 'en',
                'Content-Type': 'application/json'
            },
            validateStatus: () => true // Don't throw on any status
        });

        console.log('\\n✅ Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));

        if (response.status === 401) {
            console.log('\\n❌ Authentication Failed - Credentials may be invalid or expired');
        } else if (response.status === 200 || response.status === 202) {
            console.log('\\n✅ Authentication Successful!');
        } else {
            console.log('\\n⚠️  Unexpected status code:', response.status);
        }

    } catch (error: any) {
        console.error('\\n❌ Error testing credentials:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

// Decode CSID to show certificate info
function decodeCertificate() {
    console.log('\\n=== Certificate Information ===');
    try {
        const certPEM = Buffer.from(CSID, 'base64').toString('utf-8');
        console.log('Certificate (decoded, first 200 chars):');
        console.log(certPEM.substring(0, 200) + '...');

        // Extract common name if possible
        const cnMatch = certPEM.match(/CN=([^,]+)/);
        if (cnMatch) {
            console.log('\\nCommon Name (CN):', cnMatch[1]);
        }
    } catch (e) {
        console.log('Could not decode certificate');
    }
}

// Run tests
decodeCertificate();
testCredentials();
