
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

const connectionString = "postgresql://neondb_owner:npg_0JQZESV9myAC@ep-spring-hat-a18pmkyp-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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
