import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- Clearing Mock Invoices ---');
  
  const mockPrefixes = ['MOCK-ERP-', 'SANDBOX-ERP-', 'PROD-ERP-'];
  
  let deletedTotal = 0;
  
  for (const prefix of mockPrefixes) {
    const { count } = await prisma.invoice.deleteMany({
      where: {
        invoice_number: {
          startsWith: prefix
        }
      }
    });
    console.log(`Deleted ${count} invoices with prefix: ${prefix}`);
    deletedTotal += count;
  }

  console.log(`\nSuccess: Removed ${deletedTotal} mock invoices in total.`);
}

main()
  .catch(e => {
    console.error('Error clearing mock invoices:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
