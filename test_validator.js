const fs = require('fs');

async function testValidation() {
    const xml = fs.readFileSync('test_invoice.xml', 'utf8');
    
    console.log("Sending XML for validation...");
    const start = Date.now();
    
    try {
        const response = await fetch('http://localhost:3001/api/zatca/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ xml })
        });
        
        const result = await response.json();
        console.log(`Validation completed in ${Date.now() - start}ms`);
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

testValidation();
