
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const path = require('path');

const pdfPath = path.resolve(__dirname, 'manual.pdf');

if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath);
    process.exit(1);
}

const dataBuffer = fs.readFileSync(pdfPath);

(async () => {
    try {
        // Based on debug output, PDFParse is a class in the export
        // However, standard pdf-parse usage is pdf(buffer)
        // If the installed version is indeed different, we need to adapt.
        
        // Let's try to instantiate it if it's a class
        // But wait, the debug output showed:
        // PDFParse: [class (anonymous)]
        
        // Let's try to inspect the class instance to see available methods
        if (PDFParse) {
             // It seems this might be 'pdf-parse-fork' or similar which uses a class?
             // Or maybe it is 'pdf-parse' v2?
             
             // Let's try the approach from extract_pdf.js
             // const parser = new PDFParse({ data: dataBuffer });
             // const result = await parser.getText();
             
             // But wait, extract_pdf.js failed? No, I didn't run it.
             // I will try to follow extract_pdf.js logic.
             
             // Note: I don't see getText in standard pdf-parse.
             // Standard pdf-parse returns a promise that resolves to data object with text property.
             
             // Let's try to just log the PDFParse to see if we can use it.
             
             // If the previous run of extract_manual.js failed with "pdf is not a function",
             // it means require('pdf-parse') returns an object, not a function.
             // So we must use a property of that object.
             
             // Let's try to use the default export if it exists, or look for a parse method.
             // The debug output didn't show 'parse' method, but showed 'PDFParse' class.
             
             // I'll try to use the class.
             /*
             const parser = new PDFParse();
             const data = await parser.parse(dataBuffer); // Guessing method name
             */
             
             // Let's try what extract_pdf.js had.
             /*
             const parser = new PDFParse({ data: dataBuffer });
             const result = await parser.getText();
             */
             
             // But wait, does PDFParse constructor take { data: ... }?
             // If I can't be sure, I should try to inspect the prototype.
             
             console.log('PDFParse prototype:', PDFParse.prototype);
        } else {
             console.error('PDFParse class not found in export');
        }

    } catch (err) {
        console.error('Error:', err);
    }
})();
