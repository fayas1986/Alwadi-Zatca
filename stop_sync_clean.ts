import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function stopSyncAndClean() {
    console.log("1. Disabling all ERP configurations to stop the sync...");
    const disabled = await prisma.erp_configuration.updateMany({
        where: { is_active: true },
        data: { is_active: false }
    });
    console.log(`- Disabled ${disabled.count} ERP configurations.`);

    console.log("2. Deleting all remaining mock invoices...");
    const deleted = await prisma.invoice.deleteMany({
        where: {
            OR: [
                { invoice_number: { startsWith: 'MOCK-ERP' } },
                { invoice_number: { startsWith: 'ERP-PUSH' } }
            ]
        }
    });
    console.log(`- Deleted ${deleted.count} mock invoices.`);
    
    console.log("3. Killing the background sync process...");
}

stopSyncAndClean()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
