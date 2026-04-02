import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSync() {
    console.log('--- Multi-Environment ERP Sync Check ---');
    
    // 1. ERP Configurations
    const configs = await prisma.erp_configuration.findMany({
        include: { company: true }
    });
    
    console.log(`\nFound ${configs.length} ERP Configurations:`);
    console.table(configs.map(c => ({
        id: c.id,
        company: c.company.registered_name,
        env: c.environment,
        active: c.is_active,
        url: c.base_url
    })));

    // 2. Invoice Counts by Environment
    // We'll need to join with company environment or erp_configuration environment if available
    // But since `invoice` table doesn't have an environment column directly (usually it's linked to company)
    // Let's check how invoices are distributed
    
    const invoices = await prisma.invoice.groupBy({
        by: ['company_id'],
        _count: { id: true }
    });

    console.log('\nInvoices per Company:');
    for (const inv of invoices) {
        const company = await prisma.company.findUnique({ where: { id: inv.company_id } });
        console.log(`- ${company?.registered_name} (${company?.environment || 'Default'}): ${inv._count.id} invoices`);
    }

    // 3. Check for specific environment configurations
    const environments = ['SANDBOX', 'SIMULATION', 'PRODUCTION'];
    for (const env of environments) {
        const envConfigs = configs.filter(c => c.environment === env);
        if (envConfigs.length > 0) {
            console.log(`\n✅ ${env} environment has ${envConfigs.length} configuration(s).`);
            const active = envConfigs.some(c => c.is_active);
            console.log(`   Status: ${active ? 'ACTIVE' : 'INACTIVE'}`);
        } else {
            console.log(`\n⚠️ ${env} environment has NO configurations.`);
        }
    }
}

checkSync()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
