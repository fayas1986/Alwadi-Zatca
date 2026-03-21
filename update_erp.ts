import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    console.log("Updating ERP configs...");
    await prisma.erp_configuration.updateMany({
        data: {
            base_url: 'http://localhost:3001/api/erp/mock-server'
        }
    });

    const configs = await prisma.erp_configuration.findMany({
        include: { company: true }
    });

    for (const c of configs) {
        console.log(`Company: ${c.company.registered_name}, Env: ${c.environment || c.company.environment}, URL: ${c.base_url}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
