import fs from 'fs';
import axios from 'axios';

async function testValidation() {
    const xml = fs.readFileSync('test_invoice.xml', 'utf8');
    
    console.log("Sending XML for validation...");
    
    try {
        const response = await axios.post('http://localhost:3001/api/zatca/validate', { xml });
        fs.writeFileSync('val_result.json', JSON.stringify(response.data, null, 2));
        console.log("Wrote val_result.json");
    } catch (e) {
        if (e.response) {
            fs.writeFileSync('val_result.json', JSON.stringify(e.response.data, null, 2));
            console.log("Wrote error to val_result.json");
        } else {
            console.error("Fetch failed:", e);
        }
    }
}

testValidation();
