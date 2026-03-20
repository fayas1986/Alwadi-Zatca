
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const duplicates = await prisma.$queryRaw`
    SELECT company_id, hash, COUNT(*)
    FROM invoices
    WHERE hash IS NOT NULL
    GROUP BY company_id, hash
    HAVING COUNT(*) > 1
  `;

  console.log('Duplicate invoices found:', JSON.stringify(duplicates, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
