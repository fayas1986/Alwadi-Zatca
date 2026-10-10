import prisma from '../lib/prisma.js';

async function forensicInspection() {
  console.log('=== FORENSIC DATABASE INSPECTION (READ-ONLY) ===');
  try {
    // 1. Companies
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        registered_name: true,
        vat_number: true,
        cr_number: true,
        user_id: true,
        created_at: true,
        is_active: true,
        is_deleted: true
      },
      orderBy: { id: 'asc' }
    });
    console.log(`Total Companies in Database: ${companies.length}`);
    companies.forEach(c => {
      console.log(`- Company ID: ${c.id} | Name: "${c.registered_name}" | VAT: ${c.vat_number} | Owner UserID: ${c.user_id} | Created: ${c.created_at}`);
    });

    // 2. Specific check for Company ID 38
    const comp38 = companies.find(c => c.id === 38);
    console.log('\n--- Company ID 38 Details ---');
    if (comp38) {
      console.log('Company ID 38 EXISTS:', comp38);
      const branches38 = await prisma.branch.findMany({ where: { company_id: 38 } });
      const certs38 = await prisma.certificate.findMany({ where: { company_id: 38 } });
      const invoices38 = await prisma.invoice.count({ where: { company_id: 38 } });
      console.log(`Company 38 Branches: ${branches38.length}`);
      console.log(`Company 38 Certificates: ${certs38.length}`);
      console.log(`Company 38 Invoices: ${invoices38}`);
    } else {
      console.log('Company ID 38 DOES NOT EXIST in this database instance.');
    }

    // 3. Check Company ID 1 (Alwadi)
    const comp1 = companies.find(c => c.id === 1);
    console.log('\n--- Company ID 1 (Alwadi) Details ---');
    if (comp1) {
      console.log('Company ID 1 EXISTS:', comp1);
      const branches1 = await prisma.branch.findMany({ where: { company_id: 1 } });
      const certs1 = await prisma.certificate.findMany({ where: { company_id: 1 } });
      const invoices1 = await prisma.invoice.count({ where: { company_id: 1 } });
      console.log(`Company 1 Branches: ${branches1.length}`);
      console.log(`Company 1 Certificates: ${certs1.length}`);
      console.log(`Company 1 Invoices: ${invoices1}`);
    }

    // 4. Users in Database
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        company_name: true,
        created_at: true
      },
      orderBy: { created_at: 'asc' }
    });
    console.log(`\nTotal Users in Database: ${users.length}`);
    users.forEach(u => {
      console.log(`- User ID: ${u.id} | Email: ${u.email} | Role: ${u.role} | CompanyName: "${u.company_name}"`);
    });

  } catch (err: any) {
    console.error('Forensic DB Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

forensicInspection();
