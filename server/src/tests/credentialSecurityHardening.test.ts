import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma.js';
import { getProductionCredentials } from '../services/zatcaService.js';
import { SecurityService } from '../services/securityService.js';

describe('Credential Security & Isolation Hardening Suite', () => {
  const VAT_HARDENED_A = '390000000100003';
  const VAT_HARDENED_B = '390000000200003';

  let companyAId: number;
  let companyBId: number;

  beforeAll(async () => {
    // 1. Setup Company A (Production Cert Only)
    const userA = await prisma.user.upsert({
      where: { email: 'sec_hardened_a@alwadi.local' },
      update: {},
      create: {
        id: 'user_sec_a_id',
        email: 'sec_hardened_a@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Hardened A Corp'
      }
    });

    const companyA = await prisma.company.upsert({
      where: { vat_number: VAT_HARDENED_A },
      update: {},
      create: {
        user_id: userA.id,
        vat_number: VAT_HARDENED_A,
        cr_number: '1010999901',
        registered_name: 'Hardened A Corp L.L.C.',
        environment: 'PRODUCTION'
      }
    });
    companyAId = companyA.id;

    // Attach active PRODUCTION certificate to Company A
    await prisma.certificate.create({
      data: {
        company_id: companyAId,
        type: 'PRODUCTION',
        csid: 'CSID_HARDENED_PROD_A',
        secret: SecurityService.encrypt('secret_prod_a'),
        private_key: SecurityService.encrypt('privkey_prod_a'),
        certificate: 'cert_prod_a',
        public_key: 'pubkey_prod_a',
        is_active: true
      }
    });

    // 2. Setup Company B (Simulation Cert Only)
    const userB = await prisma.user.upsert({
      where: { email: 'sec_hardened_b@alwadi.local' },
      update: {},
      create: {
        id: 'user_sec_b_id',
        email: 'sec_hardened_b@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Hardened B Corp'
      }
    });

    const companyB = await prisma.company.upsert({
      where: { vat_number: VAT_HARDENED_B },
      update: {},
      create: {
        user_id: userB.id,
        vat_number: VAT_HARDENED_B,
        cr_number: '1010999902',
        registered_name: 'Hardened B Corp L.L.C.',
        environment: 'SIMULATION'
      }
    });
    companyBId = companyB.id;

    // Attach active SIMULATION certificate to Company B (No Production Cert!)
    await prisma.certificate.create({
      data: {
        company_id: companyBId,
        type: 'SIMULATION',
        csid: 'CSID_HARDENED_SIM_B',
        secret: SecurityService.encrypt('secret_sim_b'),
        private_key: SecurityService.encrypt('privkey_sim_b'),
        certificate: 'cert_sim_b',
        public_key: 'pubkey_sim_b',
        is_active: true
      }
    });

    // Attach INACTIVE Production certificate to Company B
    await prisma.certificate.create({
      data: {
        company_id: companyBId,
        type: 'PRODUCTION',
        csid: 'CSID_INACTIVE_PROD_B',
        secret: SecurityService.encrypt('secret_inactive_b'),
        private_key: SecurityService.encrypt('privkey_inactive_b'),
        certificate: 'cert_inactive_b',
        public_key: 'pubkey_inactive_b',
        is_active: false // INACTIVE!
      }
    });
  });

  afterAll(async () => {
    await prisma.certificate.deleteMany({ where: { company_id: { in: [companyAId, companyBId] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
    await prisma.user.deleteMany({ where: { email: { in: ['sec_hardened_a@alwadi.local', 'sec_hardened_b@alwadi.local'] } } });
  });

  it('1. Cross-Company Authorization Guard: Tenant A auth context cannot query Tenant B credentials', async () => {
    const tenantAAuthContext = { companyId: companyAId, role: 'IT_ADMIN' };

    // Tenant A attempting to fetch Tenant B's credentials via companyId
    await expect(
      getProductionCredentials({
        companyId: companyBId,
        environment: 'SIMULATION',
        authContext: tenantAAuthContext
      })
    ).rejects.toThrow(/UNAUTHORIZED_TENANT_ACCESS/);

    // Tenant A attempting to fetch Tenant B's credentials via VAT number
    await expect(
      getProductionCredentials({
        vatNumber: VAT_HARDENED_B,
        environment: 'SIMULATION',
        authContext: tenantAAuthContext
      })
    ).rejects.toThrow(/UNAUTHORIZED_TENANT_ACCESS/);
  });

  it('2. SUPER_ADMIN Auth Context: Can access credentials for any valid company', async () => {
    const superAdminContext = { companyId: 99999, role: 'SUPER_ADMIN' };

    const credsA = await getProductionCredentials({
      companyId: companyAId,
      environment: 'PRODUCTION',
      authContext: superAdminContext
    });

    expect(credsA.companyId).toBe(companyAId);
    expect(credsA.csid).toBe('CSID_HARDENED_PROD_A');
  });

  it('3. Zero Implicit Environment Fallback: PRODUCTION request fails closed if only SIMULATION cert is active', async () => {
    // Company B has active SIMULATION cert and inactive PRODUCTION cert.
    // Requesting PRODUCTION credentials MUST fail closed and NOT fallback to SIMULATION cert!
    await expect(
      getProductionCredentials({
        companyId: companyBId,
        environment: 'PRODUCTION'
      })
    ).rejects.toThrow(/Implicit fallback across environments is prohibited/);
  });

  it('4. Inactive Certificate Protection: Inactive certificates are never returned', async () => {
    // Requesting PRODUCTION credentials when the cert is_active = false
    await expect(
      getProductionCredentials({
        vatNumber: VAT_HARDENED_B,
        environment: 'PRODUCTION'
      })
    ).rejects.toThrow(/not found for company/);
  });

  it('5. Exact Environment Matching: SIMULATION request returns SIMULATION cert strictly', async () => {
    const credsB = await getProductionCredentials({
      companyId: companyBId,
      environment: 'SIMULATION'
    });

    expect(credsB.companyId).toBe(companyBId);
    expect(credsB.environment).toBe('SIMULATION');
    expect(credsB.csid).toBe('CSID_HARDENED_SIM_B');
    expect(credsB.secret).toBe('secret_sim_b');
  });
});
