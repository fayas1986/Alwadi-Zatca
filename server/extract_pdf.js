const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const dataBuffer = fs.readFileSync('c:\\Users\\Fayas\\Downloads\\Dev\\Developer Portal User Manual.pdf');

(async () => {
    try {
        const parser = new PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        fs.writeFileSync('pdf_content.txt', result.text);
        console.log('PDF content extracted successfully to pdf_content.txt');
        await parser.destroy();
    } catch (err) {
        console.error('Error extracting PDF:', err);
    }
})();
