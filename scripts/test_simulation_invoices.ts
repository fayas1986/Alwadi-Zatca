import prisma from '../server/src/lib/prisma.js';
import { SecurityService } from '../server/src/services/securityService.js';
import { signInvoice } from '../server/src/services/sdkService.js';
import { generateInvoiceXML } from '../server/src/services/xmlService.js';
import { reportInvoice, clearInvoice } from '../server/src/services/zatcaService.js';
import crypto from 'crypto';
import 'dotenv/config';

async function main() {
    console.log('========================================================');
    console.log('⚡ TESTING REAL ZATCA SIMULATION INVOICE SUBMISSIONS');
    console.log('========================================================\n');

    // 1. Fetch active Simulation Certificate from DB
    const certRecord = await prisma.certificate.findFirst({
        where: { type: 'SIMULATION', is_active: true },
        include: { company: true }
    });

    if (!certRecord || !certRecord.csid || certRecord.csid.startsWith('MOCK_')) {
        console.error('❌ Error: Active Simulation certificate not found in DB. Please run Simulation onboarding first.');
        process.exit(1);
    }

    const company = certRecord.company;
    const csid = certRecord.csid.trim();
    const secret = SecurityService.decrypt(certRecord.secret!.trim());
    const privateKey = SecurityService.decrypt(certRecord.private_key!.trim());

    console.log(`Found Active Simulation CSID for: ${company.registered_name}`);
    console.log(`VAT Number: ${company.vat_number}\n`);

    // Clean CSID format
    const cleanCsid = csid.replace(/-----BEGIN CERTIFICATE-----/g, '')
                          .replace(/-----END CERTIFICATE-----/g, '')
                          .replace(/\s+/g, '');

    // ---------------------------------------------------------------------
    // TEST A: Standard B2B Invoice -> ZATCA Simulation Clearance
    // ---------------------------------------------------------------------
    console.log('--- TEST A: B2B Standard Invoice (Clearance Flow) ---');
    const b2bInvoiceNumber = `SIM-B2B-${Date.now()}`;
    const b2bUuid = crypto.randomUUID();

    const sampleB2BInvoice = {
        invoiceNumber: b2bInvoiceNumber,
        uuid: b2bUuid,
        issueDate: new Date().toISOString(),
        invoiceSubtype: 'STANDARD',
        profileId: 'reporting:1.0',
        invoiceCounterValue: 10,
        documentType: 'Invoice',
        currencyCode: 'SAR',
        supplier: {
            name: company.registered_name || '3114992186',
            vatNumber: company.vat_number,
            address: {
                streetName: company.street_name || 'Shams Al Deen',
                buildingNumber: company.building_number || '6823',
                citySubdivisionName: company.city_subdivision || 'Al Rimal Dist',
                cityName: company.city || 'RIYADH',
                postalZone: company.postal_zone || '13263',
                countryCode: 'SA'
            }
        },
        customer: {
            name: 'Saudi Business Client LLC',
            vatNumber: '300000000000003',
            address: {
                streetName: 'Olaya Street',
                buildingNumber: '2222',
                citySubdivisionName: 'Olaya Dist',
                cityName: 'RIYADH',
                postalZone: '12211',
                countryCode: 'SA'
            }
        },
        items: [
            {
                name: 'Enterprise Transport Logistics Service',
                quantity: 1,
                unitPrice: 1000,
                subtotal: 1000,
                taxCategory: 'S',
                vatRate: 0.15,
                vatAmount: 150,
                total: 1150
            }
        ],
        totalAmount: 1150,
        vatAmount: 150,
        taxExclusiveAmount: 1000
    };

    console.log(`1. Generating UBL 2.1 XML for ${b2bInvoiceNumber}...`);
    const xmlB2B = await (generateInvoiceXML as any)(sampleB2BInvoice);

    console.log(`2. Signing XML using ZATCA SDK & Simulation Certificate...`);
    const signedB2B = await signInvoice(xmlB2B, cleanCsid, privateKey, true);
    console.log(`   - Canonical Invoice Hash: ${signedB2B.hash}`);
    console.log(`   - XML Signed & Sealed: ✅ SUCCESS`);

    console.log(`3. Submitting to ZATCA Simulation Clearance Endpoint...`);
    try {
        const resB2B = await clearInvoice(
            'simulation',
            cleanCsid,
            secret,
            signedB2B.hash,
            Buffer.from(signedB2B.signedXml).toString('base64'),
            b2bUuid
        );

        console.log('\n--- ZATCA SIMULATION CLEARANCE RESPONSE ---');
        console.log(JSON.stringify(resB2B, null, 2));
        console.log('-------------------------------------------\n');

        // Persist to Neon DB
        await prisma.invoice.create({
            data: {
                company: { connect: { id: company.id } },
                invoice_number: b2bInvoiceNumber,
                uuid: b2bUuid,
                date: new Date(),
                total_amount: 1150,
                tax_amount: 150,
                hash: signedB2B.hash,
                xml_payload: signedB2B.signedXml,
                status: resB2B.clearanceStatus === 'CLEARED' ? 'CLEARED' : 'FAILED',
                submission_response: JSON.stringify(resB2B),
                created_at: new Date()
            }
        });
        console.log(`💾 Saved B2B Invoice Record to Neon DB: ${b2bInvoiceNumber} (Status: ${resB2B.clearanceStatus || 'SUBMITTED'})`);
    } catch (e: any) {
        console.error('❌ B2B Clearance Error:', e.response?.data || e.message);
    }

    // ---------------------------------------------------------------------
    // TEST B: Simplified B2C Invoice -> ZATCA Simulation Reporting
    // ---------------------------------------------------------------------
    console.log('\n--- TEST B: B2C Simplified Invoice (Reporting Flow) ---');
    const b2cInvoiceNumber = `SIM-B2C-${Date.now()}`;
    const b2cUuid = crypto.randomUUID();

    const sampleB2CInvoice = {
        invoiceNumber: b2cInvoiceNumber,
        uuid: b2cUuid,
        issueDate: new Date().toISOString(),
        invoiceSubtype: 'SIMPLIFIED',
        profileId: 'reporting:1.0',
        invoiceCounterValue: 11,
        documentType: 'Invoice',
        currencyCode: 'SAR',
        supplier: {
            name: company.registered_name || '3114992186',
            vatNumber: company.vat_number,
            address: {
                streetName: company.street_name || 'Shams Al Deen',
                buildingNumber: company.building_number || '6823',
                citySubdivisionName: company.city_subdivision || 'Al Rimal Dist',
                cityName: company.city || 'RIYADH',
                postalZone: company.postal_zone || '13263',
                countryCode: 'SA'
            }
        },
        items: [
            {
                name: 'Daily Transport Pass',
                quantity: 1,
                unitPrice: 200,
                subtotal: 200,
                taxCategory: 'S',
                vatRate: 0.15,
                vatAmount: 30,
                total: 230
            }
        ],
        totalAmount: 230,
        vatAmount: 30,
        taxExclusiveAmount: 200
    };

    console.log(`1. Generating UBL 2.1 XML for ${b2cInvoiceNumber}...`);
    const xmlB2C = await (generateInvoiceXML as any)(sampleB2CInvoice);

    console.log(`2. Signing XML using ZATCA SDK & Simulation Certificate...`);
    const signedB2C = await signInvoice(xmlB2C, cleanCsid, privateKey, true);
    console.log(`   - Canonical Invoice Hash: ${signedB2C.hash}`);
    console.log(`   - XML Signed & Sealed: ✅ SUCCESS`);

    console.log(`3. Submitting to ZATCA Simulation Reporting Endpoint...`);
    try {
        const resB2C = await reportInvoice(
            'simulation',
            cleanCsid,
            secret,
            signedB2C.hash,
            Buffer.from(signedB2C.signedXml).toString('base64'),
            b2cUuid
        );

        console.log('\n--- ZATCA SIMULATION REPORTING RESPONSE ---');
        console.log(JSON.stringify(resB2C, null, 2));
        console.log('-------------------------------------------\n');

        // Persist to Neon DB
        await prisma.invoice.create({
            data: {
                company: { connect: { id: company.id } },
                invoice_number: b2cInvoiceNumber,
                uuid: b2cUuid,
                date: new Date(),
                total_amount: 230,
                tax_amount: 30,
                hash: signedB2C.hash,
                xml_payload: signedB2C.signedXml,
                status: resB2C.reportingStatus === 'REPORTED' ? 'REPORTED' : 'FAILED',
                submission_response: JSON.stringify(resB2C),
                created_at: new Date()
            }
        });
        console.log(`💾 Saved B2C Invoice Record to Neon DB: ${b2cInvoiceNumber} (Status: ${resB2C.reportingStatus || 'SUBMITTED'})`);
    } catch (e: any) {
        console.error('❌ B2C Reporting Error:', e.response?.data || e.message);
    }

    console.log('\n========================================================');
    console.log('🎉 SIMULATION INVOICE SUBMISSION TESTS COMPLETED!');
    console.log('========================================================');
}

main().catch(console.error).finally(() => prisma.$disconnect());
