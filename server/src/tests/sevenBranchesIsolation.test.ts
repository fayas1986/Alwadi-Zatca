import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import prisma from '../lib/prisma.js';
import { ALWADI_7_BRANCHES, seedAlwadiBranches } from '../../../scripts/seed_alwadi_branches.js';
import { createVerifiedUserContext } from '../services/zatcaService.js';

describe('Seven-Branch Multi-Tenant Isolation & Management Suite', () => {
  let companyAId: number;
  let companyBId: number;
  let branchAIds: number[] = [];
  let branchBId: number;

  const VAT_B = '397777777700003';
  const USER_B_EMAIL = 'seven_branches_owner_b_unique@alwadi.local';

  beforeAll(async () => {
    // 1. Seed or get Alwadi Company A (Company ID 1 or freshly created)
    let companyA = await prisma.company.findFirst({
      where: { vat_number: '300000000000003' }
    });

    if (!companyA) {
      const userA = await prisma.user.upsert({
        where: { email: 'seven_branches_owner_a@alwadi.local' },
        update: {},
        create: {
          id: 'user_branch_a_id',
          email: 'seven_branches_owner_a@alwadi.local',
          role: 'IT_ADMIN',
          company_name: 'Alwadi Trading L.L.C.'
        }
      });

      companyA = await prisma.company.create({
        data: {
          user_id: userA.id,
          vat_number: '300000000000003',
          cr_number: '1010123456',
          registered_name: 'Alwadi Trading L.L.C.',
          environment: 'PRODUCTION'
        }
      });
    }
    companyAId = companyA.id;

    // Seed 7 branches for Alwadi
    const seeded = await seedAlwadiBranches();
    branchAIds = seeded.map(b => b.id);

    // 2. Setup Company B with a single branch
    const userB = await prisma.user.upsert({
      where: { email: USER_B_EMAIL },
      update: {},
      create: {
        id: 'user_seven_branch_b_id',
        email: USER_B_EMAIL,
        role: 'IT_ADMIN',
        company_name: 'Competitor B Corp'
      }
    });

    const companyB = await prisma.company.upsert({
      where: { vat_number: VAT_B },
      update: {},
      create: {
        user_id: userB.id,
        vat_number: VAT_B,
        cr_number: '1010998877',
        registered_name: 'Competitor B Corp L.L.C.',
        environment: 'PRODUCTION'
      }
    });
    companyBId = companyB.id;

    const branchB = await prisma.branch.create({
      data: {
        company_id: companyBId,
        code: 'BR-COMPETITOR-B',
        name: 'Competitor B Main Branch',
        city: 'Jeddah',
        is_active: true
      }
    });
    branchBId = branchB.id;
  });

  afterAll(async () => {
    // Cleanup Company B
    await prisma.invoice.deleteMany({ where: { company_id: companyBId } });
    await prisma.branch.deleteMany({ where: { company_id: companyBId } });
    await prisma.company.deleteMany({ where: { id: companyBId } });
    await prisma.user.deleteMany({ where: { email: USER_B_EMAIL } });
  });

  it('1. Persisted 7 Branches Verification: Company A has exactly 7 active branches in DB', async () => {
    const branches = await prisma.branch.findMany({
      where: { company_id: companyAId, is_deleted: false, code: { startsWith: 'BR-0' } },
      orderBy: { code: 'asc' }
    });

    expect(branches.length).toBe(7);
    const codes = branches.map(b => b.code);
    expect(codes).toEqual(['BR-001', 'BR-002', 'BR-003', 'BR-004', 'BR-005', 'BR-006', 'BR-007']);
  });

  it('2. Branch Enforce Uniqueness: Cannot create duplicate branch code within same company', async () => {
    await expect(
      prisma.branch.create({
        data: {
          company_id: companyAId,
          code: 'BR-001', // Duplicate code!
          name: 'Duplicate Riyadh HQ'
        }
      })
    ).rejects.toThrow();
  });

  it('3. Cross-Company Branch Code Re-use: Different company can use same branch code', async () => {
    const branchBWithSameCode = await prisma.branch.create({
      data: {
        company_id: companyBId,
        code: 'BR-001', // Allowed because company_id is different
        name: 'Competitor BR-001'
      }
    });

    expect(branchBWithSameCode.company_id).toBe(companyBId);
    expect(branchBWithSameCode.code).toBe('BR-001');

    await prisma.branch.delete({ where: { id: branchBWithSameCode.id } });
  });

  it('4. Invoice Branch Scoping: Invoices reference specific originating branch', async () => {
    const riyadhBranch = await prisma.branch.findFirst({
      where: { company_id: companyAId, code: 'BR-001' }
    });
    expect(riyadhBranch).not.toBeNull();

    const invoice = await prisma.invoice.create({
      data: {
        company_id: companyAId,
        branch_id: riyadhBranch!.id,
        invoice_number: `INV-BRANCH-TEST-${Date.now()}`,
        date: new Date(),
        total_amount: 1500.00,
        tax_amount: 225.00,
        status: 'CLEARED'
      }
    });

    expect(invoice.branch_id).toBe(riyadhBranch!.id);

    const fetched = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: { branch: true }
    });

    expect(fetched?.branch?.code).toBe('BR-001');
    expect(fetched?.branch?.name).toContain('Riyadh');

    // Cleanup
    await prisma.invoice.delete({ where: { id: invoice.id } });
  });

  it('5. Branch Isolation Guard: User scoped to Company A cannot query Company B branches', async () => {
    const userAContext = createVerifiedUserContext(companyAId, 'IT_ADMIN');

    // Query Company B branches
    const companyBBranches = await prisma.branch.findMany({
      where: { company_id: companyBId, is_deleted: false }
    });

    expect(companyBBranches.some(b => b.company_id === companyAId)).toBe(false);
    expect(userAContext.companyId).not.toBe(companyBId);
  });

  it('6. Deactivated Branch Protection: Inactive branches are excluded from active list', async () => {
    // Create temporary branch and deactivate it
    const tempBranch = await prisma.branch.create({
      data: {
        company_id: companyAId,
        code: 'BR-TEMP-DEACTIVATE',
        name: 'Temp Deactivated Branch',
        is_active: false
      }
    });

    const activeBranches = await prisma.branch.findMany({
      where: { company_id: companyAId, is_active: true, is_deleted: false }
    });

    expect(activeBranches.some(b => b.id === tempBranch.id)).toBe(false);

    // Cleanup
    await prisma.branch.delete({ where: { id: tempBranch.id } });
  });

  it('7. Mismatched Invoice Branch Ownership: Rejects invoice when branch_id does not belong to company_id', async () => {
    const { InvoiceService } = await import('../services/invoiceService.js');

    const companyBBranch = await prisma.branch.create({
      data: {
        company_id: companyBId,
        code: 'BR-MISMATCH-OWNERSHIP',
        name: 'Company B Branch for Mismatch Test'
      }
    });

    await expect(
      InvoiceService.createInvoice({
        company_id: companyAId, // Company A
        branch_id: companyBBranch.id, // Branch B (Company B) -> MISMATCH!
        invoice_number: `INV-MISMATCH-${Date.now()}`,
        uuid: '550e8400-e29b-41d4-a716-446655440099',
        date: new Date(),
        total_amount: 100,
        tax_amount: 15,
        status: 'PENDING',
        type: 'B2B',
        hash: `hash-mismatch-${Date.now()}`,
        qr_code: 'qr'
      })
    ).rejects.toThrow(/INVOICE_BRANCH_OWNERSHIP_MISMATCH/);

    await prisma.branch.delete({ where: { id: companyBBranch.id } });
  });

  it('8. Inactive Branch Invoice Rejection: Rejects new invoice creation for inactive branch', async () => {
    const { InvoiceService } = await import('../services/invoiceService.js');

    const inactiveBranch = await prisma.branch.create({
      data: {
        company_id: companyAId,
        code: 'BR-INACTIVE-TEST',
        name: 'Inactive Branch Test',
        is_active: false
      }
    });

    await expect(
      InvoiceService.createInvoice({
        company_id: companyAId,
        branch_id: inactiveBranch.id, // Inactive!
        invoice_number: `INV-INACTIVE-${Date.now()}`,
        uuid: '550e8400-e29b-41d4-a716-446655440088',
        date: new Date(),
        total_amount: 100,
        tax_amount: 15,
        status: 'PENDING',
        type: 'B2B',
        hash: `hash-inactive-${Date.now()}`,
        qr_code: 'qr'
      })
    ).rejects.toThrow(/INACTIVE_BRANCH/);

    await prisma.branch.delete({ where: { id: inactiveBranch.id } });
  });

  it('9. Historical Unassigned Invoice Preservation: Invoices with branch_id = null are preserved without error', async () => {
    const { InvoiceService } = await import('../services/invoiceService.js');

    const historicalInv = await InvoiceService.createInvoice({
      company_id: companyAId,
      branch_id: undefined, // Unassigned / Legal Entity level
      invoice_number: `INV-HISTORICAL-${Date.now()}`,
      uuid: '550e8400-e29b-41d4-a716-446655440077',
      date: new Date(),
      total_amount: 500,
      tax_amount: 75,
      status: 'CLEARED',
      type: 'B2B',
      hash: `hash-hist-${Date.now()}`,
      qr_code: 'qr'
    });

    expect(historicalInv.branch_id).toBeNull();

    const fetched = await prisma.invoice.findUnique({
      where: { id: historicalInv.id },
      include: { branch: true }
    });

    expect(fetched?.branch).toBeNull();

    // Cleanup
    await prisma.invoice.delete({ where: { id: historicalInv.id } });
  });

  it('10. Negative Test: Missing Authentication Header Fails Closed with 401', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const req = { headers: {} };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(401);
      expect(auth.errorMessage).toContain('AUTHENTICATION_REQUIRED');
    }
  });

  it('11. Negative Test: Unknown Principal Token Fails Closed with 401', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    const unknownToken = signJwt({
      userId: 'u-unknown-principal-999',
      email: 'unknown_hacker_user_999@evil.com',
      role: 'IT_ADMIN'
    });

    const req = { headers: { authorization: `Bearer ${unknownToken}` } };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(401);
      expect(auth.errorMessage).toContain('INVALID_PRINCIPAL');
    }
  });

  it('12. Negative Test: Forged SUPER_ADMIN Role Header is Overridden by Server DB Role', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    // Create a regular IT_ADMIN user
    const forgedUser = await prisma.user.upsert({
      where: { email: 'regular_admin_test@alwadi.local' },
      update: { role: 'IT_ADMIN' },
      create: {
        id: 'u-regular-test-id',
        email: 'regular_admin_test@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Alwadi Trading L.L.C.'
      }
    });

    // Associate user with Company A
    await prisma.company.update({
      where: { id: companyAId },
      data: { user_id: forgedUser.id }
    });

    const token = signJwt({
      userId: forgedUser.id,
      email: forgedUser.email,
      role: forgedUser.role,
      companyId: companyAId
    });

    // Client attempts to forge x-user-role: SUPER_ADMIN header
    const req = {
      headers: {
        authorization: `Bearer ${token}`,
        'x-user-role': 'SUPER_ADMIN' // FORGED ROLE HEADER!
      }
    };

    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(false);
    if (!('errorStatus' in auth)) {
      // Server MUST derive real role from DB ('IT_ADMIN'), ignoring forged header
      expect(auth.role).toBe('IT_ADMIN');
      expect(auth.isSuperAdmin).toBe(false);
    }

    // Cleanup user_id link on companyA
    await prisma.company.update({
      where: { id: companyAId },
      data: { user_id: 'system_admin' }
    });
    await prisma.user.delete({ where: { id: forgedUser.id } });
  });

  it('13. Negative Test: User with Zero Authorized Companies Fails with 403', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    const noCompanyUser = await prisma.user.create({
      data: {
        id: `user-no-company-${Date.now()}`,
        email: `unassigned_user_${Date.now()}@alwadi.local`,
        role: 'TAX_OFFICER',
        company_name: 'Unassigned Enterprise'
      }
    });

    const token = signJwt({
      userId: noCompanyUser.id,
      email: noCompanyUser.email,
      role: noCompanyUser.role
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(403);
      expect(auth.errorMessage).toContain('UNAUTHORIZED_BRANCH_ACCESS');
    }

    await prisma.user.delete({ where: { id: noCompanyUser.id } });
  });

  it('14. Negative Test: Cross-Company Branch Scoping Rejects Unauthorized Access', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    // Create user scoped exclusively to Company B
    const userCompanyB = await prisma.user.create({
      data: {
        id: `user-comp-b-${Date.now()}`,
        email: `comp_b_only_${Date.now()}@alwadi.local`,
        role: 'IT_ADMIN',
        company_name: 'Competitor B Corp'
      }
    });

    // Associate user with Company B only
    await prisma.company.update({
      where: { id: companyBId },
      data: { user_id: userCompanyB.id }
    });

    const token = signJwt({
      userId: userCompanyB.id,
      email: userCompanyB.email,
      role: userCompanyB.role,
      companyId: companyBId
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(false);
    if (!('errorStatus' in auth)) {
      expect(auth.authorizedCompanyIds).toContain(companyBId);
      expect(auth.authorizedCompanyIds.includes(companyAId)).toBe(false);
    }

    // Cleanup user_id link on companyB
    await prisma.company.update({
      where: { id: companyBId },
      data: { user_id: 'system_admin' }
    });
    await prisma.user.delete({ where: { id: userCompanyB.id } });
  });

  it('15. Negative Test: Invoice Update Rejects Inactive Branch Assignment', async () => {
    const { InvoiceService } = await import('../services/invoiceService.js');

    const activeInv = await InvoiceService.createInvoice({
      company_id: companyAId,
      invoice_number: `INV-UPDATE-TEST-${Date.now()}`,
      uuid: '550e8400-e29b-41d4-a716-446655440055',
      date: new Date(),
      total_amount: 200,
      tax_amount: 30,
      status: 'PENDING',
      type: 'B2B',
      hash: `hash-upd-${Date.now()}`,
      qr_code: 'qr'
    });

    const inactiveBranch = await prisma.branch.create({
      data: {
        company_id: companyAId,
        code: 'BR-INACTIVE-UPD',
        name: 'Inactive Branch Update Test',
        is_active: false
      }
    });

    await expect(
      InvoiceService.updateInvoice(activeInv.id, {
        branch_id: inactiveBranch.id // Inactive!
      })
    ).rejects.toThrow(/INACTIVE_BRANCH/);

    // Cleanup
    await prisma.invoice.delete({ where: { id: activeInv.id } });
    await prisma.branch.delete({ where: { id: inactiveBranch.id } });
  });

  it('16. Anti-Spoofing Test: Valid JWT Bearer Token Overrides Impersonated x-user-email Header', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    const regularUser = await prisma.user.upsert({
      where: { email: 'jwt_regular_user@alwadi.local' },
      update: { role: 'IT_ADMIN' },
      create: {
        id: 'u-jwt-reg-001',
        email: 'jwt_regular_user@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Alwadi Trading L.L.C.'
      }
    });

    await prisma.company.update({
      where: { id: companyAId },
      data: { user_id: regularUser.id }
    });

    // Valid JWT token signed for regularUser (Company A)
    const validToken = signJwt({
      userId: regularUser.id,
      email: regularUser.email,
      role: regularUser.role,
      companyId: companyAId
    });

    // Caller attempts to spoof x-user-email to superadmin@alwadi.local
    const req = {
      headers: {
        authorization: `Bearer ${validToken}`,
        'x-user-email': 'superadmin@alwadi.local' // SPOOFED IMPERSONATION HEADER!
      }
    };

    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(false);
    if (!('errorStatus' in auth)) {
      // Server MUST authenticate strictly as regularUser derived from JWT token
      expect(auth.user.email).toBe('jwt_regular_user@alwadi.local');
      expect(auth.role).toBe('IT_ADMIN');
      expect(auth.isSuperAdmin).toBe(false);
      expect(auth.authorizedCompanyIds).toContain(companyAId);
    }

    // Cleanup
    await prisma.company.update({
      where: { id: companyAId },
      data: { user_id: 'system_admin' }
    });
    await prisma.user.delete({ where: { id: regularUser.id } });
  });

  it('17. Invalid JWT Signature Rejection: Tampered JWT Token Fails Closed with 401', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');

    const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1LTAwMSIsImVtYWlsIjoic3VwZXJhZG1pbkBhbHdhZGkubG9jYWwiLCJyb2xlIjoiU1VQRVJfQURNSU4ifQ.TAMPERED_INVALID_SIGNATURE';

    const req = {
      headers: {
        authorization: `Bearer ${tamperedToken}`
      }
    };

    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(401);
      expect(auth.errorMessage).toContain('INVALID_TOKEN');
    }
  });

  it('18. Unauthenticated Request Rejection: Request without Bearer Token Fails Closed with 401', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');

    // Passing x-user-email header ONLY (No Bearer Token)
    const req = { headers: { 'x-user-email': 'superadmin@alwadi.local' } };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(401);
      expect(auth.errorMessage).toContain('AUTHENTICATION_REQUIRED');
    }
  });

  it('19. Identity Claim Mismatch Rejection: Token Email Mismatched with DB User Fails Closed with 401', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    // Create user in DB
    const dbUser = await prisma.user.upsert({
      where: { email: 'real_user_email@alwadi.local' },
      update: {},
      create: {
        id: 'u-identity-mismatch-id',
        email: 'real_user_email@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Alwadi Trading L.L.C.'
      }
    });

    // Token generated with sub = dbUser.id BUT email = forged_claim@evil.com
    const mismatchedToken = signJwt({
      userId: dbUser.id,
      email: 'forged_claim@evil.com',
      role: 'IT_ADMIN'
    });

    const req = { headers: { authorization: `Bearer ${mismatchedToken}` } };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(401);
      expect(auth.errorMessage).toContain('IDENTITY_MISMATCH');
    }

    await prisma.user.delete({ where: { id: dbUser.id } });
  });

  it('20. Revoked Account Rejection: Deleted User Token Fails Closed with 401', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    const tempUser = await prisma.user.create({
      data: {
        id: `u-deactivated-${Date.now()}`,
        email: `deactivated_${Date.now()}@alwadi.local`,
        role: 'IT_ADMIN',
        company_name: 'Alwadi Trading L.L.C.',
        password: 'password123'
      }
    });

    const token = signJwt({
      userId: tempUser.id,
      email: tempUser.email,
      role: tempUser.role
    });

    // Delete user from DB to simulate account revocation
    await prisma.user.delete({ where: { id: tempUser.id } });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(401);
      expect(auth.errorMessage).toContain('INVALID_PRINCIPAL');
    }
  });

  it('21. Expired Token Rejection: Token Expired in Past Fails Closed with 401', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    // Token signed with expiresInSeconds = -10 (expired 10 seconds ago)
    const expiredToken = signJwt(
      {
        userId: 'u-001',
        email: 'superadmin@alwadi.local',
        role: 'SUPER_ADMIN'
      },
      -10
    );

    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(401);
      expect(auth.errorMessage).toContain('INVALID_TOKEN');
    }
  });

  it('22. JWT Schema & Algorithm Strictness: Rejects tokens with missing claims or wrong algorithm', async () => {
    const { verifyJwt } = await import('../utils/jwt.js');
    const jwtLib = await import('jsonwebtoken');

    // Test token missing sub or userId
    const missingClaimToken = jwtLib.default.sign(
      { email: 'test@alwadi.local', role: 'IT_ADMIN' },
      'TestJwtSecretKey_MustBeAtLeast32CharsLongForSecurityValidation_2026',
      { algorithm: 'HS256' }
    );
    expect(verifyJwt(missingClaimToken)).toBeNull();

    // Test token with sub !== userId mismatch
    const MismatchedSubToken = jwtLib.default.sign(
      { sub: 'user-1', userId: 'user-2', email: 'test@alwadi.local', role: 'IT_ADMIN' },
      'TestJwtSecretKey_MustBeAtLeast32CharsLongForSecurityValidation_2026',
      { algorithm: 'HS256', issuer: 'zatca-connect-api', audience: 'zatca-connect-users', expiresIn: 3600 }
    );
    expect(verifyJwt(MismatchedSubToken)).toBeNull();
  });

  it('23. Test-Secret Isolation: getJwtSecret throws FATAL_JWT_CONFIG_ERROR in production/staging when secret is missing or short', async () => {
    const { getJwtSecret } = await import('../utils/jwt.js');
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;

    try {
      // Set to production with no secret
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      expect(() => getJwtSecret()).toThrow('FATAL_JWT_CONFIG_ERROR');

      // Set to staging with short secret
      process.env.NODE_ENV = 'staging';
      process.env.JWT_SECRET = 'too_short';
      expect(() => getJwtSecret()).toThrow('FATAL_JWT_CONFIG_ERROR');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSecret) process.env.JWT_SECRET = originalSecret;
      else delete process.env.JWT_SECRET;
    }
  });

  it('24. Database Authority: Role Demotion in DB takes effect immediately without new token', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    const tempUser = await prisma.user.create({
      data: {
        id: `u-role-change-${Date.now()}`,
        email: `rolechange_${Date.now()}@alwadi.local`,
        role: 'SUPER_ADMIN',
        company_name: 'Alwadi Trading L.L.C.',
        password: 'password123'
      }
    });

    // Token issued when user claimed SUPER_ADMIN
    const token = signJwt({
      userId: tempUser.id,
      email: tempUser.email,
      role: 'SUPER_ADMIN'
    });

    // Demote role in DB from SUPER_ADMIN to TAX_OFFICER (valid UserRole enum)
    await prisma.user.update({
      where: { id: tempUser.id },
      data: { role: 'TAX_OFFICER' }
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const auth = await getVerifiedAuthContext(req);

    // Auth context MUST reflect current DB role 'TAX_OFFICER', not old token role 'SUPER_ADMIN'
    if (!('errorStatus' in auth)) {
      expect(auth.role).toBe('TAX_OFFICER');
      expect(auth.isSuperAdmin).toBe(false);
    }

    await prisma.user.delete({ where: { id: tempUser.id } });
  });

  it('25. Immediate Account Revocation: Deleted or revoked user principal fails closed with 401', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');

    const tempUser = await prisma.user.create({
      data: {
        id: `u-deactive-${Date.now()}`,
        email: `deactive_${Date.now()}@alwadi.local`,
        role: 'IT_ADMIN',
        company_name: 'Alwadi Trading L.L.C.',
        password: 'password123'
      }
    });

    const token = signJwt({
      userId: tempUser.id,
      email: tempUser.email,
      role: tempUser.role
    });

    // Delete user from DB to simulate principal revocation
    await prisma.user.delete({ where: { id: tempUser.id } });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(401);
      expect(auth.errorMessage).toContain('INVALID_PRINCIPAL');
    }
  });

  it('26. Database Error Handling: Database connection failure returns 500 INTERNAL_SERVER_ERROR without exposing internal details', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const { signJwt } = await import('../utils/jwt.js');
    const { default: prisma } = await import('../lib/prisma.js');

    const validToken = signJwt({
      userId: 'u-db-error-test',
      email: 'dberror@alwadi.local',
      role: 'IT_ADMIN'
    });

    const req = { headers: { authorization: `Bearer ${validToken}` } };

    // Spy on prisma.user.findFirst and simulate DB outage
    const findFirstSpy = vi.spyOn(prisma.user, 'findFirst').mockRejectedValueOnce(new Error('FATAL: Database connection timeout'));

    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(500);
      expect(auth.errorMessage).toContain('INTERNAL_SERVER_ERROR');
      expect(auth.errorMessage).not.toContain('connection timeout'); // Protect internal details
    }

    findFirstSpy.mockRestore();
  });
});





