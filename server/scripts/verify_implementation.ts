
import { generateInvoiceXML } from '../src/services/xmlService';
import { generateZatcaCSR } from '../src/services/csrService';
import { Invoice } from '../src/types';

// Mock Data
const mockInvoice: any = {
    invoiceNumber: 'VERIFY-001',
    uuid: '123e4567-e89b-12d3-a456-426614174000',
    issueDate: new Date().toISOString(),
    invoiceSubtype: 'Standard',
    documentType: 'Invoice',
    currencyCode: 'SAR',
    previousInvoiceHash: 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMjRiZmQ3NTI0MjkzZjBlYTRiM2IzZTk4MTU1MWNiMA==',
    supplier: {
        name: 'Supplier Co',
        vatNumber: '300000000000003',
        address: {
            streetName: 'Test St',
            buildingNumber: '1234',
            citySubdivisionName: 'District',
            cityName: 'Riyadh',
            postalZone: '12345',
            countryCode: 'SA'
        }
    },
    customer: {
        name: 'Customer Co',
        vatNumber: '300000000000003',
        address: {
            streetName: 'Test St',
            buildingNumber: '1234',
            citySubdivisionName: 'District',
            cityName: 'Riyadh',
            postalZone: '12345',
            countryCode: 'SA'
        }
    },
    items: [{
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
        subtotal: 100,
        taxCategory: 'S',
        vatRate: 0.15,
        vatAmount: 15,
        total: 115
    }],
    totalAmount: 115,
    vatAmount: 15,
    taxExclusiveAmount: 100
};

async function testXML() {
    console.log('--- Testing XML Generation ---');
    try {
        const xml = generateInvoiceXML(mockInvoice);
        if (xml.includes('<cbc:ID>PIH</cbc:ID>') && xml.includes(mockInvoice.previousInvoiceHash)) {
            console.log('✅ PIH (Previous Invoice Hash) found in XML.');
        } else {
            console.error('❌ PIH NOT found in XML.');
        }
        console.log('XML snippet:', xml.substring(0, 500));
    } catch (e) {
        console.error('❌ XML Generation Failed:', e);
    }
}

async function testCSR() {
    console.log('\n--- Testing CSR Generation ---');
    try {
        const { csr, privateKey, publicKey } = await generateZatcaCSR({
            commonName: 'CN-123',
            organizationUnitName: 'OU-123',
            organizationName: 'Org Name',
            countryName: 'SA',
            vatNumber: '300000000000003',
            invoiceType: '1100',
            location: 'Riyadh',
            industry: 'IT'
        });

        if (csr.includes('BEGIN CERTIFICATE REQUEST')) {
            console.log('✅ CSR Generated successfully.');
            // Deeper inspection of OIDs would require parsing, but basic generation confirms code runs.
        } else {
            console.error('❌ CSR Generation failed to return PEM.');
        }
    } catch (e) {
        console.error('❌ CSR Generation Failed:', e);
    }
}

async function run() {
    await testXML();
    await testCSR();
}

run();
