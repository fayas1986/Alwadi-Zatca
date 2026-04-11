
import { PrismaClient, UserRole, invoice_status, invoice_type } from '@prisma/client';
import { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- SEEDING MOCK DATA FOR EASYLEASE ---');

  // 1. Get the EasyLease company
  const company = await prisma.company.findUnique({
    where: { vat_number: '300000000000003' }
  });

  if (!company) {
    console.error('EasyLease company not found! Please run the primary seed first.');
    return;
  }

  const companyId = company.id;

  // 2. Create Mock Items
  console.log('Seeding items...');
  const itemsData = [
    { sku: 'EL-001', name: 'Premium Synthetic Oil 5W-40', unit_price: 150.00, description: 'High performance engine oil for fleet vehicles' },
    { sku: 'EL-002', name: 'Front Brake Pads - Sedan', unit_price: 350.00, description: 'OEM grade front brake pad set' },
    { sku: 'EL-003', name: 'Air Filter - Medium SUV', unit_price: 85.00, description: 'Standard air filtration unit' },
    { sku: 'EL-004', name: 'Tire 215/60R16 - Fleet', unit_price: 420.00, description: 'All-season durable tire' },
    { sku: 'EL-005', name: 'Scheduled Maintenance - Level 1', unit_price: 250.00, description: 'Routine 10k km maintenance service' },
    { sku: 'EL-006', name: 'Scheduled Maintenance - Level 2', unit_price: 550.00, description: 'Routine 30k km maintenance service' },
    { sku: 'EL-007', name: 'Coolant Flush & Refill', unit_price: 120.00, description: 'Complete cooling system service' },
    { sku: 'EL-008', name: 'Wiper Blade Set', unit_price: 95.00, description: 'Front windshield wiper blades' },
    { sku: 'EL-009', name: 'Battery 70Ah - AGM', unit_price: 850.00, description: 'Start-stop compatible battery' },
    { sku: 'EL-010', name: 'Fleet Recovery Service', unit_price: 300.00, description: '24/7 roadside assistance call-out' }
  ];

  for (const item of itemsData) {
    await prisma.item.upsert({
      where: { id: (await prisma.item.findFirst({ where: { sku: item.sku, company_id: companyId } }))?.id || '00000000-0000-0000-0000-000000000000' },
      update: { ...item, unit_price: new Prisma.Decimal(item.unit_price) },
      create: {
        ...item,
        company_id: companyId,
        unit_price: new Prisma.Decimal(item.unit_price),
        tax_rate: new Prisma.Decimal(0.15)
      }
    });
  }

  // 3. Create Mock Customers
  console.log('Seeding customers...');
  const customersData = [
    { name: 'Saudi Aramco Oil Company', vat_number: '300001000000003', address: 'Dhahran', city: 'Dhahran', country: 'SA' },
    { name: 'SABIC Global Trading', vat_number: '300100000000003', address: 'Airport Road', city: 'Riyadh', country: 'SA' },
    { name: 'Maaden Phosphate Co.', vat_number: '300200000000003', address: 'Industrial City', city: 'Jubail', country: 'SA' },
    { name: 'STC Solutions', vat_number: '300300000000003', address: 'Digital City', city: 'Riyadh', country: 'SA' },
    { name: 'NCB - SNB Regional', vat_number: '300400000000003', address: 'King Fahd Road', city: 'Jeddah', country: 'SA' }
  ];

  const customers = [];
  for (const customer of customersData) {
    const c = await prisma.customer.upsert({
      where: { id: (await prisma.customer.findFirst({ where: { vat_number: customer.vat_number, company_id: companyId } }))?.id || 0 },
      update: customer,
      create: { ...customer, company_id: companyId }
    });
    customers.push(c);
  }

  // 4. Create Mock Invoices
  console.log('Seeding invoices...');
  const statuses = [invoice_status.CLEARED, invoice_status.CLEARED, invoice_status.FAILED, invoice_status.PENDING, invoice_status.REPORTED];
  
  for (let i = 1; i <= 25; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const date = new Date();
    date.setDays(date.getDays() - Math.floor(Math.random() * 30)); // Last 30 days
    
    const amount = 500 + Math.random() * 5000;
    const tax = amount * 0.15;
    const total = amount + tax;
    
    await prisma.invoice.create({
      data: {
        company_id: companyId,
        customer_id: customer.id,
        invoice_number: `INV-2026-${String(i).padStart(4, '0')}`,
        date: date,
        total_amount: new Prisma.Decimal(total),
        tax_amount: new Prisma.Decimal(tax),
        status: statuses[Math.floor(Math.random() * statuses.length)],
        type: i % 5 === 0 ? invoice_type.B2C : invoice_type.B2B,
        created_at: date
      }
    });
  }

  // 5. Create Mock Audit Logs
  console.log('Seeding audit logs...');
  const logs = [
    { action: 'LOGIN', category: 'AUTH', details: 'User admin@tech-solutions.sa logged in successfuly', status: 'SUCCESS' },
    { action: 'INVOICE_GENERATE', category: 'OPERATION', details: 'Generated B2B invoice INV-2026-0001', status: 'SUCCESS' },
    { action: 'CERTIFICATE_UPDATE', category: 'SECURITY', details: 'Updated PRODUCTION certificate for EasyLease', status: 'SUCCESS' },
    { action: 'SYNC_START', category: 'SYSTEM', details: 'Automated ERP sync triggered', status: 'SUCCESS' },
    { action: 'INVOICE_SUBMIT_FAILED', category: 'ZATCA', details: 'ZATCA submission failed for INV-2026-0003', status: 'FAILURE' }
  ];

  for (let i = 0; i < 20; i++) {
    const log = logs[Math.floor(Math.random() * logs.length)];
    const logDate = new Date();
    logDate.setHours(logDate.getHours() - i);
    
    await prisma.audit_log.create({
      data: {
        action: log.action,
        category: log.category,
        details: log.details,
        status: log.status,
        user: 'admin@tech-solutions.sa',
        role: 'IT_ADMIN',
        ip_address: '192.168.1.1',
        timestamp: logDate
      }
    });
  }

  console.log('--- MOCK SEEDING FINISHED ---');
}

// Helper to add days
// @ts-ignore
Date.prototype.setDays = function(days) {
    this.setDate(this.getDate() + days);
    return this;
};
// @ts-ignore
Date.prototype.getDays = function() {
    return this.getDate();
};

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
