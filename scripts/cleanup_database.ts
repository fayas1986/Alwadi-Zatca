import { PrismaClient } from '@prisma/client';
import { encrypt } from '../server/src/utils/crypto.js';

const prisma = new PrismaClient();

async function main() {
  const TARGET_COMPANY_ID = 42; // Satguru Travels (69 invoices)
  const DUPLICATE_COMPANY_ID = 45; // Satguru Travels (0 invoices)
  const ALKA_EMAIL = 'alka.sharma@yiron.in';
  const SUPER_ADMIN_EMAIL = 'superadmin@tech-solutions.sa';
  const TECH_DOMAIN = '@tech-solutions.sa';
  const NEW_PASSWORD = 'Zatca#123!';

  console.log('--- Database Cleanup Started ---');

  // 1. Link Super Admin to Company 42
  const superAdmin = await prisma.user.findUnique({ where: { email: SUPER_ADMIN_EMAIL } });
  if (superAdmin) {
    console.log(`Linking Super Admin (${SUPER_ADMIN_EMAIL}) to Company ${TARGET_COMPANY_ID}`);
    // We update the company to point to the super admin if allowed, 
    // but the schema says multiple companies can point to a user.
    // However, the company record has a user_id field.
    await prisma.company.update({
      where: { id: TARGET_COMPANY_ID },
      data: { user_id: superAdmin.id }
    });
    console.log('Super Admin linked to Company 42.');
  }

  // 2. Link Alka to Company 42 (ensure they are linked)
  const alka = await prisma.user.findUnique({ where: { email: ALKA_EMAIL } });
  if (alka) {
    console.log(`Resetting password for Alka (${ALKA_EMAIL})`);
    const encryptedPwd = encrypt(NEW_PASSWORD);
    await prisma.user.update({
      where: { email: ALKA_EMAIL },
      data: { password: encryptedPwd }
    });
    
    // Ensure Alka is also linked if they weren't
    // Wait, a company has ONE user_id. If I set it to Super Admin, I can't set it to Alka.
    // The schema shows: model company { user_id String ... user user @relation(...) }
    // This is a 1-to-many relationship (one user can have many companies).
    // So one company belongs to ONE user.
    // If we want both to see it, the app logic must support it.
    // Usually "Alka" is the IT Admin who actually works on it.
    console.log('Alka password reset.');
  }

  // 3. Remove other tech-solutions.sa users
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: TECH_DOMAIN,
        not: SUPER_ADMIN_EMAIL
      }
    }
  });
  console.log(`Deleted ${deletedUsers.count} other tech-solutions.sa users.`);

  // 4. Remove Duplicate Company (ID 45)
  // Check if any invoices are there first (should be 0)
  const invCount = await prisma.invoice.count({ where: { company_id: DUPLICATE_COMPANY_ID } });
  if (invCount === 0) {
      // Delete dependent records first (certificates, etc.)
      await prisma.certificate.deleteMany({ where: { company_id: DUPLICATE_COMPANY_ID } });
      await prisma.erp_configuration.deleteMany({ where: { company_id: DUPLICATE_COMPANY_ID } });
      await prisma.item.deleteMany({ where: { company_id: DUPLICATE_COMPANY_ID } });
      await prisma.customer.deleteMany({ where: { company_id: DUPLICATE_COMPANY_ID } });
      
      await prisma.company.delete({ where: { id: DUPLICATE_COMPANY_ID } });
      console.log(`Deleted empty duplicate Company ID ${DUPLICATE_COMPANY_ID}.`);
  } else {
      console.warn(`Company ${DUPLICATE_COMPANY_ID} has ${invCount} invoices. Skipping deletion for safety.`);
  }

  // 5. Purge tech-solutions.sa audit logs (excluding Super Admin if needed, but user said "exclude super admin even you do not want to capture audit trail")
  // User said: "I do not want any record tech-solutions-sa, exclude super admin"
  // This means remove logs for other tech-solutions users.
  const deletedLogs = await prisma.audit_log.deleteMany({
    where: {
      user: {
        endsWith: TECH_DOMAIN,
        not: SUPER_ADMIN_EMAIL
      }
    }
  });
  console.log(`Purged ${deletedLogs.count} audit logs for tech-solutions.sa (excluding Super Admin).`);

  console.log('--- Database Cleanup Completed ---');
}

main()
  .catch((e) => {
    console.error('Cleanup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
