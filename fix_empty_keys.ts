import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.erp_configuration.findMany({
    where: {
      AND: [
        { type: 'CUSTOM' },
        { OR: [ { api_key: '' }, { api_key: null as any } ] }
      ]
    }
  });

  if (configs.length === 0) {
    console.log('No CUSTOM configurations with empty api_key found.');
    return;
  }

  for (const config of configs) {
    const prefix = 'cus'; // Custom
    const randomPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const generatedKey = `sk_${prefix}_test_${randomPart}`;
    
    await prisma.erp_configuration.update({
      where: { id: config.id },
      data: { api_key: generatedKey }
    });
    
    console.log(`Updated CUSTOM ERP Configuration (ID: ${config.id}) with new key: [${generatedKey}]`);
  }
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
