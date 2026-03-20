import prisma from '../server/src/lib/prisma';

async function deleteInvoices() {
    const deleted = await prisma.invoice.deleteMany({
        where: { company_id: 38 }
    });
    console.log(`Deleted ${deleted.count} invoices for company 38`);
    process.exit(0);
}

deleteInvoices();
