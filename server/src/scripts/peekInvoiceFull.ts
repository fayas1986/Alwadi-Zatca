import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function peek() {
    const inv = await prisma.invoice.findFirst({
        where: { invoice_number: 'SAU/26/INV/001988' }
    });

    if (inv) {
        console.log('--- XML FULL Peeking ---');
        console.log(inv.xml_payload?.substring(0, 5000));
    } else {
        console.log('Invoice not found');
    }
}

peek().finally(() => prisma.$disconnect());
