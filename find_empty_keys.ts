import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const configs = await prisma.erp_configuration.findMany({
    where: {
      OR: [
        { api_key: '' },
        { api_key: null as any }
      ]
    }
  });
  console.log(`Found ${configs.length} configs with empty api_key`);
  configs.forEach(c => {
    console.log(`ID: ${c.id}, Type: ${c.type}, CompanyID: ${c.company_id}, Name: ${c.name}`);
  });
}
main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
