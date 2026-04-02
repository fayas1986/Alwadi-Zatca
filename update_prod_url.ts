import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.erp_configuration.updateMany({
    where: { environment: 'PRODUCTION', is_active: true },
    data: { base_url: 'http://localhost:3001/api/erp/mock-server' }
  });
  console.log('PRODUCTION configuration updated to mock-server.');
}
main().finally(() => prisma.$disconnect());
