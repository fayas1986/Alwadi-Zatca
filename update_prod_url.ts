import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const prodUrl = process.argv[2];
  if (!prodUrl) {
    console.error('Please provide the Production D365 ERP base URL as an argument.');
    console.error('Usage: tsx update_prod_url.ts <URL>');
    process.exit(1);
  }

  await prisma.erp_configuration.updateMany({
    where: { environment: 'PRODUCTION', is_active: true },
    data: { base_url: prodUrl }
  });
  console.log(`PRODUCTION configuration updated to: ${prodUrl}`);
}

main().finally(() => prisma.$disconnect());
