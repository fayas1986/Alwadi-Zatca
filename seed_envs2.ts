import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding ERP configurations for all three environments...");

    const company = await prisma.company.findFirst();

    if (!company) {
        console.error("No companies found!");
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
                    sync_interval: 1,
                    is_active: true
                }
            });
        }
    }

    console.log("Configs created.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
