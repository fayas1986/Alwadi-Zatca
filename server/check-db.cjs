const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const companies = await prisma.company.findMany();
    console.log("Companies:", companies.map(c => ({
        id: c.id,
        name: c.registered_name,
        vat: c.vat_number
    })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
