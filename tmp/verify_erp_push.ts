import axios from 'axios';
import crypto from 'crypto';

const API_URL = 'http://localhost:3001/api/erp/invoices/submit'; // Assuming backend runs on 5001

async function runTest() {
    const mockVat = '300000000000003';
    // Generate a unique invoice number for this test run
    const invoiceNumber = `TEST-INV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const payload = {
        invoiceNumber,
        invoiceSubtype: 'Standard',
        issueDate: new Date().toISOString(),
        totalAmount: 1150,
        vatAmount: 150,
        currencyCode: 'SAR',
        supplier: {
            vatNumber: mockVat
        }
    };

    console.log(`\n--- Test 1: First Submission (Should Succeed or return simulated success if cert missing) ---`);
    console.log(`Submitting Invoice: ${invoiceNumber}`);
    const reqConfig = { headers: { Authorization: 'Bearer testtoken' } };
    try {
        const response1 = await axios.post(API_URL, payload, reqConfig);
        console.log(`[Success] Status: ${response1.status}, Data:`, response1.data);
    } catch (error: any) {
        console.error(`[Test 1 Failed] Status: ${error.response?.status}, Data:`, error.response?.data || error.message);
    }

    console.log(`\n--- Test 2: Duplicate Submission (Should return 409 Conflict) ---`);
    try {
        const response2 = await axios.post(API_URL, payload, reqConfig);
        console.log(`[Unexpected Success] Status: ${response2.status}, Data:`, response2.data);
    } catch (error: any) {
        if (error.response?.status === 409) {
            console.log(`[Success: 409 Conflict Caught] Data:`, error.response.data);
        } else {
            console.error(`[Test 2 Failed with Wrong Error] Status: ${error.response?.status}, Data:`, error.response?.data || error.message);
        }
    }

    console.log(`\n--- Test 3: Unknown VAT Submission (Should return 404 Not Found) ---`);
    const unknownPayload = { ...payload, invoiceNumber: `TEST-INV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, supplier: { vatNumber: '999999999999999' } };
    try {
        const response3 = await axios.post(API_URL, unknownPayload, reqConfig);
        console.log(`[Unexpected Success] Status: ${response3.status}, Data:`, response3.data);
    } catch (error: any) {
         if (error.response?.status === 404) {
             console.log(`[Success: 404 Not Found Caught] Data:`, error.response.data);
         } else {
             console.error(`[Test 3 Failed with Wrong Error] Status: ${error.response?.status}, Data:`, error.response?.data || error.message);
         }
    }
}

runTest();
