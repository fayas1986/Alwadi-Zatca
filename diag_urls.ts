import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const configs = await prisma.erp_configuration.findMany({ include: { company: true } });
  for (const c of configs) {
    console.log(`CONFIG: ID=${c.id} COMPANY=${c.company.registered_name} ENV=${c.environment} ACTIVE=${c.is_active} URL=${c.base_url}`);
  }
}
main().finally(() => prisma.$disconnect());
