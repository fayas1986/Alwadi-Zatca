import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({
        select: {
            id: true,
            invoice_number: true,
            qr_code: true,
            hash: true,
            metadata: true
        }
    });

    const mockInvoices = invoices.filter(inv => 
        inv.qr_code === 'mock_qr_code_for_testing' || 
        (inv.hash && inv.hash.startsWith('mock_hash_')) ||
        (inv.invoice_number && inv.invoice_number.includes('-DEBUG')) ||
        (inv.metadata && (inv.metadata as any).isMock === true)
    );

    console.log(`Total invoices: ${invoices.length}`);
    console.log(`Total mock invoices: ${mockInvoices.length}`);
    console.log('Mock invoices sample:');
    console.log(mockInvoices.map(i => i.invoice_number).join(', '));
}

main().finally(() => prisma.$disconnect());
