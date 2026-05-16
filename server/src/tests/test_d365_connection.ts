import dotenv from 'dotenv';
import { D365Service } from '../services/d365Service.js';

dotenv.config();

async function testConnection() {
    console.log('--- Dynamics 365 Connection Test ---');
    
    const config = {
        clientId: process.env.D365_CLIENT_ID || '',
        clientSecret: process.env.D365_CLIENT_SECRET || '',
        tenantId: process.env.D365_TENANT_ID || '',
        baseUrl: process.env.D365_BASE_URL || ''
    };

    if (!config.clientId || !config.clientSecret || !config.tenantId || !config.baseUrl) {
        console.error('Missing D365 configuration in .env');
        process.exit(1);
    }

    try {
        console.log('1. Attempting to get Access Token...');
        const token = await D365Service.getAccessToken(config);
        console.log('✅ Access Token acquired successfully.');
        // console.log('Token snippet:', token.substring(0, 20) + '...');

        console.log('2. Attempting to fetch invoices from SalesOrderInvoices...');
        const invoices = await D365Service.fetchInvoices(config);
        console.log(`✅ Successfully fetched ${invoices.length} invoices.`);
        
        if (invoices.length > 0) {
            console.log('Sample Invoice Data:', JSON.stringify(invoices[0], null, 2));
        } else {
            console.log('No invoices found in the response.');
        }

    } catch (error: any) {
        console.error('❌ Test Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testConnection();
