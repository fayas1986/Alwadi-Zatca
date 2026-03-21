import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3001/api';

async function runE2E() {
    console.log("==========================================");
    console.log("🚀 STARTING E2E & API SIMULATOR VERIFICATION");
    console.log("==========================================\n");

    try {
        // 1. ZATCA Reachability Simulator
        console.log("[1/5] Testing ZATCA API Simulator Reachability...");
        const pingRes = await axios.get(`${API_BASE}/zatca/ping/simulation`);
        console.log(`✅ Reachable: ${pingRes.data.online} (${pingRes.data.latencyMs}ms) via ${pingRes.data.host}`);

        // 2. Fetch Active API key for ERP Push
        console.log("\n[2/5] Fetching ERP API Key...");
        let config = await prisma.erp_configuration.findFirst({ where: { is_active: true } });
        if (!config || !config.api_key) {
            throw new Error("No active ERP configuration with an API Key found to test.");
        }
        console.log(`✅ API Key Loaded for Environment: ${config.environment}`);

        // 3. API Push Simulation
        console.log("\n[3/5] Testing Real-time API Submit (Push)...");
        const invoicePayload = {
            invoiceNumber: `E2E-PUSH-${Date.now()}`,
            invoiceSubtype: 'Simplified',
            issueDate: new Date().toISOString(),
            totalAmount: 500.00,
            vatAmount: 75.00,
            taxExclusiveAmount: 425.00,
            currencyCode: 'SAR',
            customer: { name: 'E2E Test Client' }
        };
        const submitRes = await axios.post(`${API_BASE}/erp/invoices/submit`, invoicePayload, {
            headers: { 'Authorization': `Bearer ${config.api_key}` }
        });
        const uuid = submitRes.data.uuid;
        console.log(`✅ Success: API Simulator mapped invoice to status [${submitRes.data.status}]`);
        console.log(`   UUID Generated: ${uuid}`);

        // 4. API Status Check
        console.log("\n[4/5] Testing Real-time API Status Simulator...");
        // Wait 1 second to ensure DB consistency
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await axios.get(`${API_BASE}/erp/invoices/${uuid}/status`);
        console.log(`✅ Success: Fetched invoice status: ${statusRes.data.status}`);

        // 5. XML Validator
        console.log("\n[5/5] Testing XML Validator Engine...");
        const xmlMock = `<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>TEST-123</ID></Invoice>`;
        const xmlRes = await axios.post(`${API_BASE}/zatca/validate`, { xml: xmlMock });
        console.log(`✅ Success: Validator responded with isValid: ${xmlRes.data.isValid}`);

        console.log("\n==========================================");
        console.log("✨ ALL E2E API SIMULATOR TESTS PASSED ✨");
        console.log("==========================================");
        
        fs.writeFileSync('e2e_results.log', 'PASSED');

    } catch (e: any) {
        console.log("\n❌ E2E TEST FAILED");
        if (e.response) {
            console.error("Server Error Response:", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("Error:", e.message);
        }
        fs.writeFileSync('e2e_results.log', 'FAILED');
    } finally {
        await prisma.$disconnect();
    }
}

runE2E();
