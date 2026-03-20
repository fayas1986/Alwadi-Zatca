
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany();
  console.log('--- Companies ---');
  companies.forEach(c => console.log(`ID: ${c.id}, Name: ${c.registered_name}, VAT: ${c.vat_number}`));

  const erpConfigs = await prisma.erp_configuration.findMany({ include: { company: true } });
  console.log('\n--- ERP Configs ---');
  erpConfigs.forEach(e => console.log(`ID: ${e.id}, Co: ${e.company.registered_name}, Env: ${e.environment}, URL: ${e.base_url}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
