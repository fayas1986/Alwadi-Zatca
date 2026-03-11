
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const path = require('path');

const pdfPath = path.resolve(__dirname, 'manual.pdf');

if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath);
    process.exit(1);
}

const dataBuffer = fs.readFileSync(pdfPath);
const uint8Array = new Uint8Array(dataBuffer);

(async () => {
    try {
        console.log('Extracting text from PDF...');
        // Pass options object with data property as Uint8Array
        const parser = new PDFParse({ data: uint8Array });
        
        // Use getText() method
        const result = await parser.getText();
        
        fs.writeFileSync('manual_content.txt', result.text);
        console.log('Successfully extracted PDF text to manual_content.txt');
        console.log('Text length:', result.text.length);
        
        // Optional: clean up if method exists
        if (parser.destroy) await parser.destroy();
        
    } catch (err) {
        console.error('Error parsing PDF:', err);
        // Fallback: try passing data directly if object wrapper fails
        try {
             console.log('Retrying with direct data...');
             const parser = new PDFParse(uint8Array);
             const result = await parser.getText();
             fs.writeFileSync('manual_content.txt', result.text);
             console.log('Success on retry!');
        } catch (e) {
             console.error('Retry failed:', e);
        }
    }
})();
