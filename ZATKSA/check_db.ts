
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: "postgresql://neondb_owner:npg_NdXaf4t7kDOK@ep-nameless-bar-a15lniim-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
});

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
