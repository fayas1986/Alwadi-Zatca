
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invoice = await prisma.invoice.findFirst({
        where: {
            invoice_number: 'SAU/26/INV/001988'
        }
    });

    if (!invoice) {
        console.log('No invoices found');
        return;
    }

    console.log('Invoice ID:', invoice.id);
    console.log('Invoice Number:', (invoice as any).invoice_number);
    console.log('Metadata Raw:', invoice.metadata);
    console.log('Metadata Type:', typeof invoice.metadata);
    if (typeof invoice.metadata === 'string') {
        try {
            const parsed = JSON.parse(invoice.metadata);
            console.log('Metadata Parsed Items:', JSON.stringify(parsed.items, null, 2));
        } catch (e) {
            console.log('Metadata is not valid JSON string');
        }
    } else {
        console.log('Metadata Items:', JSON.stringify((invoice.metadata as any)?.items, null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
