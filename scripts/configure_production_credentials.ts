import { ComplianceService } from '../server/src/services/complianceService.js';
import prisma from '../server/src/lib/prisma.js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function main() {
    console.log(`=== ZATCA PRODUCTION CREDENTIAL CONFIGURATION ===`);

    const vatNumber = process.env.VAT_NUMBER || process.env.COMPANY_VAT || '311499218600003';
    const csid = process.env.PRODUCTION_CSID || process.env.CSID;
    const secret = process.env.PRODUCTION_SECRET || process.env.SECRET;
    
    let privateKey = process.env.PRIVATE_KEY;
    const keyPath = process.env.PRIVATE_KEY_PATH;
    if (!privateKey && keyPath && fs.existsSync(keyPath)) {
        privateKey = fs.readFileSync(keyPath, 'utf-8');
    }

    if (!csid || !secret || !privateKey) {
        console.error(`❌ Error: Missing required environment variables.`);
        console.error(`Please provide:`);
        console.error(`  PRODUCTION_CSID="..."`);
        console.error(`  PRODUCTION_SECRET="..."`);
        console.error(`  PRIVATE_KEY="..." or PRIVATE_KEY_PATH="/path/to/key.pem"`);
        console.error(`Optional: VAT_NUMBER="311499218600003"`);
        process.exit(1);
    }

    const company = await prisma.company.findFirst({
        where: { vat_number: vatNumber, is_active: true }
    });

    console.log(`Configuring Production credentials for Company VAT: ${vatNumber}`);
    if (company) {
        console.log(`Company Name: ${company.registered_name}`);
    }

    try {
        const result = await ComplianceService.configureProductionCredentials({
            vatNumber,
            certificatePemOrCsid: csid,
            secret,
            privateKeyPem: privateKey,
            companyName: company?.registered_name || 'Easy Lease Transport Services (Sole Proprietorship) L.L.C.',
            buildingNumber: company?.building_number || '6823',
            streetName: company?.street_name || 'Shams Al Deen',
            citySubdivision: company?.city_subdivision || 'Al Rimal Dist',
            postalZone: company?.postal_zone || '13263',
            city: company?.city || 'RIYADH',
            crNumber: company?.cr_number || '1010816075'
        }, {
            email: 'admin@zatca-fatoora.com',
            role: 'SUPER_ADMIN',
            ip: '127.0.0.1'
        });

        console.log(`\n========================================================`);
        console.log(`🎉 SUCCESS! Production credentials configured and activated successfully.`);
        console.log(`Company ID: ${result.companyId}`);
        console.log(`Keypair validation check: PASSED`);
        console.log(`Zero OTPs required.`);
        console.log(`========================================================`);
    } catch (e: any) {
        console.error(`❌ Configuration Error:`, e.message);
        process.exit(1);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
