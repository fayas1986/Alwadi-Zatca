import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Multi-Environment Sync Diagnostic ---');
  
  // 1. Check ERP Configurations
  const erpConfigs = await prisma.erp_configuration.findMany({
    include: { company: true }
  });
  
  console.log('\n[ERP Configurations]');
  console.table(erpConfigs.map(c => ({
    company: c.company.registered_name,
    environment: c.environment,
    active: c.is_active,
    url: c.base_url
  })));

  // 2. Aggregate Invoices by Company Environment
  const companies = await prisma.company.findMany({
    include: {
      _count: {
        select: { invoices: true }
      }
    }
  });

  console.log('\n[Invoices by Company Environment]');
  console.table(companies.map(c => ({
    company: c.registered_name,
    environment: c.environment,
    invoiceCount: c._count.invoices
  })));

  // 3. Check for specific environment coverage
  const envs = ['SANDBOX', 'SIMULATION', 'PRODUCTION'];
  console.log('\n[Environment Coverage]');
  for (const env of envs) {
    const hasConfig = erpConfigs.some(c => c.environment === env && c.is_active);
    const invoices = companies
      .filter(c => c.environment === env)
      .reduce((sum, c) => sum + c._count.invoices, 0);
    
    console.log(`${env}: ${hasConfig ? '✅ Configured' : '❌ NOT Configured'} | ${invoices} invoices pulled`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
