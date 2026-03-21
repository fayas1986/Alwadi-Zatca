import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkInvoices() {
    const count = await prisma.invoice.count({
        where: {
            OR: [
                { invoice_number: { startsWith: 'MOCK-ERP' } },
                { invoice_number: { startsWith: 'ERP-PUSH' } }
            ]
        }
    });
    console.log(`Mock invoices remaining: ${count}`);
}

checkInvoices().catch(console.error).finally(() => prisma.$disconnect());
