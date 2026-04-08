import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const doc = await prisma.erp_configuration.findUnique({
        where: { id: 'dda87dfe-bb65-4b39-a885-62f2b9eae36d' }
    });
    console.log('Document:', JSON.stringify(doc, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
