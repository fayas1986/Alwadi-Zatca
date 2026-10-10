import prisma from '../server/src/lib/prisma.js';

/**
 * DATABASE CLEANUP UTILITY SCRIPT (HARDENED & SANITIZED)
 * 
 * Safety Requirements:
 * 1. Must NOT contain hardcoded customer credentials, emails, or company IDs.
 * 2. Must require explicit ALLOW_MUTATIVE_SCRIPT_EXECUTION=true environment variable.
 * 3. Protected by Prisma Fail-Closed Guard (cannot execute against production DB).
 */
async function main() {
  if (process.env.ALLOW_MUTATIVE_SCRIPT_EXECUTION !== 'true') {
    throw new Error(
      '[FATAL SECURITY GUARD] Operational cleanup script execution denied. ' +
      'Missing required environment variable ALLOW_MUTATIVE_SCRIPT_EXECUTION=true. Aborting.'
    );
  }

  const targetCompanyId = parseInt(process.env.TARGET_COMPANY_ID || '', 10);
  const targetUserEmail = process.env.TARGET_USER_EMAIL;

  if (isNaN(targetCompanyId) || !targetUserEmail) {
    throw new Error(
      '[SECURITY ERROR] Operational script requires TARGET_COMPANY_ID and TARGET_USER_EMAIL ' +
      'environment variables to be explicitly specified.'
    );
  }

  console.log(`[Database Cleanup] Executing maintenance for Company ID ${targetCompanyId} / User ${targetUserEmail}...`);

  const user = await prisma.user.findUnique({ where: { email: targetUserEmail } });
  if (!user) {
    console.warn(`[Database Cleanup] User ${targetUserEmail} not found in database.`);
    return;
  }

  const company = await prisma.company.findUnique({ where: { id: targetCompanyId } });
  if (!company) {
    console.warn(`[Database Cleanup] Company ID ${targetCompanyId} not found in database.`);
    return;
  }

  // Link verified user to verified company safely
  await prisma.company.update({
    where: { id: company.id },
    data: { user_id: user.id }
  });

  console.log(`[Database Cleanup] Successfully linked User ${user.email} to Company ID ${company.id}`);
}

main()
  .catch((e) => {
    console.error('[Database Cleanup Error]', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
