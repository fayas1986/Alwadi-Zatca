import { ComplianceService } from '../server/src/services/complianceService.js';
import prisma from '../server/src/lib/prisma.js';
import 'dotenv/config';
import crypto from 'crypto';

async function main() {
    const otp = process.env.OTP;
    if (!otp) {
        console.error("❌ Please provide the OTP in the environment: OTP=xxxxxx npx tsx scripts/onboard_real_simulation.ts");
        process.exit(1);
    }

    console.log(`--- REAL ZATCA SIMULATION ONBOARDING FLOW ---`);
    console.log(`Using OTP: ${otp}`);

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
        environment: "simulation" as const
    };

    console.log("Starting Compliance Onboarding workflow (SIMULATION)...");
    try {
        const result = await ComplianceService.onboard(onboardData, {
            email: "admin@zatca-fatoora.com",
            role: "SUPER_ADMIN",
            ip: "127.0.0.1"
        });
        console.log("\n========================================================");
        console.log("🎉 SUCCESS! Company has been successfully onboarded to ZATCA Simulation!");
        console.log("Certificate details updated in the database.");
        console.log("Result:", JSON.stringify(result, null, 2));
        console.log("========================================================");
    } catch (e: any) {
        if (e.response) {
            console.error("❌ ZATCA API Error:", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("❌ Onboarding Error:", e.message);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
