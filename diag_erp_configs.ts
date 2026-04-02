import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.erp_configuration.findMany();
  configs.forEach(c => {
    console.log(`ID: ${c.id} | Type: ${c.type} | Name: ${c.name} | API Key: [${c.api_key}]`);
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => {
  prisma.$disconnect();
});
