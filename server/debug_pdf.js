
const pdf = require('pdf-parse');
console.log('pdf export:', pdf);
console.log('typeof pdf:', typeof pdf);
if (typeof pdf === 'object' && pdf.default) {
    console.log('pdf.default:', typeof pdf.default);
}
