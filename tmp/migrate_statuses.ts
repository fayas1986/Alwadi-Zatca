
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Migrating invoice statuses...');

  // Maps:
  // SUBMITTED -> PENDING
  // SIMULATED -> REPORTED (common case for mock)
  // DRAFT -> PENDING
  // SIGNED -> PENDING

  await prisma.$executeRaw`UPDATE invoices SET status = 'PENDING' WHERE status IN ('SUBMITTED', 'DRAFT', 'SIGNED')`;
  await prisma.$executeRaw`UPDATE invoices SET status = 'REPORTED' WHERE status = 'SIMULATED' AND type = 'B2C'`;
  await prisma.$executeRaw`UPDATE invoices SET status = 'CLEARED' WHERE status = 'SIMULATED' AND type = 'B2B'`;

  console.log('Status migration complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
