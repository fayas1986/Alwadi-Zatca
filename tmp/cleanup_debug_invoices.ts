import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const deletedInvoices = await prisma.invoice.deleteMany({
        where: {
            invoice_number: {
                contains: '-DEBUG-'
            }
        }
    });
    console.log("Deleted " + deletedInvoices.count + " debug invoices.");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });