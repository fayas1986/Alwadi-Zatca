
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

const connectionString = "postgresql://neondb_owner:npg_NdXaf4t7kDOK@ep-nameless-bar-a15lniim-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- LINKING ITEMS TO ORG-001 ---');
  try {
    const result = await prisma.item.updateMany({
      where: { NOT: { companyId: 'org-001' } },
      data: { companyId: 'org-001' }
    });
    console.log(`Updated ${result.count} items to companyId: org-001`);
    
    const count = await prisma.item.count({ where: { companyId: 'org-001' } });
    console.log(`Total items for org-001: ${count}`);
  } catch (err) {
    console.error('Error linking items:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
