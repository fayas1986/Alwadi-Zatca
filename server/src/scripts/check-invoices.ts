import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.invoice.count({ where: { is_deleted: false } });
    console.log(`Active Invoices Count: ${count}`);

    const grouped = await prisma.invoice.groupBy({
        by: ['company_id', 'status', 'type'],
        _count: true
    });
    console.log('Grouped by company_id, status, type:', JSON.stringify(grouped, null, 2));

    const sample = await prisma.invoice.findFirst();
    console.log('Sample invoice fields:', sample ? {
        id: sample.id,
        invoice_number: sample.invoice_number,
        company_id: sample.company_id,
        status: sample.status,
        type: sample.type,
        date: sample.date,
        total_amount: sample.total_amount
    } : null);
}

main().catch(console.error).finally(() => prisma.$disconnect());
