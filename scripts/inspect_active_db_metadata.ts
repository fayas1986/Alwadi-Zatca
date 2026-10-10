import prisma from '../server/src/lib/prisma.js';

export async function inspectActiveDatabaseMetadata() {
  console.log('[DB Metadata Inspection] Querying active database metadata safely...');

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      registered_name: true,
      vat_number: true,
      environment: true,
      created_at: true
    }
  });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      company_name: true,
      created_at: true,
      companies: {
        select: {
          id: true,
          registered_name: true
        }
      }
    }
  });

  const invoiceCount = await prisma.invoice.count();

  console.log(`\n[DB Metadata Inspection] Summary:`);
  console.log(`- Total Companies: ${companies.length}`);
  console.log(`- Total Users: ${users.length}`);
  console.log(`- Total Invoices: ${invoiceCount}`);

  console.log('\n[Company Record Metadata]:');
  companies.forEach(c => console.log(`  Company ID=${c.id}, Name="${c.registered_name}", VAT="${c.vat_number}", Env=${c.environment}`));

  console.log('\n[User Records Metadata (Sanitized)]');
  users.forEach(u => {
    const compIds = u.companies.map(c => c.id).join(', ') || 'None';
    console.log(`  User ID="${u.id}", Email="${u.email}", Role=${u.role}, BoundCompanyIDs=[${compIds}]`);
  });

  await prisma.$disconnect();
}

if (process.argv[1]?.endsWith('inspect_active_db_metadata.ts')) {
  inspectActiveDatabaseMetadata().catch(err => {
    console.error('Inspection failed:', err);
    process.exit(1);
  });
}
