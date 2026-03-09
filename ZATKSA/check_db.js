
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://neondb_owner:npg_NdXaf4t7kDOK@ep-nameless-bar-a15lniim-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
    }
  }
});

async function main() {
  console.log('--- DATABASE CHECK (JS) ---');
  try {
    const companies = await prisma.company.findMany();
    console.log('Total companies in database:', companies.length);
    companies.forEach(c => {
      console.log(`ID: ${c.id}, VAT: ${c.vatNumber}, Name: ${c.name}, Env: ${c.environment}`);
    });

    const totalItems = await prisma.item.count();
    console.log('Total items in database:', totalItems);
  } catch (err) {
    console.error('Error fetching data:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
