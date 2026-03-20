
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('[Cleanup] Starting Mock Data Cleanup...');

    const companyId = 38; // Headquarters

    // 1. Clear base_url for ERP configs to stop sync
    console.log(`[Cleanup] Disabling mock base_url for Company ${companyId}...`);
    await prisma.erp_configuration.updateMany({
        where: { 
            company_id: companyId,
            base_url: { contains: 'localhost' } // Target only local mock URLs
        },
        data: { 
            base_url: '', // Clear the URL
            is_active: false // Deactivate to be safe
        }
    });

    // 2. Delete mock invoices
    console.log('[Cleanup] Deleting mock invoices starting with MOCK-ERP-...');
    const deleted = await prisma.invoice.deleteMany({
        where: {
            invoice_number: { startsWith: 'MOCK-ERP-' }
        }
    });

    console.log(`[Cleanup] Deleted ${deleted.count} mock invoices.`);
    console.log('[Cleanup] Completed successfully.');
}

main()
    .catch(e => console.error('[Error]', e))
    .finally(() => prisma.$disconnect());
