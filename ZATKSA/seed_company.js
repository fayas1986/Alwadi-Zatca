
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');

const connectionString = "postgresql://neondb_owner:npg_NdXaf4t7kDOK@ep-nameless-bar-a15lniim-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ 
  connectionString,
  ssl: { rejectUnauthorized: false }
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = Buffer.from('12345678901234567890123456789012');
const IV_LENGTH = 16;

const encrypt = (text) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

async function main() {
  console.log('--- SEEDING/UPDATING COMPANY ---');
  try {
    const data = {
      registered_name: 'Satguru Travels Tourism',
      vat_number: '300000000000003',
      cr_number: '1010101010',
      branch_name: 'Main Branch',
      address: 'King Fahd Road, 1234',
      city: 'Riyadh',
      country: 'SA',
      environment: 'SANDBOX',
      settings: {
        profile: {
          email: 'finance@satguru-travels.sa',
          phone: '+966 11 444 5555',
          website: 'www.satguru-travels.sa'
        }
      }
    };

    const company = await prisma.company.upsert({
      where: { id: 'org-001' },
      update: data,
      create: {
        id: 'org-001',
        ...data
      }
    });
    console.log('Company updated/created:', company.id, company.vatNumber, company.environment);
  } catch (err) {
    console.error('Error seeding/updating company:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
