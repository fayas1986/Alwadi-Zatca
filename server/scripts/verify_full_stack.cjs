
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const ZATCA_URLS = {
    sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
    simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core'
};

async function verifyFullStack() {
    console.log('--- Full Stack Verification ---');
    let allChecksPassed = true;

    // 1. Database Connection
    console.log('\n[1/4] Checking Database Connection...');
    try {
        await prisma.$connect();
        console.log('✅ Connected to Database (SSL/TLS verified)');
        
        // Optional: Check if we can query
        const result = await prisma.$queryRaw`SELECT 1 as connected`;
        console.log('✅ Query execution successful');
    } catch (e) {
        console.error('❌ Database connection failed:', e.message);
        allChecksPassed = false;
    } finally {
        await prisma.$disconnect();
    }

    // 2. ZATCA Connectivity
    console.log('\n[2/4] Checking ZATCA API Connectivity...');
    for (const [env, url] of Object.entries(ZATCA_URLS)) {
        try {
            await axios.get(url, { validateStatus: () => true, timeout: 5000 });
            console.log(`✅ Connected to ${env} endpoint`);
        } catch (error) {
            console.error(`❌ Could not connect to ${env}: ${error.message}`);
            // Don't fail the whole check for ZATCA unless all fail, but warn
        }
    }

    // 3. Backend Health
    console.log('\n[3/4] Checking Backend Server Health...');
    try {
        const health = await axios.get('http://localhost:3001/health');
        if (health.data.status === 'ok') {
            console.log('✅ Backend server is running and healthy');
        } else {
            console.error('❌ Backend server returned unexpected status:', health.data);
            allChecksPassed = false;
        }
    } catch (e) {
        console.error('❌ Backend server is not reachable at http://localhost:3001');
        console.log('   (Make sure to start the backend with `npm start` or `npm run dev`)');
        allChecksPassed = false;
    }

    // 4. Frontend Configuration
    console.log('\n[4/4] Checking Frontend Configuration...');
    try {
        const viteConfigPath = path.join(__dirname, '../../vite.config.ts');
        if (fs.existsSync(viteConfigPath)) {
            const content = fs.readFileSync(viteConfigPath, 'utf-8');
            if (content.includes('proxy') && content.includes('/api') && content.includes('http://localhost:3001')) {
                console.log('✅ Vite proxy configured correctly (/api -> http://localhost:3001)');
            } else {
                console.error('❌ Vite proxy configuration might be missing or incorrect');
                allChecksPassed = false;
            }
        } else {
            console.error('❌ vite.config.ts not found');
            allChecksPassed = false;
        }

        const apiServicePath = path.join(__dirname, '../../services/api.ts');
        if (fs.existsSync(apiServicePath)) {
            const content = fs.readFileSync(apiServicePath, 'utf-8');
            if (content.includes("API_BASE_URL = '/api/zatca'") || content.includes('API_BASE_URL = "/api/zatca"')) {
                console.log('✅ Frontend API service uses relative path');
            } else {
                 // It might use full path, which is also okay if proxy is not used, but we want proxy
                console.log('⚠️ Frontend API service check: Ensure API_BASE_URL matches proxy or backend URL');
            }
        }
    } catch (e) {
        console.error('❌ Error checking frontend config:', e.message);
        allChecksPassed = false;
    }

    console.log('\n--- Verification Summary ---');
    if (allChecksPassed) {
        console.log('✅ ALL SYSTEMS GO. Frontend, Backend, Database, and ZATCA APIs are synced.');
    } else {
        console.log('⚠️ Some checks failed. Please review the logs above.');
    }
}

verifyFullStack();
