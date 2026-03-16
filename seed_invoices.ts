
import { PrismaClient, invoice_status, invoice_type } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding mock invoices...');

  // Get existing companies
  const companies = await prisma.company.findMany();
  if (companies.length === 0) {
    console.log('No companies found. Please run company/cert seeders first.');
    return;
  }

  // Clear existing invoices to avoid clutter and duplicates
  console.log('Clearing existing invoices...');
  await prisma.invoice.deleteMany();

  // Get existing customers or create one per company
  for (const company of companies) {
    let customer = await prisma.customer.findFirst({
      where: { company_id: company.id }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          company_id: company.id,
          name: 'Default B2B Customer',
          vat_number: '300000000000003',
          address: 'Main Business District',
          city: 'Riyadh',
          country: 'SA'
        }
      });
    }

    const invoiceCount = 5;
    console.log(`Creating ${invoiceCount} invoices for company ${company.registered_name} (ID: ${company.id})...`);

    for (let i = 0; i < invoiceCount; i++) {
        const subtype = i % 2 === 0 ? 'B2B' : 'B2C';
        const status: invoice_status = i === 0 ? 'CLEARED' : i === 1 ? 'REPORTED' : i === 2 ? 'FAILED' : 'SUBMITTED';
        const baseAmount = new Decimal(Math.floor(Math.random() * 10000) + 500);
        const taxAmount = baseAmount.mul(new Decimal('0.15'));
        const totalAmount = baseAmount.add(taxAmount);

        await prisma.invoice.create({
            data: {
                company_id: company.id,
                customer_id: customer.id,
                invoice_number: `INV-${new Date().getFullYear()}-${1000 + i + (company.id * 100)}`,
                date: new Date(Date.now() - (i * 86400000)), // Daily offset
                total_amount: totalAmount,
                tax_amount: taxAmount,
                status: status,
                type: subtype === 'B2B' ? invoice_type.B2B : invoice_type.B2C,
                uuid: crypto.randomUUID(),
                hash: crypto.createHash('sha256').update(`mock-hash-${i}-${company.id}`).digest('hex'),
                qr_code: 'mock-qr-code-data',
                xml_payload: '<mock>xml</mock>'
            }
        });
    }
  }

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
