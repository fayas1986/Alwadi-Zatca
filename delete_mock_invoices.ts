import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteMockInvoices() {
    console.log("Deleting mock invoices...");

    const result = await prisma.invoice.deleteMany({
        where: {
            OR: [
                { invoice_number: { startsWith: 'MOCK-ERP' } },
                { invoice_number: { startsWith: 'ERP-PUSH' } },
                { invoice_number: { startsWith: 'SANDBOX-ERP' } },
                { invoice_number: { startsWith: 'PROD-ERP' } }

            ]
        }
    });

    console.log(`Deleted ${result.count} mock invoices.`);
}

deleteMockInvoices()
    .catch(e => {
        console.error("Error deleting mock invoices:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
