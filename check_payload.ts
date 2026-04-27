
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const invoice = await prisma.invoice.findFirst({
    where: { invoice_number: 'INV-1776955213760' }
  });

  if (!invoice) {
    console.log("Invoice not found");
    return;
  }

  console.log("XML_PAYLOAD PREVIEW:");
  console.log(invoice.xml_payload?.substring(0, 500));
}

main().finally(() => prisma.$disconnect());
