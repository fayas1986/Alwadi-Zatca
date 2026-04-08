import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Revert Sandbox
    const sandboxUpdate = await prisma.erp_configuration.updateMany({
        where: { environment: 'SANDBOX' },
        data: {
            base_url: 'http://localhost:3001/api/erp/mock-server',
            api_key: 'sk_mic_test_xstbwwq4htw137jj' // Reverting to a generic key or original
        }
    });
    console.log(`Reverted ${sandboxUpdate.count} SANDBOX configurations to mock.`);

    // 2. Ensure Production is mock (if it isn't already)
    const prodUpdate = await prisma.erp_configuration.updateMany({
        where: { environment: 'PRODUCTION' },
        data: {
            base_url: 'http://localhost:3001/api/erp/mock-server',
            api_key: 'sk_mic_test_xstbwwq4htw137jj'
        }
    });
    console.log(`Ensured ${prodUpdate.count} PRODUCTION configurations are set to mock.`);

    // 3. Confirm Simulation state
    const simulationConfigs = await prisma.erp_configuration.findMany({
        where: { environment: 'SIMULATION' }
    });
    console.log(`SIMULATION configurations remain at: ${JSON.stringify(simulationConfigs.map(c => c.base_url))}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
