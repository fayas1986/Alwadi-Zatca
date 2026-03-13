
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const path = require('path');

const pdfPath = path.resolve(__dirname, 'manual.pdf');
const dataBuffer = fs.readFileSync(pdfPath);

try {
    const parser = new PDFParse(dataBuffer);
    console.log('Instance keys:', Object.keys(parser));
    console.log('Instance prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(parser)));
    
    // Maybe try to call a method if we see one
    if (typeof parser.getText === 'function') {
        parser.getText().then(text => console.log('Text extracted:', text.substring(0, 100)));
    } else if (typeof parser.text === 'string') {
        console.log('Text property:', parser.text.substring(0, 100));
    } else {
        console.log('No obvious text method/property found');
    }
} catch (e) {
    console.error('Error instantiating:', e);
}
