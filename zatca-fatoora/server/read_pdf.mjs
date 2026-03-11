import fs from 'fs';
import pdf from 'pdf-parse';

const dataBuffer = fs.readFileSync('c:\\Users\\Fayas\\Downloads\\Dev\\Developer Portal User Manual.pdf');

try {
    const data = await pdf(dataBuffer);
    fs.writeFileSync('pdf_content.txt', data.text);
    console.log('Done');
} catch (e) {
    console.error(e);
}
