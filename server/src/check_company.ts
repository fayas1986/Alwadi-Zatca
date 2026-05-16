
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const company = await (prisma as any).company.findFirst({
    where: { registered_name: { contains: 'EasyLease', mode: 'insensitive' } }
  });
  console.log(JSON.stringify(company, null, 2));
}
main().finally(() => prisma.$disconnect());
