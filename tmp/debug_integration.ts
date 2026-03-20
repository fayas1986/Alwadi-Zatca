import { fetchAndProcessInvoices } from '../server/src/services/integrationService';
import prisma from '../server/src/lib/prisma';

async function debug() {
    console.log('--- DIRECT INTEGRATION DEBUG ---');
    const url = 'https://fayas-erp-sandbox.mockable.io/invoices';
    const vat = '334534534532343';
    
    try {
        const results = await fetchAndProcessInvoices(url, 'Bearer test', vat, 'SANDBOX');
        console.log('Results:', JSON.stringify(results, null, 2));
        
        const invoice = await prisma.invoice.findFirst({ 
            where: { company_id: 38 },
            orderBy: { created_at: 'desc' }
        });
        console.log('Stored Invoice Metadata:', JSON.stringify(invoice?.metadata, null, 2));
    } catch (err: any) {
        console.error('DEBUG FAILED:', err.message);
    }
    
    process.exit(0);
}

debug();
