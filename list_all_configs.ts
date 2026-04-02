import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const configs = await prisma.erp_configuration.findMany();
  console.log(JSON.stringify(configs, null, 2));
}
main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
