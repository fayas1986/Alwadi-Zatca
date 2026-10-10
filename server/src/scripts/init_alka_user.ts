import prisma from '../lib/prisma.js';

/**
 * USER & COMPANY INITIALIZATION UTILITY SCRIPT (HARDENED & SANITIZED)
 * 
 * Safety Requirements:
 * 1. Must NOT contain hardcoded customer credentials, emails, passwords, or company IDs.
 * 2. Must require explicit ALLOW_MUTATIVE_SCRIPT_EXECUTION=true environment variable.
 * 3. Protected by Prisma Fail-Closed Guard (cannot execute against production DB).
 */
async function main() {
  if (process.env.ALLOW_MUTATIVE_SCRIPT_EXECUTION !== 'true') {
    throw new Error(
      '[FATAL SECURITY GUARD] Operational user initialization script execution denied. ' +
      'Missing required environment variable ALLOW_MUTATIVE_SCRIPT_EXECUTION=true. Aborting.'
    );
  }

  const email = process.env.INIT_USER_EMAIL;
  const companyVat = process.env.INIT_COMPANY_VAT;
  const companyName = process.env.INIT_COMPANY_NAME;

  if (!email || !companyVat || !companyName) {
    throw new Error(
      '[SECURITY ERROR] Script requires INIT_USER_EMAIL, INIT_COMPANY_VAT, and INIT_COMPANY_NAME ' +
      'environment variables to be explicitly specified.'
    );
  }

  console.log(`[Init Utility] Initializing user ${email} for company ${companyName}...`);

  // 1. Create/Update User
  const user = await prisma.user.upsert({
    where: { email },
    update: { 
      role: 'IT_ADMIN'
    },
    create: {
      id: crypto.randomUUID(),
      email,
      name: companyName,
      role: 'IT_ADMIN',
      company_name: companyName
    }
  });

  // 2. Create/Update Company
  const company = await prisma.company.upsert({
    where: { vat_number: companyVat },
    update: { user_id: user.id },
    create: {
      user_id: user.id,
      vat_number: companyVat,
      cr_number: '1010101010',
      registered_name: companyName,
      environment: 'SIMULATION',
      is_active: true
    }
  });

  console.log(`[Init Utility Success] User ${user.email} initialized and linked to company ${company.registered_name}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
