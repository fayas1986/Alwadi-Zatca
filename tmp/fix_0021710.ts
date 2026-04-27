import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invoice = await prisma.invoice.findFirst({
        where: { invoice_number: 'SAU/26/INV/0021710' }
    });
    if (!invoice) return console.log('Invoice not found');

    // Find or create customer
    let customer = await prisma.customer.findFirst({
        where: { name: 'Medical and Cosmetic Products Company Ltd.', company_id: invoice.company_id }
    });
    if (!customer) {
        customer = await prisma.customer.create({
            data: {
                name: 'Medical and Cosmetic Products Company Ltd.',
                company_id: invoice.company_id,
                vat_number: null,
                country: 'SA'
            }
        });
    }

    // Update invoice
    await prisma.invoice.update({
        where: { id: invoice.id },
        data: { 
            customer_id: customer.id,
            metadata: { 
                ...(invoice.metadata as object || {}), 
                customer: { name: 'Medical and Cosmetic Products Company Ltd.' } 
            }
        }
    });
    console.log('Fixed invoice 0021710 customer data');
}

main().finally(() => prisma.$disconnect());