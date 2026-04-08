import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const doc = await prisma.erp_configuration.findUnique({
        where: { id: '35553280-8082-4170-a143-158e22e41116' }
    });
    console.log('Doc:', JSON.stringify(doc, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
