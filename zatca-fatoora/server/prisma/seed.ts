
import { PrismaClient, UserRole } from '@prisma/client';
import crypto from 'crypto';
import { encrypt } from '../src/utils/crypto'; // Import helper

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  const users = [
    {
      id: crypto.randomUUID(),
      email: 'admin@tech-solutions.sa',
      name: 'IT Administrator',
      role: UserRole.IT_ADMIN,
      company_name: 'Tech Solutions Ltd'
    },
    {
      id: crypto.randomUUID(),
      email: 'finance@tech-solutions.sa',
      name: 'Finance Manager',
      role: UserRole.FINANCE_ADMIN,
      company_name: 'Tech Solutions Ltd'
    },
    {
      id: crypto.randomUUID(),
      email: 'tax@tech-solutions.sa',
      name: 'Tax Officer',
      role: UserRole.TAX_OFFICER,
      company_name: 'Tech Solutions Ltd'
    },
    {
      id: crypto.randomUUID(),
      email: 'superadmin@tech-solutions.sa',
      name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      company_name: 'System'
    },
    {
      id: 'system_admin',
      email: 'admin@system.local',
      name: 'System Administrator',
      role: UserRole.SUPER_ADMIN,
      company_name: 'System'
    }
  ];

  for (const user of users) {
    const exists = await prisma.user.findUnique({
      where: { email: user.email }
    });

    if (!exists) {
      await prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          company_name: user.company_name,
          password: 'password123' // Default password
        }
      });
      console.log(`Created user: ${user.email}`);
    } else {
      console.log(`User already exists: ${user.email}`);
    }
  }

  // Seed default company for ERP testing
  const defaultCompanyVat = '300000000000003';
  const company = await prisma.company.upsert({
    where: { vat_number: defaultCompanyVat },
    update: {},
    create: {
      user_id: 'system_admin',
      registered_name: 'Tech Solutions Ltd',
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

  // Seed Certificate for the company
  const cert = await prisma.certificate.findFirst({ where: { company_id: company.id } });
  
  // Encrypt mock values
  const mockKey = encrypt('-----BEGIN EC PRIVATE KEY-----\nMII...Key...\n-----END EC PRIVATE KEY-----');
  const mockSecret = encrypt('secret-password');

  if (!cert) {
      await prisma.certificate.create({
          data: {
              company_id: company.id,
              type: 'PRODUCTION',
              certificate: '-----BEGIN CERTIFICATE-----\nMII...Cert...\n-----END CERTIFICATE-----',
              private_key: mockKey,
              public_key: 'pub_key...',
              csid: 'csid_token...',
              secret: mockSecret,
              is_active: true
          }
      });
      console.log('Created Mock Certificate with Encrypted Keys');
  } else {
      console.log('Certificate already exists. Updating keys for consistency...');
      await prisma.certificate.update({
          where: { id: cert.id },
          data: {
              private_key: mockKey,
              secret: mockSecret
          }
      });
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
