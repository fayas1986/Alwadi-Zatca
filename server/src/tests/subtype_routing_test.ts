
import { injectComplianceFields } from '../utils/api-helpers.js';
import { generateInvoiceXML } from '../services/xmlService.js';

const testSubtypeRouting = () => {
    console.log("--- Testing Subtype Routing ---");

    const cases = [
        { label: "Lower 'standard'", subtype: 'standard' as any, expectedCode: '0100000' },
        { label: "Pascal 'Standard'", subtype: 'Standard' as any, expectedCode: '0100000' },
        { label: "Upper 'STANDARD'", subtype: 'STANDARD' as any, expectedCode: '0100000' },
        { label: "Lower 'simplified'", subtype: 'simplified' as any, expectedCode: '0200000' },
        { label: "Pascal 'Simplified'", subtype: 'Simplified' as any, expectedCode: '0200000' },
        { label: "Upper 'SIMPLIFIED'", subtype: 'SIMPLIFIED' as any, expectedCode: '0200000' },
        { label: "Default (undefined)", subtype: undefined as any, expectedCode: '0200000' }
    ];

    cases.forEach(c => {
        const payload = {
            invoiceNumber: 'INV-TEST',
            invoiceSubtype: c.subtype,
            items: [{ name: 'Item', quantity: 1, unitPrice: 100, vatRate: 0.15 }]
        };

        // 1. Inject compliance fields (normalizes subtype)
        const normalized = injectComplianceFields(payload, 'Invoice');
        
        // 2. Generate XML (uses subtype to choose code)
        const xml = generateInvoiceXML(normalized as any);

        const containsCorrectCode = xml.includes(`name="${c.expectedCode}"`);
        
        console.log(`[${c.label}] Input: ${c.subtype} -> Normalized: ${normalized.invoiceSubtype} -> ZATCA Code: ${c.expectedCode} [${containsCorrectCode ? 'PASS' : 'FAIL'}]`);
        
        if (!containsCorrectCode) {
            console.error(`FAILED: Expected XML to contain name="${c.expectedCode}"`);
            process.exit(1);
        }
    });

    console.log("\n--- Testing Document Type Mapping ---");
    const docCases = [
        { label: "Invoice", type: 'Invoice' as any, expectedCode: '388' },
        { label: "Credit Note", type: 'Credit Note' as any, expectedCode: '381' },
        { label: "Debit Note", type: 'Debit Note' as any, expectedCode: '383' },
        { label: "UPPER CREDIT", type: 'CREDIT_NOTE' as any, expectedCode: '381' }
    ];

    docCases.forEach(c => {
        const payload = {
            invoiceNumber: 'INV-TEST',
            items: [{ name: 'Item', quantity: 1, unitPrice: 100, vatRate: 0.15 }]
        };

        const normalized = injectComplianceFields(payload, c.type);
        const xml = generateInvoiceXML(normalized as any);

        // ZATCA InvoiceTypeCode value is inside the tag: <cbc:InvoiceTypeCode name="...">388</cbc:InvoiceTypeCode>
        const containsCorrectCode = xml.includes(`>${c.expectedCode}</cbc:InvoiceTypeCode>`);
        
        console.log(`[${c.label}] Input: ${c.type} -> Normalized DocType: ${normalized.documentType} -> ZATCA Type: ${c.expectedCode} [${containsCorrectCode ? 'PASS' : 'FAIL'}]`);
        
        if (!containsCorrectCode) {
            console.error(`FAILED: Expected XML to contain >${c.expectedCode}</cbc:InvoiceTypeCode>`);
            process.exit(1);
        }
    });

    console.log("\nSUCCESS: All routing cases passed!");
};

testSubtypeRouting();
