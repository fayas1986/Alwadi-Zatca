
import { generateInvoiceXML } from './server/src/services/xmlService.js';
import { signInvoice } from './server/src/services/sdkService.js';
import { Invoice, InvoiceItem } from './server/src/types.js';

async function generateSample() {
    console.log("--- ZATCA Phase 2 Compliance Sample Generation ---");

    const sampleInvoice: any = {
        invoiceNumber: "INV-2026-0001",
        uuid: "550e8400-e29b-41d4-a716-446655440000",
        issueDate: new Date().toISOString(),
        invoiceSubtype: "SIMPLIFIED",
        documentType: "INVOICE",
        currencyCode: "SAR",
        previousInvoiceHash: "0", // Standardized '0'
        supplier: {
            name: "ZatcaConnect Solutions",
            vatNumber: "310122393500003",
            address: {
                streetName: "Prince Sultan St",
                buildingNumber: "1234",
                citySubdivisionName: "Al Olaya",
                cityName: "Riyadh",
                postalZone: "12222",
                countryCode: "SA"
            }
        },
        customer: {
            name: "Retail Customer",
            address: {
                streetName: "Main St",
                buildingNumber: "5678",
                citySubdivisionName: "Al Malaz",
                cityName: "Riyadh",
                postalZone: "12821",
                countryCode: "SA"
            }
        },
        items: [
            {
                name: "Standard Widget",
                quantity: 2,
                unitPrice: 50.00,
                discount: 0,
                vatRate: 0.15,
                taxCategory: "S"
            } as any
        ],
        taxExclusiveAmount: 100.00,
        vatAmount: 15.00,
        totalAmount: 115.00
    };

    console.log("\n1. Generating UBL XML...");
    const unsignedXML = generateInvoiceXML(sampleInvoice as any);
    
    console.log("\n2. Signing XML (Mock Mode)...");
    // We use mock credentials to trigger the mock signing logic
    const cert = "MOCK_CERT";
    const key = "MOCK_KEY";
    
    const signResult = await signInvoice(unsignedXML, cert, key);
    
    console.log("\n--- COMPLIANCE ARTIFACTS ---");
    console.log("Stored Hash (zatca_hash):", signResult.hash);
    console.log("QR Code (Base64 TLV):", signResult.qr);
    console.log("\n--- SIGNED XML SAMPLE (Snippet) ---");
    const xmlSnippet = signResult.signedXml.substring(0, 500) + "... [truncated] ...";
    console.log(xmlSnippet);
}

generateSample().catch(console.error);
