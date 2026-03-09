
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');
require('dotenv').config();

async function diagnose() {
  const connectionString = process.env.DATABASE_URL;
  console.log('Testing connection to:', connectionString ? 'URL Found' : 'URL Missing');
  
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('--- Checking Database Tables ---');
    const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log('Tables:', tables);

    console.log('--- Checking Companies ---');
    const companies = await prisma.company.findMany();
    console.log('Companies count:', companies.length);
    if (companies.length > 0) {
      console.log('First Company ID:', companies[0].id);
    } else {
      console.log('WARNING: No companies found in database!');
    }

    console.log('--- Checking Items ---');
    try {
      const itemsCount = await prisma.item.count();
      console.log('Items count:', itemsCount);
    } catch (e) {
      console.log('ERROR: Item table might not exist!', e.message);
    }

  } catch (error) {
    console.error('Diagnosis failed:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

diagnose();
