import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({
    where: { registered_name: 'Satguru Travels' }
  });
  
  if (companies.length === 0) {
    console.log('No company found with name Satguru Travels');
    return;
  }
  
  for (const company of companies) {
    console.log(`Company: ${company.registered_name} (ID: ${company.id})`);
    const configs = await prisma.erp_configuration.findMany({
      where: { company_id: company.id }
    });
    
    if (configs.length === 0) {
      console.log('  No ERP configurations found.');
    } else {
      configs.forEach(c => {
        console.log(`  - ID: ${c.id}`);
        console.log(`    Type: ${c.type}`);
        console.log(`    Name: ${c.name}`);
        console.log(`    API Key: [${c.api_key}]`);
        console.log(`    Base URL: ${c.base_url}`);
      });
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => {
  prisma.$disconnect();
});
