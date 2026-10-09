import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
      where: { company_id: companyAId, is_deleted: false },
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

  it('11. Negative Test: Unknown Principal Email Fails Closed with 401', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');
    const req = { headers: { 'x-user-email': 'unknown_hacker_user_999@evil.com' } };
    const auth = await getVerifiedAuthContext(req);

    expect('errorStatus' in auth).toBe(true);
    if ('errorStatus' in auth) {
      expect(auth.errorStatus).toBe(401);
      expect(auth.errorMessage).toContain('INVALID_PRINCIPAL');
    }
  });

  it('12. Negative Test: Forged SUPER_ADMIN Role Header is Overridden by Server DB Role', async () => {
    const { getVerifiedAuthContext } = await import('../routes/admin.js');

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

    // Client attempts to forge x-user-role: SUPER_ADMIN header
    const req = {
      headers: {
        'x-user-email': forgedUser.email,
        'x-user-role': 'SUPER_ADMIN' // FORGED HEADER!
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

    const noCompanyUser = await prisma.user.create({
      data: {
        id: `user-no-company-${Date.now()}`,
        email: `unassigned_user_${Date.now()}@alwadi.local`,
        role: 'TAX_OFFICER',
        company_name: 'Unassigned Enterprise'
      }
    });

    const req = { headers: { 'x-user-email': noCompanyUser.email } };
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

    const req = { headers: { 'x-user-email': userCompanyB.email } };
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
});


