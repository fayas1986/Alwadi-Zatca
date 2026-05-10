
import { injectComplianceFields } from '../utils/api-helpers.js';
import { generateInvoiceXML } from '../services/xmlService.js';

const mockCompany = {
    registered_name: 'Tech Solutions SA',
    vat_number: '310122393500003',
    cr_number: '1010101010',
    street_name: 'Prince Sultan St',
    building_number: '2322',
    city: 'Riyadh',
    postal_zone: '12222',
    city_subdivision: 'Al Olaya',
    country: 'SA'
};

const mockPayload = {
    invoiceNumber: 'CN-2026-001',
    invoiceSubtype: 'Simplified',
    items: [
        { name: 'Returned Item', quantity: 1, unitPrice: 100, vatRate: 15 }
    ],
    originalInvoice: {
        id: 'INV-2026-001',
        uuid: 'old-uuid'
    },
    reason: {
        description: 'Returned Goods'
    }
};

async function testCreditNote() {
    console.log('--- Testing Credit Note Compliance ---');
    
    // 1. Simulate handleAsyncSubmission logic (Supplier population)
    const payloadWithSupplier = {
        ...mockPayload,
        supplier: {
            name: mockCompany.registered_name,
            registrationName: mockCompany.registered_name,
            vatNumber: mockCompany.vat_number,
            crNumber: mockCompany.cr_number,
            address: {
                streetName: mockCompany.street_name,
                buildingNumber: mockCompany.building_number,
                cityName: mockCompany.city,
                postalZone: mockCompany.postal_zone,
                citySubdivisionName: mockCompany.city_subdivision,
                countryCode: mockCompany.country
            }
        },
        customer: {
            name: 'Cash Customer',
            vatNumber: '300000000000003',
            address: {
                streetName: 'Unknown',
                buildingNumber: '0000',
                cityName: 'Riyadh',
                postalZone: '00000',
                countryCode: 'SA'
            }
        }
    };

    // 2. Inject Compliance Fields
    const invoiceData = injectComplianceFields(payloadWithSupplier, 'Credit Note');
    console.log('Injected DocumentType:', invoiceData.documentType);
    console.log('Injected Currency:', invoiceData.currencyCode);

    // 3. Generate XML
    const xml = generateInvoiceXML(invoiceData as any);
    
    // 4. Verify XML
    const hasTypeCode381 = xml.includes('<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>');
    const hasSupplier = xml.includes('<cac:AccountingSupplierParty>');
    const hasCRN = xml.includes('schemeID="CRN">1010101010</cbc:ID>');
    const hasSAR = xml.includes('currencyID="SAR">');
    const hasLineExtension = xml.includes('<cbc:LineExtensionAmount');
    
    console.log('Has TypeCode 381 (Credit Note):', hasTypeCode381);
    console.log('Has Supplier Block:', hasSupplier);
    console.log('Has Correct CRN:', hasCRN);
    console.log('Has SAR Currency:', hasSAR);
    console.log('Has LineExtensionAmount:', hasLineExtension);

    if (hasTypeCode381 && hasSupplier && hasCRN && hasSAR && hasLineExtension) {
        console.log('SUCCESS: All compliance checks passed.');
    } else {
        console.error('FAILURE: Some compliance checks failed.');
        process.exit(1);
    }
}

testCreditNote();
