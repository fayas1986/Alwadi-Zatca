import prisma from '../server/src/lib/prisma';

async function checkInvoices() {
    const invoices = await prisma.invoice.findMany({
        where: { company_id: 38 },
        select: {
            id: true,
            invoice_number: true,
            status: true,
            type: true,
            metadata: true,
            created_at: true
        },
        orderBy: { created_at: 'desc' }
    });

    console.log(JSON.stringify(invoices, null, 2));
    process.exit(0);
}

checkInvoices();
