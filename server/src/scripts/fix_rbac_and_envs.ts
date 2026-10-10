import prisma from '../lib/prisma.js';

/**
 * RBAC AND ENVIRONMENT FIX UTILITY SCRIPT (HARDENED & SANITIZED)
 * 
 * Safety Requirements:
 * 1. Must NOT contain hardcoded customer credentials, emails, passwords, or company IDs.
 * 2. Must require explicit ALLOW_MUTATIVE_SCRIPT_EXECUTION=true environment variable.
 * 3. Protected by Prisma Fail-Closed Guard (cannot execute against production DB).
 */
async function main() {
  if (process.env.ALLOW_MUTATIVE_SCRIPT_EXECUTION !== 'true') {
    throw new Error(
      '[FATAL SECURITY GUARD] Operational RBAC fix script execution denied. ' +
      'Missing required environment variable ALLOW_MUTATIVE_SCRIPT_EXECUTION=true. Aborting.'
    );
  }

  const userEmail = process.env.ADMIN_USER_EMAIL;
  const companyVat = process.env.TARGET_COMPANY_VAT;

  if (!userEmail || !companyVat) {
    throw new Error(
      '[SECURITY ERROR] Script requires ADMIN_USER_EMAIL and TARGET_COMPANY_VAT ' +
      'environment variables to be explicitly specified.'
    );
  }

  console.log(`[RBAC Fix] Processing user ${userEmail} and company VAT ${companyVat}...`);

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  const company = await prisma.company.findFirst({ where: { vat_number: companyVat } });

  if (!user || !company) {
    console.error('[RBAC Fix Error] Specified user or company does not exist in database.');
    return;
  }

  // Update Company Ownership
  await prisma.company.update({
    where: { id: company.id },
    data: { user_id: user.id }
  });

  // Update User Role and Company Name
  await prisma.user.update({
    where: { id: user.id },
    data: { 
      company_name: company.registered_name
    }
  });

  console.log(`[RBAC Fix Success] User ${user.email} linked to Company ID ${company.id} (${company.registered_name})`);
}

main()
  .catch(e => console.error('[RBAC Fix Error]', e.message))
  .finally(() => prisma.$disconnect());
