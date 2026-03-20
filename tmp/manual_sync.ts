import { SyncService } from '../server/src/services/syncService';
import prisma from '../server/src/lib/prisma';

async function manualSync() {
    console.log('--- STARTING MANUAL SYNC FOR VERIFICATION ---');
    
    const companyId = 38; // Satguru Travels
    
    // Ensure company 38 configs are active
    const updated = await prisma.erp_configuration.updateMany({
        where: { company_id: companyId },
        data: { is_active: true }
    });
    console.log(`Activated ${updated.count} ERP configurations for Company ${companyId}`);

    // Run sync loop
    console.log('Force running SyncService.runSync()...');
    await (SyncService as any).runSync();
    
    // Check if we can find any invoices now
    const count = await prisma.invoice.count({ where: { company_id: companyId } });
    console.log(`Final Invoice count for Company ${companyId}: ${count}`);
    
    // If count is 0, let's look for error logs in the console above or check integrationService directly
    
    console.log('--- MANUAL SYNC COMPLETED ---');
    process.exit(0);
}

manualSync();
