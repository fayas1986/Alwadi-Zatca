const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const config = await prisma.erp_configuration.findFirst();
    console.log(config ? config.id : 'NONE');
}
main().catch(console.error).finally(() => prisma.$disconnect());
