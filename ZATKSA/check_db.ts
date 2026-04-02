
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- DATABASE CHECK ---');
  
  const companies = await prisma.company.findMany();
  console.log('Total companies in database:', companies.length);
  console.log('Companies:', JSON.stringify(companies, (key, value) => 
    (key === 'privateKey' || key === 'productionSecret') ? '[REDACTED]' : value, 2));

  const totalItems = await prisma.item.count();
  console.log('Total items in database:', totalItems);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
