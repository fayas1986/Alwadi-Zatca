import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const count = await prisma.invoice.count();
    console.log(`Total invoices: ${count}`);
    
    // Check Satguru Travels invoices
    const satguru = await prisma.company.findFirst({ where: { registered_name: 'Satguru Travels' } });
    if (satguru) {
        const satguruInvoices = await prisma.invoice.count({ where: { company_id: satguru.id } });
        console.log(`Invoices for Satguru Travels (ID: ${satguru.id}): ${satguruInvoices}`);
    } else {
        console.log('Satguru Travels not found');
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
