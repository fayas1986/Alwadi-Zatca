
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const res = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'uuid'
  `);
  console.log('Column Type Info:', JSON.stringify(res, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
