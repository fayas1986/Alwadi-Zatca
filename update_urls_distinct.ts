import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Update Sandbox
  await prisma.erp_configuration.updateMany({
    where: { environment: 'SANDBOX' },
    data: { base_url: 'http://localhost:3001/api/erp/mock-server' }
  });
  // Update Production
  await prisma.erp_configuration.updateMany({
    where: { environment: 'PRODUCTION', is_active: true },
    data: { base_url: 'http://localhost:3001/api/erp/mock-server-prod' }
  });
  console.log('ERP configurations updated with distinct mock URLs.');
}
main().finally(() => prisma.$disconnect());
