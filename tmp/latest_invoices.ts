import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const latest = await prisma.invoice.findMany({
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, invoice_number: true, created_at: true }
    });
    console.log('Latest Invoices:', JSON.stringify(latest, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
