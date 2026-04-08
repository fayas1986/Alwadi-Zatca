import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const configs = await prisma.erp_configuration.findMany({
        include: { company: true }
    });
    console.log('All ERP Configs:', JSON.stringify(configs, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
