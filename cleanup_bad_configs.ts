import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('--- Cleaning up invalid ERP Configurations ---');
    const result = await prisma.erp_configuration.deleteMany({
        where: {
            base_url: {
                contains: 'localhost:3001'
            }
        }
    });
    console.log(`Deleted ${result.count} invalid configurations.`);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
