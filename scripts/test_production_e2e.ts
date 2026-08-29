/**
 * End-to-end production invoice submission test.
 * 
 * This script:
 * 1. Loads the active PRODUCTION certificate from the DB
 * 2. Creates a real test invoice
 * 3. Signs it with the Java SDK using the production cert/key
 * 4. Submits it to the ZATCA production API
 * 5. Reports the result
 */
import crypto from 'crypto';
import 'dotenv/config';
import prisma from '../server/src/lib/prisma.js';
import { SecurityService } from '../server/src/services/securityService.js';
import { signInvoice } from '../server/src/services/sdkService.js';
import { generateInvoiceXML } from '../server/src/services/xmlService.js';
import { ZatcaClientFactory } from '../server/src/clients/zatca/ZatcaClientFactory.js';

async function main() {
    console.log('=== PRODUCTION INVOICE SUBMISSION TEST ===\n');

    // 1. Get production cert from DB
    const cert = await (prisma.certificate as any).findFirst({
        where: { type: 'PRODUCTION', is_active: true },
        include: { company: true }
    });

    if (!cert) {
        console.error('❌ No active PRODUCTION certificate in DB. Run onboard_real_production.ts first.');
        return;
    }

    console.log('✅ Found PRODUCTION certificate:');
    console.log('   Company:', cert.company?.registered_name);
    console.log('   VAT:', cert.company?.vat_number);
    console.log('   CSID (first 50):', cert.csid?.substring(0, 50));
    console.log('   Has private key:', !!cert.private_key);
    console.log();

    // Check if CSID looks like a real ZATCA cert (starts with MII)
    if (!cert.csid?.startsWith('MII') && !cert.csid?.startsWith('TUlJ')) {
        console.error('❌ CSID appears to be a mock/placeholder value:', cert.csid?.substring(0, 40));
        console.error('   Please re-run production onboarding with a real OTP.');
        return;
    }

    const company = cert.company!;
    const decryptedKey = SecurityService.decrypt(cert.private_key!);
    const csid = cert.csid!;
    const secret = SecurityService.decrypt(cert.secret!);

    console.log('✅ Credentials decrypted successfully');
    console.log('   Private key format (first 10):', decryptedKey.substring(0, 10));
    console.log();

    // 2. Build a test invoice
    const invoiceNumber = `TEST-PROD-${Date.now()}`;
    const uuid = crypto.randomUUID();
    const invoice = {
        invoiceNumber,
        uuid,
        issueDate: new Date().toISOString(),
        invoiceSubtype: 'Standard',
        invoiceCounterValue: 1,
        documentType: 'Invoice',
        currencyCode: 'SAR',
        supplier: {
            name: company.vat_number.substring(0, 10),
            vatNumber: company.vat_number,
            address: {
                streetName: company.street_name || 'Test Street',
                buildingNumber: company.building_number || '1111',
                citySubdivisionName: company.city_subdivision || 'District',
                cityName: company.city || 'Riyadh',
                postalZone: company.postal_zone || '11111',
                countryCode: 'SA'
            }
        },
        customer: {
            name: 'Test Customer',
            vatNumber: '300000000000003',
            address: {
                streetName: 'Customer Street',
                buildingNumber: '2222',
                citySubdivisionName: 'District',
                cityName: 'Riyadh',
                postalZone: '12345',
                countryCode: 'SA'
            }
        },
        items: [{
            name: 'Transport Service',
            quantity: 1,
            unitPrice: 1000,
            subtotal: 1000,
            taxCategory: 'S',
            vatRate: 0.15,
            vatAmount: 150,
            total: 1150
        }],
        totalAmount: 1150,
        vatAmount: 150,
        taxExclusiveAmount: 1000
    };

    console.log(`📄 Test invoice: ${invoiceNumber}`);
    console.log(`   UUID: ${uuid}`);
    console.log();

    // 3. Generate XML
    console.log('Generating invoice XML...');
    const xml = await (generateInvoiceXML as any)(invoice);
    console.log('✅ XML generated');

    // 4. Sign with Java SDK
    console.log('Signing invoice with ZATCA Java SDK...');
    const signed = await signInvoice(xml, csid, decryptedKey, false); // false = production
    console.log('✅ Invoice signed!');
    console.log('   Hash:', signed.hash);
    console.log('   QR (first 30):', signed.qr?.substring(0, 30));
    console.log();

    // 5. Submit to ZATCA Production API
    const client = ZatcaClientFactory.getClient('Production');
    const invoiceBase64 = Buffer.from(signed.signedXml).toString('base64');

    console.log('🚀 Submitting to ZATCA Production API...');
    try {
        const result = await (client as any).reportInvoice({
            csid,
            secret,
            xmlHash: signed.hash,
            xmlBase64: invoiceBase64,
            uuid
        });

        console.log('\n========================================================');
        console.log('🎉 SUCCESS! Invoice submitted to ZATCA Production!');
        console.log('Result:', JSON.stringify(result, null, 2));
        console.log('========================================================');

    } catch (e: any) {
        if (e.response) {
            console.error('\n❌ ZATCA API Error:', JSON.stringify(e.response.data, null, 2));
            console.error('HTTP Status:', e.response.status);
        } else {
            console.error('\n❌ Error:', e.message);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
