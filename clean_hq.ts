import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanHQ() {
    console.log("Cleaning HQ names...");
    const result = await prisma.company.updateMany({
        where: {
            branch_name: {
                contains: 'HQ'
            }
        },
        data: {
            branch_name: 'Headquarters'
        }
    });
    console.log(`Cleaned ${result.count} entries. Resulting branch_name will be: Headquarters`);
}

cleanHQ().catch(console.error).finally(() => prisma.$disconnect());
