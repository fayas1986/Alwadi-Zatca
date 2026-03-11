
const fs = require('fs');
const pdf = require('pdf-parse');

const path = require('path');
const pdfPath = path.resolve(__dirname, 'manual.pdf');

if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath);
    process.exit(1);
}

const dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer).then(function (data) {
    fs.writeFileSync('manual_content.txt', data.text);
    console.log('Successfully extracted PDF text to manual_content.txt');
    console.log('Number of pages:', data.numpages);
    console.log('Info:', data.info);
}).catch(function (error) {
    console.error('Error parsing PDF:', error);
});
