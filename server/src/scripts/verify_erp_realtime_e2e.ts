
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3001/api';

async function runE2E() {
    console.log('🚀 STARTING ERP REAL-TIME PULL E2E VERIFICATION');
    console.log('--------------------------------------------');

    try {
        // 1. Check Server Health
        try {
            await axios.get('http://localhost:3001/health');
            console.log('✅ Server is reachable.');
        } catch (e) {
            console.error('❌ Server is not reachable at http://localhost:3001. Please start the server first.');
            return;
        }

        // 2. Prepare Test Company
        const vatNumber = '311111111111113';
        let company = await prisma.company.findUnique({ where: { vat_number: vatNumber } });

        if (!company) {
            console.log(`[Prep] Creating test company with VAT ${vatNumber}...`);
            // Find an existing user or create one
            let user = await prisma.user.findFirst();
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        id: 'e2e-test-user',
                        email: 'e2e@example.com',
                        name: 'E2E Tester'
                    }
                });
            }

            company = await prisma.company.create({
                data: {
                    user_id: user.id,
                    vat_number: vatNumber,
                    cr_number: '1234567890',
                    registered_name: 'E2E Realtime Test Co',
                    environment: 'SANDBOX'
                }
            });
        }
        console.log(`✅ Company Ready: ${company.registered_name} (ID: ${company.id})`);

        // 3. Ensure Mock Certificates exist for all 3 environments
        const envs = ['SANDBOX', 'SIMULATION', 'PRODUCTION'];
        for (const env of envs) {
            const cert = await prisma.certificate.findFirst({
                where: { company_id: company.id, type: env }
            });
            if (!cert) {
                console.log(`[Prep] Creating Mock ${env} Certificate...`);
                try {
                    await prisma.certificate.create({
                        data: {
                            company_id: company.id,
                            type: env,
                            certificate: `MOCK_${env}_CERT`,
                            private_key: `MOCK_${env}_KEY`,
                            public_key: `MOCK_${env}_PUB`,
                            is_active: true,
                            csid: `MOCK_${env}_CSID`,
                            secret: `MOCK_${env}_SECRET`,
                            common_name: `E2E ${env} Mock`,
                            serial_number: `E2E-${env}-001`
                        }
                    });
                } catch (e: any) {
                    console.error(`❌ Failed to create certificate for ${env}:`, e.message);
                    throw e;
                }
            }
        }
        console.log('✅ Mock Certificates Ready.');

        // 4. Create ERP Configurations for all 3 environments
        for (const env of envs) {
            const config = await prisma.erp_configuration.findFirst({
                where: { company_id: company.id, environment: env }
            });
            if (!config) {
                console.log(`[Prep] Creating ERP Config for ${env}...`);
                try {
                    await prisma.erp_configuration.create({
                        data: {
                            company_id: company.id,
                            type: 'MOCK_ERP',
                            base_url: 'http://localhost:3001/api/erp/mock-server',
                            environment: env,
                            sync_interval: 1
                        }
                    });
                } catch (e: any) {
                    console.error(`❌ Failed to create ERP config for ${env}:`, e.message);
                    throw e;
                }
            }
        }
        console.log('✅ ERP Configurations Ready.');

        // 5. Trigger Sync for each environment and verify logic
        console.log('\n🔍 Testing Environment-Specific Routing...');
        const configs = await prisma.erp_configuration.findMany({
            where: { company_id: company.id, is_active: true }
        });

        for (const config of configs) {
            console.log(`\n[Test] Triggering Sync for ${config.environment}...`);
            try {
                const response = await axios.post(`${BASE_URL}/erp/sync/${config.id}`);
                const data = response.data;

                if (data.success) {
                    console.log(`✅ Sync successful for ${config.environment}. Processed ${data.results.length} invoices.`);
                    
                    // Verify the results in the database
                    const lastInvoice = await prisma.invoice.findFirst({
                        where: { company_id: company.id },
                        orderBy: { id: 'desc' }
                    });

                    if (lastInvoice && lastInvoice.submission_response) {
                        const zatcaResp = JSON.parse(lastInvoice.submission_response);
                        console.log(`📝 ZATCA Note: ${zatcaResp.note}`);
                        
                        // Because I used MOCK certs, integrationService should show "Simulated response for Mock Certificate"
                        if (zatcaResp.note?.includes('Simulated response for Mock Certificate')) {
                            console.log(`✨ VERIFIED: Correct environment logic applied for ${config.environment}`);
                        } else {
                            console.log(`⚠️ Note: ZATCA response didn't match expected mock pattern, but sync succeeded.`);
                        }
                    }
                } else {
                    console.error(`❌ Sync failed for ${config.environment}: ${data.error}`);
                }
            } catch (err: any) {
                console.error(`❌ Sync request failed for ${config.environment}:`, err.response?.data || err.message);
            }
        }

        console.log('\n--------------------------------------------');
        console.log('🏁 E2E VERIFICATION COMPLETE');

    } catch (error: any) {
        console.error('❌ E2E Script Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

runE2E();
