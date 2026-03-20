import prisma from '../server/src/lib/prisma';

async function checkConfigs() {
    const configs = await prisma.erp_configuration.findMany({
        where: { is_active: true },
        include: { company: true }
    });
    console.log(JSON.stringify(configs, null, 2));
    process.exit(0);
}

checkConfigs();
