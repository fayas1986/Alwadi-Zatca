
import { signInvoice } from '../server/src/services/sdkService';
import { reportInvoice } from '../server/src/services/zatcaService';
import { createInvoiceXml } from '../server/src/services/xmlService';
import prisma from '../server/src/lib/prisma';
import { SecurityService } from '../server/src/services/securityService';
import crypto from 'crypto';

async function testGatewaySubmission() {
    console.log("--- ZATCA GATEWAY SUBMISSION TEST (REAL CRYPTO) ---");

    // 1. Fetch Real Certificate
    const certRecord = await (prisma.certificate as any).findFirst({
        where: { type: 'SIMULATION', is_active: true },
        include: { company: true }
    });

    if (!certRecord || certRecord.csid.startsWith('MOCK_')) {
        console.error("ERROR: No real simulation certificate found. Please run scripts/onboard_real_simulation.ts first.");
        return;
    }

    const { company, csid, secret, private_key } = certRecord;
    const decryptedKey = SecurityService.decrypt(private_key);
    const decryptedSecret = SecurityService.decrypt(secret);

    console.log(`Found Certificate for: ${company.registered_name} (${company.vat_number})`);

    // 2. Create Sample Invoice (Simplified - Reporting)
    const uuid = crypto.randomUUID();
    const invoiceNumber = `INV-${Date.now()}`;
    const invoiceData = {
        uuid,
        invoice_number: invoiceNumber,
        issue_date: new Date().toISOString().split('T')[0],
        issue_time: new Date().toISOString().split('T')[1].split('.')[0],
        invoice_type: 'SIMPLIFIED_INVOICE',
        seller_name: company.registered_name,
        seller_vat: company.vat_number,
        seller_street: company.street_name || 'Al-Olaya St',
        seller_building: company.building_number || '1234',
        seller_city: company.city || 'Riyadh',
        seller_postal: company.postal_zone || '12211',
        buyer_name: 'Test Customer',
        total_amount: 115.00,
        tax_amount: 15.00,
        pih: '0', // Initial PIH for the first invoice of this certificate
        items: [
            {
                name: 'Compliance Test Service',
                quantity: 1,
                unit_price: 100.00,
                tax_category: 'S',
                tax_percent: 15,
                tax_amount: 15.00,
                subtotal: 115.00
            }
        ]
    };

    console.log(`\n1. Generating XML for Invoice: ${invoiceNumber}...`);
    const xml = createInvoiceXml(invoiceData as any);

    // 3. Sign with SDK
    console.log("2. Signing XML with Real SDK & Certificate...");
    const { signedXml, hash, qr } = await signInvoice(xml, certRecord.certificate, decryptedKey, true);
    
    console.log("Invoice Signed Successfully.");
    console.log(`Hash: ${hash}`);
    console.log(`QR Length: ${qr.length}`);

    // 4. Submit to Gateway
    console.log("\n3. Submitting to ZATCA Simulation Gateway (Reporting)...");
    try {
        const response = await reportInvoice(
            'simulation',
            signedXml,
            uuid,
            hash,
            csid,
            decryptedSecret
        );

        console.log("\n--- ZATCA GATEWAY RESPONSE ---");
        console.log(JSON.stringify(response, null, 2));
        console.log("------------------------------");

        if (response.reportingStatus === 'REPORTED' && response.validationResults.status === 'PASS') {
            console.log("\n✅ SUCCESS: Invoice accepted by ZATCA!");
        } else {
            console.log("\n❌ FAILED: Gateway rejected the invoice.");
            if (response.validationResults.errors.length > 0) {
                console.log("Errors:", response.validationResults.errors);
            }
            if (response.validationResults.warnings.length > 0) {
                console.log("Warnings:", response.validationResults.warnings);
            }
        }
    } catch (err: any) {
        console.error("\n❌ CONNECTION ERROR:", err.message);
        if (err.response) {
            console.error("Payload:", JSON.stringify(err.response.data, null, 2));
        }
    }
}

testGatewaySubmission().catch(console.error).finally(() => prisma.$disconnect());
