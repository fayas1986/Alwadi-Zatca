const BASE_URL = 'http://localhost:3001/api';

const runTests = async () => {
    console.log('--- Phase 1: ZATCA Portal Connectivity (Pings) ---');
    const scenarios = ['sandbox', 'simulation', 'production'];
    
    for (const env of scenarios) {
        try {
            const resp = await fetch(`${BASE_URL}/zatca/ping/${env}`);
            const data = await resp.json();
            console.log(`[${env.toUpperCase()}] Online: ${data.online}, Latency: ${data.latencyMs}ms, Status: ${data.statusCode}`);
        } catch (e) {
            console.log(`[${env.toUpperCase()}] Failed to ping: ${e.message}`);
        }
    }

    console.log('\n--- Phase 2: Simulation Environment Robustness (B2B & B2C) ---');
    const simulationTests = [
        { name: 'B2B Standard', subtype: 'Standard' },
        { name: 'B2C Simplified', subtype: 'Simplified' }
    ];

    for (const test of simulationTests) {
        try {
            const payload = {
                invoiceNumber: `SIM-${test.name.replace(' ', '-')}-${Date.now()}`,
                invoiceSubtype: test.subtype,
                issueDate: new Date().toISOString(),
                totalAmount: 575.00,
                vatAmount: 75.00,
                taxExclusiveAmount: 500.00,
                items: [{ name: 'Test Product', quantity: 1, unitPrice: 500, subtotal: 500, total: 575 }]
            };

            const resp = await fetch(`${BASE_URL}/erp/invoices/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer verify_token' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            console.log(`[${test.name}] Status: ${data.status}, Success: ${data.success}`);
            if (data.success && data.status === 'SIMULATED') {
                console.log(`   ✅ QR Code Generated: ${data.qrCode.substring(0, 20)}...`);
            } else {
                console.log(`   ❌ Failed: ${data.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.log(`[${test.name}] Crash: ${e.message}`);
        }
    }
};

runTests();
