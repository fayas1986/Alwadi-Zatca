import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invoice = await prisma.invoice.findFirst({
        where: { invoice_number: 'SAU/26/INV/001865' }
    });
    if (!invoice) return console.log('Invoice not found');
    console.log(JSON.stringify(invoice, null, 2));
}

main().finally(() => prisma.$disconnect());