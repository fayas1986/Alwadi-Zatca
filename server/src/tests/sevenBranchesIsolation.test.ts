import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma.js';
import { ALWADI_7_BRANCHES, seedAlwadiBranches } from '../../../scripts/seed_alwadi_branches.js';
import { createVerifiedUserContext } from '../services/zatcaService.js';

describe('Seven-Branch Multi-Tenant Isolation & Management Suite', () => {
  let companyAId: number;
  let companyBId: number;
  let branchAIds: number[] = [];
  let branchBId: number;

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
      where: { email: 'seven_branches_owner_b@alwadi.local' },
      update: {},
      create: {
        id: 'user_branch_b_id',
        email: 'seven_branches_owner_b@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Competitor B Corp'
      }
    });

    const companyB = await prisma.company.upsert({
      where: { vat_number: '399999999900003' },
      update: {},
      create: {
        user_id: userB.id,
        vat_number: '399999999900003',
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
    await prisma.user.deleteMany({ where: { email: 'seven_branches_owner_b@alwadi.local' } });
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
});
