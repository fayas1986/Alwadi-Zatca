
import { PrismaClient } from '@prisma/client';
import { InvoiceService } from './server/src/services/invoiceService.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) return;

  const invoiceNumber = "TEST-INV-" + Date.now();
  const items = [
    {
      name: "Test Item",
      quantity: 1,
      unitPrice: 100,
      vatRate: 15,
      vatAmount: 15,
      subtotal: 100,
      total: 115
    }
  ];

  console.log("Creating test invoice...");
  const invoice = await InvoiceService.createInvoice({
    company_id: company.id,
    invoice_number: invoiceNumber,
    uuid: crypto.randomUUID(),
    date: new Date(),
    total_amount: 115,
    tax_amount: 15,
    status: 'PENDING',
    type: 'B2C',
    hash: 'test-hash',
    qr_code: 'test-qr',
    xml_payload: '<xml></xml>',
    items: items as any,
    metadata: {
        custom: "data"
    }
  });

  console.log("Invoice created. Checking metadata...");
  const saved = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  console.log(JSON.stringify(saved?.metadata, null, 2));
}

main().finally(() => prisma.$disconnect());
