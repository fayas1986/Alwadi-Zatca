import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding ERP configurations for all three environments...");

    // Find the primary company
    const company = await prisma.company.findFirst({
        where: { vat_number: '300000000000003' }
    });

    if (!company) {
        console.error("Company not found!");
        return;
    }

    const environments = ['SANDBOX', 'SIMULATION', 'PRODUCTION'];

    for (const env of environments) {
        const existing = await prisma.erp_configuration.findFirst({
            where: { company_id: company.id, environment: env }
        });

        if (!existing) {
            console.log(`Creating ERP config for ${env}`);
            await prisma.erp_configuration.create({
                data: {
                    company_id: company.id,
                    type: 'Mock REST API',
                    base_url: 'http://localhost:3001/api/erp/mock-server',
                    api_key: `mock-key-${env.toLowerCase()}`,
                    environment: env,
                    sync_interval: 1, // 1 minute
                    is_active: true
                }
            });
        } else {
            console.log(`Updating ERP config for ${env}`);
            await prisma.erp_configuration.update({
                where: { id: existing.id },
                data: {
                    base_url: 'http://localhost:3001/api/erp/mock-server',
                    api_key: `mock-key-${env.toLowerCase()}`,
                    is_active: true
                }
            });
        }
    }

    console.log("Done seeding configs. The sync service will pick them up.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
