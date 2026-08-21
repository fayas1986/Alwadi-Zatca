import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const configs = await prisma.erp_configuration.findMany();
    console.log(configs);
}
main().catch(console.error).finally(() => prisma.$disconnect());
