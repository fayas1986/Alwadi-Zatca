
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const duplicates: any[] = await prisma.$queryRaw`
    SELECT company_id, hash, COUNT(*) as count
    FROM invoices
    WHERE hash IS NOT NULL
    GROUP BY company_id, hash
    HAVING COUNT(*) > 1
  `;

  console.log('Duplicate hashes found:', duplicates.length);

  for (const dup of duplicates) {
    console.log(`Cleaning up duplicates for hash: ${dup.hash} (Company: ${dup.company_id})`);
    
    // Find all IDs with this hash and company_id
    const invoices = await prisma.invoice.findMany({
      where: {
        company_id: Number(dup.company_id),
        hash: dup.hash
      },
      orderBy: { id: 'desc' },
      select: { id: true }
    });

    // Keep the first (most recent), delete the rest
    const idsToDelete = invoices.slice(1).map(inv => inv.id);
    
    if (idsToDelete.length > 0) {
      await prisma.invoice.deleteMany({
        where: { id: { in: idsToDelete } }
      });
      console.log(`Deleted ${idsToDelete.length} duplicates.`);
    }
  }

  console.log('De-duplication complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
