import prisma from '../server/src/lib/prisma';

async function findCompany() {
    const companies = await prisma.company.findMany({
        where: { registered_name: { contains: 'Headquarters' } }
    });
    console.log(JSON.stringify(companies, null, 2));
    process.exit(0);
}

findCompany();
