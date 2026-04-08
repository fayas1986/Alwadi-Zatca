import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const configs = await prisma.erp_configuration.findMany({
        where: { is_active: true }
    });
    
    console.log('--- ERP Integration Audit ---');
    configs.forEach(config => {
        const isExternal = config.base_url?.includes('factslite.com');
        console.log(`Company: ${config.company_id} | Env: ${config.environment} | URL: ${config.base_url} | Integration: ${isExternal ? 'EXTERNAL' : 'INTERNAL/MOCK'}`);
    });
    
    const simulationExternal = configs.filter(c => c.environment === 'SIMULATION' && c.base_url?.includes('factslite.com')).length;
    const sandboxExternal = configs.filter(c => c.environment === 'SANDBOX' && c.base_url?.includes('factslite.com')).length;
    
    console.log('\nSummary:');
    console.log(`- Simulation External: ${simulationExternal}`);
    console.log(`- Sandbox External: ${sandboxExternal} (Should be 0)`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
