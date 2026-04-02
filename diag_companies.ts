import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const companies = await prisma.company.findMany();
  for (const c of companies) {
    console.log(`COMPANY: ID=${c.id} NAME=${c.registered_name} ENV=${c.environment} VAT=${c.vat_number}`);
  }
}
main().finally(() => prisma.$disconnect());
