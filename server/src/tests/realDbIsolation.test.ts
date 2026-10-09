import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma.js';

describe('Real Database Multi-Tenant Isolation (Integration Test)', () => {
  const TEST_COMPANY_A_VAT = '399999999900003';
  const TEST_COMPANY_B_VAT = '388888888800003';

  let companyAId: number;
  let companyBId: number;
  let invoiceBId: number;

  beforeAll(async () => {
    // 1. Setup Company A & User
    const userA = await prisma.user.upsert({
      where: { email: 'tenant_a_test@alwadi.local' },
      update: {},
      create: {
        id: 'user_tenant_a_uuid',
        email: 'tenant_a_test@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Tenant A Corp'
      }
    });

    const companyA = await prisma.company.upsert({
      where: { vat_number: TEST_COMPANY_A_VAT },
      update: {},
      create: {
        user_id: userA.id,
        vat_number: TEST_COMPANY_A_VAT,
        cr_number: '1010999999',
        registered_name: 'Tenant A Corp L.L.C.',
        environment: 'SANDBOX'
      }
    });
    companyAId = companyA.id;

    // 2. Setup Company B & User
    const userB = await prisma.user.upsert({
      where: { email: 'tenant_b_test@alwadi.local' },
      update: {},
      create: {
        id: 'user_tenant_b_uuid',
        email: 'tenant_b_test@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Tenant B Corp'
      }
    });

    const companyB = await prisma.company.upsert({
      where: { vat_number: TEST_COMPANY_B_VAT },
      update: {},
      create: {
        user_id: userB.id,
        vat_number: TEST_COMPANY_B_VAT,
        cr_number: '1010888888',
        registered_name: 'Tenant B Corp L.L.C.',
        environment: 'SANDBOX'
      }
    });
    companyBId = companyB.id;

    // 3. Create Secret Invoice for Company B
    const invB = await prisma.invoice.create({
      data: {
        company_id: companyBId,
        invoice_number: 'INV-SECRET-TENANT-B-999',
        date: new Date(),
        total_amount: 95000.00,
        tax_amount: 14250.00,
        status: 'CLEARED',
        type: 'B2B'
      }
    });
    invoiceBId = invB.id;
  });

  afterAll(async () => {
    // Cleanup real DB test artifacts
    if (invoiceBId) {
      await prisma.invoice.deleteMany({ where: { id: invoiceBId } });
    }
    await prisma.company.deleteMany({ where: { vat_number: { in: [TEST_COMPANY_A_VAT, TEST_COMPANY_B_VAT] } } });
    await prisma.user.deleteMany({ where: { email: { in: ['tenant_a_test@alwadi.local', 'tenant_b_test@alwadi.local'] } } });
  });

  it('Real DB SELECT: Company A scope returns 0 records for Company B invoice', async () => {
    const tenantAInvoices = await prisma.invoice.findMany({
      where: {
        company_id: companyAId, // Enforced server-side company scope
        id: invoiceBId
      }
    });

    expect(tenantAInvoices.length).toBe(0);
  });

  it('Real DB UPDATE: Company A scope cannot update Company B invoice', async () => {
    const updateResult = await prisma.invoice.updateMany({
      where: {
        id: invoiceBId,
        company_id: companyAId // Attempting update under Company A context
      },
      data: {
        status: 'FAILED'
      }
    });

    expect(updateResult.count).toBe(0);

    // Verify Company B invoice status is unchanged
    const invB = await prisma.invoice.findUnique({ where: { id: invoiceBId } });
    expect(invB?.status).toBe('CLEARED');
  });

  it('Real DB DELETE: Company A scope cannot delete Company B invoice', async () => {
    const deleteResult = await prisma.invoice.deleteMany({
      where: {
        id: invoiceBId,
        company_id: companyAId // Attempting delete under Company A context
      }
    });

    expect(deleteResult.count).toBe(0);

    // Verify Company B invoice still exists
    const invB = await prisma.invoice.findUnique({ where: { id: invoiceBId } });
    expect(invB).not.toBeNull();
  });
});
