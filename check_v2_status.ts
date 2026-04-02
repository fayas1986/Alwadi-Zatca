import prisma from './server/src/lib/prisma.js';

async function main() {
    try {
        const inv = await prisma.invoice.findFirst({
            where: { metadata: { path: ['source'], equals: 'API_V1_ASYNC' } }, // Match the source we set
            orderBy: { created_at: 'desc' }
        });
        
        if (inv) {
            console.log('--- LATEST ASYNC INVOICE ---');
            console.log('UUID:', inv.uuid);
            console.log('Invoice #:', inv.invoice_number);
            console.log('Status:', inv.status);
            console.log('Error Log:', inv.error_log || 'NONE');
        } else {
            const all = await prisma.invoice.findMany({ take: 5, orderBy: { created_at: 'desc' } });
            console.log('All Recent Invoices:', JSON.stringify(all.map(i => ({ uuid: i.uuid, status: i.status })), null, 2));
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

main();
