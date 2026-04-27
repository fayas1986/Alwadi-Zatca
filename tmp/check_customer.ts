import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({
        where: {
            invoice_number: 'SAU/26/INV/0021710'
        },
        include: { customer: true }
    });
    console.log(JSON.stringify(invoices, null, 2));
}

main().finally(() => prisma.$disconnect());