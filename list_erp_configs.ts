
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const configs = await prisma.erp_configuration.findMany({
        where: { is_active: true },
        include: { company: true }
    });

    console.log('ERP Configurations:');
    configs.forEach(c => {
        console.log(`- Name: ${c.name || 'Unnamed'}`);
        console.log(`  Client ID (x-client-id): ${c.id}`);
        console.log(`  API Key (x-api-key / secret): ${c.api_key}`);
        console.log(`  Environment: ${c.environment}`);
        console.log(`  Company: ${c.company.registered_name}`);
        console.log('-------------------');
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
