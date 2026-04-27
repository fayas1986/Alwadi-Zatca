import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const deletedInvoices1 = await prisma.invoice.deleteMany({
        where: {
            invoice_number: {
                contains: 'DEBUG'
            }
        }
    });
    const deletedInvoices2 = await prisma.invoice.deleteMany({
        where: {
            invoice_number: 'SAU/26/INV/002171'
        }
    });
    console.log("Deleted " + deletedInvoices1.count + " DEBUG invoices and " + deletedInvoices2.count + " 002171 duplicate invoices.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });