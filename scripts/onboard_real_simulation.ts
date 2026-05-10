
import { generateCSR } from '../server/src/services/sdkService';
import { onboardCompliance, requestProductionCSID } from '../server/src/services/zatcaService';
import prisma from '../server/src/lib/prisma';
import { SecurityService } from '../server/src/services/securityService';
import crypto from 'crypto';

async function onboardRealSimulation() {
    console.log("--- REAL ZATCA SIMULATION ONBOARDING ---");
    
    const vat = "300075588700003"; // Standard Simulation VAT
    const tin = "3000755887";      // Standard Simulation TIN
    const companyName = "RealProofCo";
    
    console.log(`1. Generating REAL CSR for VAT: ${vat}...`);
    
    const csrConfig = `csr.common.name=RealProofSim
csr.serial.number=1-Standard|2-Desktop|3-${crypto.randomUUID()}
csr.organization.identifier=${vat}
csr.organization.unit.name=${tin}
csr.organization.name=${tin}
csr.country.name=SA
csr.invoice.type=1100
csr.location.address=Riyadh
csr.industry.business.category=IT`;

    const { csr, privateKey } = await generateCSR(csrConfig, false);
    
    console.log("\n--- YOUR REAL CSR ---");
    console.log(csr);
    console.log("---------------------\n");
    
    console.log("ACTION REQUIRED:");
    console.log("1. Go to ZATCA Fatoora Portal (Simulation): https://fatoora.zatca.gov.sa/");
    console.log("2. Log in and go to 'Onboard Solution Unit'.");
    console.log("3. Generate an OTP (6 digits).");
    console.log("4. Once you have the OTP, run this script again with: OTP=<your_otp> npx tsx scripts/onboard_real_simulation.ts");
    
    const otp = process.env.OTP;
    if (!otp) {
        console.log("\n[PAUSED] Waiting for OTP via environment variable.");
        return;
    }

    console.log(`\n2. Exchanging OTP ${otp} for Compliance CSID...`);
    const complianceResult = await onboardCompliance('simulation', csr, otp);
    const complianceCSID = complianceResult.binarySecurityToken;
    const complianceSecret = complianceResult.secret;
    
    console.log("Compliance CSID obtained successfully.");

    console.log("3. Requesting Production CSID (Simulation)...");
    const prodResult = await requestProductionCSID('simulation', complianceCSID, complianceSecret, complianceResult.requestID);
    
    console.log("Production CSID obtained successfully.");

    console.log("4. Storing in Database...");
    
    // Create/Update Company
    const company = await prisma.company.upsert({
        where: { vat_number: vat },
        update: { environment: 'SIMULATION' },
        create: {
            vat_number: vat,
            registered_name: companyName,
            environment: 'SIMULATION',
            cr_number: '1234567890',
            user: { connect: { id: (await prisma.user.findFirst())?.id } }
        }
    });

    // Store Certificate
    await (prisma.certificate as any).create({
        data: {
            company_id: company.id,
            type: 'SIMULATION',
            certificate: prodResult.binarySecurityToken,
            private_key: SecurityService.encrypt(privateKey),
            csid: prodResult.binarySecurityToken,
            secret: SecurityService.encrypt(prodResult.secret),
            is_active: true
        }
    });

    console.log(`\nSUCCESS! Company ${company.id} is now onboarded with REAL ZATCA credentials.`);
    console.log("You can now run the production validation or a real invoice test.");
}

onboardRealSimulation().catch(console.error).finally(() => prisma.$disconnect());
