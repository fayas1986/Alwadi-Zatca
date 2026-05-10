
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';

const doc = new jsPDF();

// Header
doc.setFontSize(20);
doc.setTextColor(0, 102, 204);
doc.text('ZATCA Phase 2: Invoice Notes Mapping Guide', 14, 22);

doc.setFontSize(10);
doc.setTextColor(100);
doc.text('Compliance Reference: ZATCA-ER-2024-V2', 14, 30);
doc.text('Document Date: ' + new Date().toLocaleDateString(), 14, 35);

// 1. Core Document Definitions
doc.setFontSize(14);
doc.setTextColor(0);
doc.text('1. Document Type Identifiers', 14, 45);

const docTypes = [
    ['Document Type', 'UBL Code', 'Description', 'ZATCA Compliance Note'],
    ['Invoice', '388', 'Standard/Simplified Tax Invoice', 'Default invoice type'],
    ['Credit Note', '381', 'Reversal/Adjustment (Return)', 'Mandatory BillingReference'],
    ['Debit Note', '383', 'Addition/Adjustment (Charge)', 'Mandatory BillingReference']
];

autoTable(doc, {
    startY: 50,
    head: [docTypes[0]],
    body: docTypes.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [0, 102, 204] }
});

// 2. Mandatory Mapping for Notes
const nextY = (doc as any).lastAutoTable.finalY + 15;
doc.text('2. Mandatory Field Mapping (Credit/Debit Notes)', 14, nextY);

const noteMapping = [
    ['ERP Field', 'UBL Element', 'Sample Value', 'Requirement'],
    ['originalInvoiceId', 'cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID', 'INV-2023-001', 'Mandatory for 381/383'],
    ['originalIssueDate', 'cac:BillingReference/cac:InvoiceDocumentReference/cbc:IssueDate', '2023-10-01', 'Reference to original invoice'],
    ['reasonForNote', 'cbc:Note (InstructionNote)', 'Customer Return', 'Required for all adjustments'],
    ['documentUUID', 'cbc:UUID', '550e8400-e29b-41d4-a716...', 'Unique for every note'],
    ['issueDate', 'cbc:IssueDate', '2023-11-05', 'KSA Date (UTC+3)'],
    ['issueTime', 'cbc:IssueTime', '14:30:00', 'KSA Time (UTC+3)']
];

autoTable(doc, {
    startY: nextY + 5,
    head: [noteMapping[0]],
    body: noteMapping.slice(1),
    theme: 'grid',
    headStyles: { fillColor: [34, 139, 34] }
});

// 3. Monetary Logic & Sign Consistency
const nextY2 = (doc as any).lastAutoTable.finalY + 15;
doc.text('3. Monetary Logic & Sign Consistency', 14, nextY2);

doc.setFontSize(10);
const logicText = [
    '• ZATCA Rule BR-KSA-XX: All line item quantities and prices MUST be positive values.',
    '• Reversal Logic: The system identifies a "Reduction" via the 381 (Credit Note) code.',
    '• Mixed Signs: ERPs should NOT mix positive and negative signs in the same document.',
    '• Rounding: All monetary fields must be strictly 2 decimal places (Halalas).'
];
logicText.forEach((line, i) => {
    doc.text(line, 14, nextY2 + 10 + (i * 7));
});

// 4. Line Item Mapping
const nextY3 = nextY2 + 45;
doc.text('4. Line Item Structure (InvoiceLine)', 14, nextY3);

const lineMapping = [
    ['Field', 'UBL Path', 'Data Type', 'Note'],
    ['Quantity', 'cbc:InvoicedQuantity', 'Decimal', 'Must be absolute value'],
    ['Unit Price', 'cac:Price/cbc:PriceAmount', 'Amount', 'Net price after line discount'],
    ['VAT Rate', 'cac:TaxCategory/cbc:Percent', 'Percentage', 'Standard (15%), Zero (0%), etc.'],
    ['VAT Amount', 'cac:TaxTotal/cbc:TaxAmount', 'Amount', 'Calculated per line'],
    ['Line Total', 'cbc:LineExtensionAmount', 'Amount', 'Qty * UnitPrice']
];

autoTable(doc, {
    startY: nextY3 + 5,
    head: [lineMapping[0]],
    body: lineMapping.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [255, 140, 0] }
});

// Footer
const pageCount = (doc as any).internal.getNumberOfPages();
for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Confidential - ZATCA Connector Mapping Documentation', 14, 285);
    doc.text('Page ' + i + ' of ' + pageCount, 180, 285);
}

// Output
const buffer = doc.output('arraybuffer');
fs.writeFileSync('zatca_mapping_guide.pdf', Buffer.from(buffer));
console.log('PDF generated successfully: zatca_mapping_guide.pdf');
