
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const invoice = await prisma.invoice.findFirst({
    where: { invoice_number: 'INV-1776955213760' },
    include: {
        company: true
    }
  });

  if (!invoice) {
    console.log("Invoice not found");
    return;
  }

  console.log(JSON.stringify(invoice, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
