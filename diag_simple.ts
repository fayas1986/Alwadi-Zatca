import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const configs = await prisma.erp_configuration.findMany({ include: { company: true } });
  for (const c of configs) {
    console.log(`CONFIG: ID=${c.id} COMPANY=${c.company.registered_name} ENV=${c.environment} ACTIVE=${c.is_active}`);
  }
  const invoices = await prisma.invoice.groupBy({ by: ['company_id'], _count: { id: true } });
  for (const i of invoices) {
    const company = await prisma.company.findUnique({ where: { id: i.company_id } });
    console.log(`INVOICES: COMPANY=${company?.registered_name} ENV=${company?.environment} COUNT=${i._count.id}`);
  }
}
main().finally(() => prisma.$disconnect());
