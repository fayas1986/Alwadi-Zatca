import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invoice = await prisma.invoice.findFirst({
        where: { invoice_number: 'SAU/26/INV/001865' }
    });
    if (!invoice) return console.log('Invoice not found');

    const updatedMetadata = {
        ...(invoice.metadata as object || {}),
        customer: { name: 'STTS Central Holiday' },
        items: [
            {
                name: 'Hotel Ticket',
                quantity: 1,
                unitPrice: 326.09,
                vatRate: 15,
                taxAmount: 48.91,
                lineTotal: 375
            }
        ]
    };

    await prisma.invoice.update({
        where: { id: invoice.id },
        data: { metadata: updatedMetadata }
    });
    console.log('Fixed invoice 001865 items');
}

main().finally(() => prisma.$disconnect());