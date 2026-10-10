import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../index.js';
import prisma from '../lib/prisma.js';
import { signJwt } from '../utils/jwt.js';

describe('Comprehensive Cross-Tenant & RBAC Negative Security Suite', () => {
  const alwadiVat = '300000000000003';
  const competitorVat = '388888888800003';
  const alwadiEmail = 'admin@alwadipoultry.com';
  const competitorEmail = 'admin@competitor-corp.sa';
  const unassignedEmail = 'unassigned_user@no-company.sa';

  let alwadiToken: string;
  let competitorToken: string;
  let unassignedUserToken: string;
  let superAdminToken: string;
  let alwadiCompanyId: number;
  let competitorCompanyId: number;

  beforeAll(async () => {
    // 1. Setup Alwadi User & Company
    const userAlwadi = await prisma.user.upsert({
      where: { email: alwadiEmail },
      update: {},
      create: {
        id: 'full_suite_alwadi_user',
        email: alwadiEmail,
        role: 'IT_ADMIN',
        company_name: 'Alwadi Trading L.L.C.'
      }
    });

    let compAlwadi = await prisma.company.findFirst({ where: { vat_number: alwadiVat } });
    if (!compAlwadi) {
      compAlwadi = await prisma.company.create({
        data: {
          user_id: userAlwadi.id,
          registered_name: 'Alwadi Trading L.L.C.',
          vat_number: alwadiVat,
          cr_number: '1010101010',
          branch_name: 'HQ',
          address: 'Olaya Street',
          city: 'Riyadh',
          country: 'SA'
        }
      });
    } else {
      await prisma.company.update({
        where: { id: compAlwadi.id },
        data: { user_id: userAlwadi.id }
      });
    }
    alwadiCompanyId = compAlwadi.id;

    // 2. Setup Competitor User & Company
    const userCompetitor = await prisma.user.upsert({
      where: { email: competitorEmail },
      update: {},
      create: {
        id: 'full_suite_competitor_user',
        email: competitorEmail,
        role: 'IT_ADMIN',
        company_name: 'Competitor Corp'
      }
    });

    let compCompetitor = await prisma.company.findFirst({ where: { vat_number: competitorVat } });
    if (!compCompetitor) {
      compCompetitor = await prisma.company.create({
        data: {
          user_id: userCompetitor.id,
          registered_name: 'Competitor Corp',
          vat_number: competitorVat,
          cr_number: '3030303030',
          branch_name: 'HQ',
          address: 'King Abdulaziz Road',
          city: 'Jeddah',
          country: 'SA'
        }
      });
    } else {
      await prisma.company.update({
        where: { id: compCompetitor.id },
        data: { user_id: userCompetitor.id }
      });
    }
    competitorCompanyId = compCompetitor.id;

    // 3. Setup Unassigned User (No Company Membership)
    const userUnassigned = await prisma.user.upsert({
      where: { email: unassignedEmail },
      update: {},
      create: {
        id: 'full_suite_unassigned_user',
        email: unassignedEmail,
        role: 'IT_ADMIN',
        company_name: ''
      }
    });

    // 4. Issue JWT Tokens
    alwadiToken = signJwt({
      userId: userAlwadi.id,
      email: alwadiEmail,
      role: 'IT_ADMIN',
      companyId: alwadiCompanyId
    });

    competitorToken = signJwt({
      userId: userCompetitor.id,
      email: competitorEmail,
      role: 'IT_ADMIN',
      companyId: competitorCompanyId
    });

    unassignedUserToken = signJwt({
      userId: userUnassigned.id,
      email: unassignedEmail,
      role: 'IT_ADMIN',
      companyId: undefined
    });

    superAdminToken = signJwt({
      userId: 'system_admin',
      email: 'system.admin@alwadipoultry.com',
      role: 'SUPER_ADMIN',
      companyId: alwadiCompanyId
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. READ Operation: Alwadi user cannot view Competitor company details', async () => {
    const res = await supertest(app)
      .get('/api/admin/companies')
      .set('Authorization', `Bearer ${alwadiToken}`)
      .expect(200);

    const companyIds = res.body.map((c: any) => c.id.toString());
    expect(companyIds).toContain(alwadiCompanyId.toString());
    expect(companyIds).not.toContain(competitorCompanyId.toString());
  });

  it('2. MISSING MEMBERSHIP: User without verified company membership is denied (403 Forbidden)', async () => {
    const res = await supertest(app)
      .get('/api/admin/companies')
      .set('Authorization', `Bearer ${unassignedUserToken}`)
      .expect(403);

    expect(res.body.error).toMatch(/User has no verified company membership/i);
  });

  it('3. MANIPULATED ID OVERRIDE: Alwadi user supplying companyId query override for Competitor is denied/scoped', async () => {
    const res = await supertest(app)
      .get(`/api/admin/companies?companyId=${competitorCompanyId}`)
      .set('Authorization', `Bearer ${alwadiToken}`)
      .expect(200);

    const companyNames = res.body.map((c: any) => c.name);
    expect(companyNames).not.toContain('Competitor Corp');
  });

  it('4. FORGED HEADER: Caller attempting header privilege escalation receives 403 Forbidden', async () => {
    const res = await supertest(app)
      .get('/api/admin/groups')
      .set('Authorization', `Bearer ${alwadiToken}`)
      .set('x-user-role', 'SUPER_ADMIN')
      .expect(403);

    expect(res.body.error).toMatch(/Forbidden/i);
  });

  it('5. RBAC POLICY: SUPER_ADMIN token passes authentication and can view cross-tenant companies', async () => {
    const res = await supertest(app)
      .get('/api/admin/companies')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    const companyIds = res.body.map((c: any) => c.id.toString());
    expect(companyIds).toContain(alwadiCompanyId.toString());
    expect(companyIds).toContain(competitorCompanyId.toString());
  });

  it('6. FAIL-CLOSED: Missing Bearer token fails closed with 401 Unauthorized', async () => {
    const res = await supertest(app)
      .get('/api/admin/companies')
      .expect(401);

    expect(res.body.error).toMatch(/Unauthorized/i);
  });
});
