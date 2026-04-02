import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const invoices = await prisma.invoice.findMany({
    orderBy: { created_at: 'desc' },
    take: 10,
    include: { company: true }
  });
  console.log('--- Latest Invoices Check ---');
  for (const inv of invoices) {
    console.log(`INV: ${inv.invoice_number} | COMPANY: ${inv.company.registered_name} | STATUS: ${inv.status} | CREATED: ${inv.created_at}`);
  }
}
main().finally(() => prisma.$disconnect());
