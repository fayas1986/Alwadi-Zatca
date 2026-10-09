import { PrismaClient, UserRole } from '@prisma/client';
import crypto from 'crypto';
import { encrypt } from '../server/src/utils/crypto.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  const defaultCompanyName = process.env.COMPANY_REGISTERED_NAME || 'Alwadi Trading L.L.C.';
  const superAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Zatca#Secure!2026';
  const standardPassword = 'password123';

  const users = [
    {
      id: crypto.randomUUID(),
      email: 'admin@alwadi.local',
      name: 'IT Administrator',
      role: UserRole.IT_ADMIN,
      company_name: defaultCompanyName,
      password: encrypt(standardPassword)
    },
    {
      id: crypto.randomUUID(),
      email: 'finance@alwadi.local',
      name: 'Finance Manager',
      role: UserRole.FINANCE_ADMIN,
      company_name: defaultCompanyName,
      password: encrypt(standardPassword)
    },
    {
      id: crypto.randomUUID(),
      email: 'tax@alwadi.local',
      name: 'Tax Officer',
      role: UserRole.TAX_OFFICER,
      company_name: defaultCompanyName,
      password: encrypt(standardPassword)
    },
    {
      id: crypto.randomUUID(),
      email: 'superadmin@alwadi.local',
      name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      company_name: 'System',
      password: encrypt(superAdminPassword)
    },
    {
      id: 'system_admin',
      email: 'admin@system.local',
      name: 'System Administrator',
      role: UserRole.SUPER_ADMIN,
      company_name: 'System',
      password: encrypt(superAdminPassword)
    }
  ];

  for (const user of users) {
    const existing = await prisma.user.findUnique({
      where: { email: user.email }
    });

    if (!existing) {
      await prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          company_name: user.company_name,
          password: user.password
        }
      });
      console.log(`Created user: ${user.email}`);
    } else {
      await prisma.user.update({
        where: { email: user.email },
        data: {
          password: user.password
        }
      });
      console.log(`Updated user password: ${user.email}`);
    }
  }

  // Seed default company for ERP testing / initial onboarding
  const defaultCompanyVat = process.env.COMPANY_VAT_NUMBER || '300000000000003';
  const company = await prisma.company.upsert({
    where: { vat_number: defaultCompanyVat },
    update: {},
    create: {
      user_id: 'system_admin',
      registered_name: defaultCompanyName,
      vat_number: defaultCompanyVat,
      cr_number: '1010101010',
      branch_name: 'HQ',
      address: 'Olaya Street',
      city: 'Riyadh',
      country: 'SA',
      environment: 'SANDBOX'
    }
  });
  console.log(`Ensured Company: ${company.registered_name}`);

  // Seed Certificate placeholder for the company
  const cert = await prisma.certificate.findFirst({ where: { company_id: company.id } });
  
  const mockKey = encrypt('-----BEGIN EC PRIVATE KEY-----\nMII...Key...\n-----END EC PRIVATE KEY-----');
  const mockSecret = encrypt('secret-password');

  if (!cert) {
      await prisma.certificate.create({
          data: {
              company_id: company.id,
              type: 'SIMULATION',
              certificate: '-----BEGIN CERTIFICATE-----\nMII...Cert...\n-----END CERTIFICATE-----',
              private_key: mockKey,
              public_key: 'pub_key...',
              csid: 'csid_token...',
              secret: mockSecret,
              is_active: true
          }
      });
      console.log('Created Mock Certificate with Encrypted Keys');
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
