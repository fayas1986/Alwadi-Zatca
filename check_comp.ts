import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCompanies() {
    const companies = await prisma.company.findMany();
    console.log(companies.map(c => ({ id: c.id, registered_name: c.registered_name, branch_name: c.branch_name })));
}

checkCompanies().catch(console.error).finally(() => prisma.$disconnect());
