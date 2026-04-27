import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invoice = await prisma.invoice.findFirst({
        where: { invoice_number: 'SAU/26/INV/0021710' }
    });
    if (!invoice) return console.log('Invoice not found');

    const updatedMetadata = {
        ...(invoice.metadata as object || {}),
        customer: { name: 'Medical and Cosmetic Products Company Ltd.' },
        items: [
            {
                name: 'Airline Ticket',
                quantity: 1,
                unitPrice: 778.26,
                vatRate: 15,
                taxAmount: 116.74,
                total: 895,
                subtotal: 778.26
            }
        ]
    };

    await prisma.invoice.update({
        where: { id: invoice.id },
        data: { metadata: updatedMetadata }
    });
    console.log('Fixed invoice 0021710 items');
}

main().finally(() => prisma.$disconnect());