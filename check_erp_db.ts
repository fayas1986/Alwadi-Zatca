import prisma from './server/src/lib/prisma.js';

async function main() {
    try {
        const configs = await prisma.erp_configuration.findMany({
            include: { company: true }
        });
        console.log('ERP Configs:', JSON.stringify(configs, (key, value) => {
            if (key === 'api_key') return value?.substring(0, 5) + '...';
            return value;
        }, 2));
    } catch (error: any) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

main();
