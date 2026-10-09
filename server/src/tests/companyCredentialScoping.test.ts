import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma.js';
import { getProductionCredentials, createVerifiedUserContext } from '../services/zatcaService.js';
import { ComplianceService, validateCertKeyPair } from '../services/complianceService.js';
import crypto from 'crypto';

describe('Company Credential & Identity Scoping Regression Suite', () => {
  const COMPANY_A_VAT = '310999999900003';
  const COMPANY_B_VAT = '310888888800003';

  let companyAId: number;
  let companyBId: number;

  beforeAll(async () => {
    // 1. Create User A & Company A
    const userA = await prisma.user.upsert({
      where: { email: 'scoping_owner_a@alwadi.local' },
      update: {},
      create: {
        id: 'user_scoping_a_id',
        email: 'scoping_owner_a@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Company Scoping A'
      }
    });

    const companyA = await prisma.company.upsert({
      where: { vat_number: COMPANY_A_VAT },
      update: {},
      create: {
        user_id: userA.id,
        vat_number: COMPANY_A_VAT,
        cr_number: '1010999111',
        registered_name: 'Company Scoping A L.L.C.',
        environment: 'PRODUCTION'
      }
    });
    companyAId = companyA.id;

    // 2. Create User B & Company B
    const userB = await prisma.user.upsert({
      where: { email: 'scoping_owner_b@alwadi.local' },
      update: {},
      create: {
        id: 'user_scoping_b_id',
        email: 'scoping_owner_b@alwadi.local',
        role: 'IT_ADMIN',
        company_name: 'Company Scoping B'
      }
    });

    const companyB = await prisma.company.upsert({
      where: { vat_number: COMPANY_B_VAT },
      update: {},
      create: {
        user_id: userB.id,
        vat_number: COMPANY_B_VAT,
        cr_number: '1010888222',
        registered_name: 'Company Scoping B L.L.C.',
        environment: 'PRODUCTION'
      }
    });
    companyBId = companyB.id;

    // 3. Attach active production certificate to Company A ONLY
    await prisma.certificate.create({
      data: {
        company_id: companyAId,
        type: 'PRODUCTION',
        csid: 'CSID_SECRET_COMPANY_A_999',
        secret: 'encrypted_secret_comp_a',
        private_key: 'encrypted_privkey_comp_a',
        certificate: 'cert_pem_comp_a',
        public_key: 'pubkey_comp_a',
        is_active: true
      }
    });

    // 4. Attach active production certificate to Company B ONLY
    await prisma.certificate.create({
      data: {
        company_id: companyBId,
        type: 'PRODUCTION',
        csid: 'CSID_SECRET_COMPANY_B_888',
        secret: 'encrypted_secret_comp_b',
        private_key: 'encrypted_privkey_comp_b',
        certificate: 'cert_pem_comp_b',
        public_key: 'pubkey_comp_b',
        is_active: true
      }
    });
  });

  afterAll(async () => {
    await prisma.certificate.deleteMany({ where: { company_id: { in: [companyAId, companyBId] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
    await prisma.user.deleteMany({ where: { email: { in: ['scoping_owner_a@alwadi.local', 'scoping_owner_b@alwadi.local'] } } });
  });

  it('1. getProductionCredentials returns credentials strictly matching requested VAT', async () => {
    const credsA = await getProductionCredentials({
      vatNumber: COMPANY_A_VAT,
      environment: 'PRODUCTION',
      authContext: createVerifiedUserContext(companyAId, 'IT_ADMIN', 'user_scoping_a_id')
    });
    expect(credsA.companyId).toBe(companyAId);
    expect(credsA.csid).toBe('CSID_SECRET_COMPANY_A_999');

    const credsB = await getProductionCredentials({
      vatNumber: COMPANY_B_VAT,
      environment: 'PRODUCTION',
      authContext: createVerifiedUserContext(companyBId, 'IT_ADMIN', 'user_scoping_b_id')
    });
    expect(credsB.companyId).toBe(companyBId);
    expect(credsB.csid).toBe('CSID_SECRET_COMPANY_B_888');

    expect(credsA.companyId).not.toBe(credsB.companyId);
    expect(credsA.csid).not.toBe(credsB.csid);
  });

  it('2. getProductionCredentials throws error if requesting non-existent VAT', async () => {
    await expect(
      getProductionCredentials({
        vatNumber: '300000000000000',
        environment: 'PRODUCTION',
        authContext: createVerifiedUserContext(companyAId, 'IT_ADMIN')
      })
    ).rejects.toThrow();
  });

  it('3. validateCertKeyPair rejects mismatched public key / private key pairs', () => {
    const keyPair1 = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    const keyPair2 = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });

    const pubKey1Pem = keyPair1.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privKey2Pem = keyPair2.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const isMatch = validateCertKeyPair(pubKey1Pem, privKey2Pem);
    expect(isMatch).toBe(false);
  });
});

