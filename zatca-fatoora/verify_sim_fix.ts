// Node.js 18+ includes global fetch, no need for node-fetch import

const testSimulation = async () => {
    console.log('--- Testing API Simulation with Partial Payload ---');
    const payload = {
        invoiceNumber: "SIM-VERIFY-FINAL",
        invoiceSubtype: "Standard",
        issueDate: new Date().toISOString(),
        totalAmount: 1150.00,
        vatAmount: 150.00,
        taxExclusiveAmount: 1000.00,
        currencyCode: "SAR",
        items: [
            {
                id: "item-1",
                name: "Integration Service Fee",
                quantity: 1,
                unitPrice: 1000.00,
                subtotal: 1000.00,
                vatRate: 0.15,
                vatAmount: 150.00,
                total: 1150.00
            }
        ]
        // Explicitly omitting supplier and customer addresses
    };

    try {
        const response = await fetch('http://localhost:3001/api/erp/invoices/submit', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sap_prod_verify_fix'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('Response Status:', response.status);
        console.log('Result:', JSON.stringify(result, null, 2));

        if (result.success && result.status === 'SIMULATED') {
            console.log('\n✅ API Simulation Fixed Successfully!');
        } else {
            console.log('\n❌ API Simulation Still Failing:', result.error || 'Unexpected Result');
        }
    } catch (e) {
        console.error('\n❌ Network error or Server Down:', e.message);
    }
};

testSimulation();
