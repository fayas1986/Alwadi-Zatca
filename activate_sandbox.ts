import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.erp_configuration.updateMany({
    where: { environment: 'SANDBOX' },
    data: { is_active: true }
  });
  console.log('SANDBOX configurations activated.');
}
main().finally(() => prisma.$disconnect());
