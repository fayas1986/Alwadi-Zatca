import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function peek() {
    const inv = await prisma.invoice.findFirst({
        where: { invoice_number: 'SAU/26/INV/001988' }
    });

    if (inv) {
        console.log('Invoice Number:', inv.invoice_number);
        console.log('XML Payload prefix:', inv.xml_payload?.substring(0, 100));
        
        try {
            const decoded = Buffer.from(inv.xml_payload || '', 'base64').toString('utf8');
            console.log('Decoded start:', decoded.substring(0, 100));
            console.log('Includes InvoiceLine:', decoded.includes('InvoiceLine'));
        } catch (e) {
            console.log('Base64 decode failed');
        }
    } else {
        console.log('Invoice not found');
    }
}

peek().finally(() => prisma.$disconnect());
