import prisma from '../server/src/lib/prisma';

async function listCompanies() {
    const companies = await prisma.company.findMany({
        select: { id: true, registered_name: true, vat_number: true }
    });
    console.log(JSON.stringify(companies, null, 2));
    process.exit(0);
}

listCompanies();
