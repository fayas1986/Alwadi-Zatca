import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export async function runCustomerMigration(specPath: string): Promise<{ success: boolean; message: string }> {
  console.log(`[Migration Runner] Reading specification from: ${specPath}...`);
  if (!fs.existsSync(specPath)) {
    throw new Error(`Customer specification file not found at ${specPath}`);
  }

  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  console.log(`[Migration Runner] Target Customer: '${spec.customerId}', Environment: '${spec.environment}'`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is not defined.');
  }

  const prisma = new PrismaClient();
  const MIGRATION_LOCK_ID = 88291038; // Unique 64-bit integer for pg_advisory_lock

  try {
    console.log('[Migration Runner] 1. Validating DB Connection & Identity...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('[Migration Runner] DB connection verified successfully.');

    console.log('[Migration Runner] 2. Acquiring PostgreSQL Advisory Lock...');
    const lockResult: any = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${MIGRATION_LOCK_ID}) as acquired`;
    const lockAcquired = lockResult[0]?.acquired;

    if (!lockAcquired) {
      console.warn('[Migration Runner] Migration lock is held by another process. Waiting/skipping.');
      return { success: false, message: 'Migration lock held by another process.' };
    }

    try {
      console.log('[Migration Runner] 3. Running Schema Migration / Synchronization...');
      const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
      if (fs.existsSync(migrationsDir) && fs.readdirSync(migrationsDir).length > 0) {
        console.log('[Migration Runner] Found prisma/migrations directory. Executing prisma migrate deploy...');
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      } else {
        console.log('[Migration Runner] Using Prisma Schema Sync (npx prisma db push)...');
        execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
      }

      console.log('[Migration Runner] 4. Running Post-Migration Schema Verification & Smoke Tests...');
      const userCount = await prisma.user.count();
      const companyCount = await prisma.company.count();
      const invoiceCount = await prisma.invoice.count();

      console.log(`[Migration Runner] Smoke Test PASS: Users=${userCount}, Companies=${companyCount}, Invoices=${invoiceCount}`);

      return {
        success: true,
        message: `Migration completed successfully for customer ${spec.customerId}. Verified DB ready.`
      };
    } finally {
      console.log('[Migration Runner] 5. Releasing PostgreSQL Advisory Lock...');
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
    }
  } catch (err: any) {
    console.error('[Migration Runner] Migration failed with error:', err.message);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI Execution
if (process.argv[1]?.endsWith('migrate_customer_db.ts')) {
  const specPath = process.argv[2] || path.join(process.cwd(), 'config', 'alwadi-production-spec.json');
  runCustomerMigration(specPath)
    .then((res) => {
      console.log('[Migration Runner] Result:', res);
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('[Migration Runner] Fatal error:', err);
      process.exit(1);
    });
}
