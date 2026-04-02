import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

async function main() {
    console.log('🚀 ERP SIMULATION TEST SETUP');
    console.log('---------------------------');

    const args = process.argv.slice(2);
    const externalUrl = args[0] || 'http://localhost:3001/api/erp/mock-server';
    const vatNumber = args[1] || '311111111111113'; // Default test VAT

    try {
        // 1. Find the company
        const company = await prisma.company.findUnique({
            where: { vat_number: vatNumber },
            include: { certificates: true }
        });

        if (!company) {
            console.error(`❌ Company with VAT ${vatNumber} not found.`);
            return;
        }

        console.log(`✅ Found Company: ${company.registered_name} (${vatNumber})`);

        // 2. Ensure a Simulation certificate exists
        let simCert = company.certificates.find(c => c.type === 'SIMULATION' && c.is_active);
        if (!simCert) {
            console.warn(`⚠️ No active SIMULATION certificate found for VAT ${vatNumber}.`);
            console.log(`[Action] Creating a mock SIMULATION certificate for testing...`);
            simCert = await prisma.certificate.create({
                data: {
                    company_id: company.id,
                    type: 'SIMULATION',
                    certificate: 'MOCK_SIMULATION_CERT',
                    private_key: 'MOCK_SIMULATION_KEY',
                    public_key: 'MOCK_SIMULATION_PUB',
                    is_active: true,
                    csid: 'SIM-MOCK-CSID',
                    secret: 'SIM-MOCK-SECRET',
                    common_name: 'Simulation Tester',
                    serial_number: 'SIM-001'
                }
            });
        }
        console.log('✅ Simulation Certificate Ready.');

        // 3. Create/Update ERP Configuration for SIMULATION
        // Crucial: Only modify/create for SIMULATION environment
        let erpConfig = await prisma.erp_configuration.findFirst({
            where: { 
                company_id: company.id, 
                environment: 'SIMULATION'
            }
        });

        if (erpConfig) {
            console.log(`[Update] Updating existing SIMULATION ERP configuration (${erpConfig.id})...`);
            erpConfig = await prisma.erp_configuration.update({
                where: { id: erpConfig.id },
                data: { 
                    base_url: externalUrl,
                    is_active: true 
                }
            });
        } else {
            console.log(`[Create] Creating new SIMULATION ERP configuration...`);
            erpConfig = await prisma.erp_configuration.create({
                data: {
                    company_id: company.id,
                    type: 'EXTERNAL_ERP',
                    base_url: externalUrl,
                    environment: 'SIMULATION',
                    sync_interval: 1,
                    name: 'Vercel Simulation ERP'
                }
            });
        }
        console.log(`✅ ERP Configured: ${erpConfig.base_url}`);

        // 4. Trigger Sync if server is reachable
        console.log(`\n🔍 Attempting to trigger sync via ${BASE_URL}/erp/sync/${erpConfig.id}...`);
        try {
            const response = await axios.post(`${BASE_URL}/erp/sync/${erpConfig.id}`);
            console.log('✅ Sync Response:', JSON.stringify(response.data, null, 2));
        } catch (e: any) {
            console.warn(`⚠️ Could not trigger sync automatically (Server might be down or unreachable at ${BASE_URL})`);
            console.log(`👉 You can trigger it manually via: POST ${BASE_URL}/erp/sync/${erpConfig.id}`);
        }

        console.log('\n---------------------------');
        console.log('🏁 SETUP COMPLETE');
        console.log('Use this script to test your external ERP integration for SIMULATION mode.');

    } catch (error: any) {
        console.error('❌ Error during setup:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
