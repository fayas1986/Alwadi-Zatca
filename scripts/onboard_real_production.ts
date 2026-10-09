import { ComplianceService } from '../server/src/services/complianceService.js';
import prisma from '../server/src/lib/prisma.js';
import 'dotenv/config';
import crypto from 'crypto';

async function main() {
    const otp = process.env.OTP;
    if (!otp) {
        console.error("❌ Please provide the Production OTP in the environment: OTP=xxxxxx npx tsx scripts/onboard_real_production.ts");
        process.exit(1);
    }

    console.log(`========================================================`);
    console.log(`⚡ REAL ZATCA PRODUCTION CSID ONBOARDING FLOW`);
    console.log(`========================================================\n`);
    console.log(`Target Environment : PRODUCTION`);
    console.log(`Using Production OTP: [SANITIZED]`);

    const dbCompany = await prisma.company.findFirst({
        where: { is_active: true }
    });
    if (!dbCompany) {
        console.error("❌ No active company in DB.");
        return;
    }

    const vat = dbCompany.vat_number;
    const tin = vat.substring(0, 10);
    const companyName = dbCompany.registered_name || process.env.COMPANY_REGISTERED_NAME || "Alwadi Trading L.L.C.";

    const onboardData = {
        vat,
        otp,
        companyName,
        commonName: dbCompany.registered_name || process.env.COMPANY_REGISTERED_NAME || "Alwadi Trading L.L.C.",
        branchName: dbCompany.branch_name || "HQ",
        location: dbCompany.city || "Riyadh",
        industry: "Services",
        invoiceType: "1000", // Standard Tax Invoices (B2B Clearance)
        serialNumber: `1-ZATCA|2-Desktop|3-${crypto.randomUUID()}`,
        tin,
        buildingNumber: dbCompany.building_number || "1111",
        streetName: dbCompany.street_name || "Test Street",
        citySubdivision: dbCompany.city_subdivision || "District",
        postalZone: dbCompany.postal_zone || "11111",
        city: dbCompany.city || "Riyadh",
        environment: "production" as const
    };

    console.log("Exchanging Production OTP with ZATCA Live Gateway...");
    try {
        const result = await ComplianceService.onboard(onboardData, {
            email: "admin@zatca-fatoora.com",
            role: "SUPER_ADMIN",
            ip: "127.0.0.1"
        });
        console.log("\n========================================================");
        console.log("🎉 SUCCESS! Real Production CSID Issued by ZATCA!");
        console.log("Production Certificate record activated in database.");
        console.log("Result Summary:", JSON.stringify({
            success: result.success,
            companyId: result.companyId,
            certId: result.certId,
            environment: result.environment
        }, null, 2));
        console.log("========================================================");

        // Next: Automatically execute the Production Auth Probe & Invoice Tests
        console.log("\nRunning Production Authentication & Connectivity Verification...");
        const { testLiveProductionCredentials } = await import('./test_live_production_credentials.js');
        await testLiveProductionCredentials();
    } catch (e: any) {
        if (e.response) {
            console.error("❌ ZATCA Production API Error:", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("❌ Production Onboarding Error:", e.message);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
