
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('[Setup] Starting RBAC and Environment Fix...');

    const alkaEmail = 'alka.sharma@yiron.in';
    const companyVat = '334534534532343'; // Company 38
    const mockUrl = 'http://localhost:3001/api/erp/mock-server';

    // 1. Ensure Super Admin exists
    const superAdminEmail = 'admin@system.local';
    let superAdmin = await prisma.user.findUnique({ where: { email: superAdminEmail } });
    if (!superAdmin) {
        console.log('[Setup] Creating Super Admin...');
        superAdmin = await prisma.user.create({
            data: {
                id: 'system_admin',
                email: superAdminEmail,
                name: 'System Administrator',
                role: 'SUPER_ADMIN',
                password: 'encrypted_password_here' // In real app, use proper hash
            }
        });
    }

    // 2. Find Alka and Company 38
    const alka = await prisma.user.findUnique({ where: { email: alkaEmail } });
    const company = await prisma.company.findFirst({ where: { vat_number: companyVat } });

    if (!alka || !company) {
        console.error('[Error] Could not find Alka or Company 38');
        return;
    }

    console.log(`[Setup] Linking Alka (${alka.id}) to Company ${company.id} (${company.registered_name})`);

    // 3. Update Company Ownership
    await prisma.company.update({
        where: { id: company.id },
        data: { user_id: alka.id }
    });

    // 4. Update Alka's Role and Company Name
    await prisma.user.update({
        where: { id: alka.id },
        data: { 
            role: 'IT_ADMIN', // Keep as IT_ADMIN based on user request
            company_name: company.registered_name
        }
    });

    // 5. Setup ERP Environments for Company 38
    const environments = ['SANDBOX', 'SIMULATION', 'PRODUCTION'];
    for (const env of environments) {
        console.log(`[Setup] Ensuring ERP Config for ${env}...`);
        // Note: Using findFirst/create pattern as there's no unique constraint on company_id+environment
        const existing = await prisma.erp_configuration.findFirst({
            where: {
                company_id: company.id,
                environment: env
            }
        });

        if (existing) {
            await prisma.erp_configuration.update({
                where: { id: existing.id },
                data: {
                    base_url: mockUrl,
                    is_active: true
                }
            });
        } else {
            await prisma.erp_configuration.create({
                data: {
                    company_id: company.id,
                    base_url: mockUrl,
                    api_key: `mock-key-${env.toLowerCase()}`,
                    environment: env,
                    type: 'Custom',
                    is_active: true
                }
            });
        }
    }

    console.log('[Setup] Fix completed successfully.');
}

main()
    .catch(e => console.error('[Error]', e))
    .finally(() => prisma.$disconnect());
