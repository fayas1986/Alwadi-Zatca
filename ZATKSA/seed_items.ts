
import 'dotenv/config';
import { getPrisma } from './src/lib/prisma';

const prisma = getPrisma();

async function main() {
  console.log('Seeding database...');

  const company = await prisma.company.upsert({
    where: { 
      vatNumber_environment: {
        vatNumber: '300000000000003',
        environment: 'Simulation'
      }
    },
    update: {},
    create: {
      id: 'org-001',
      name: 'Satguru Travels Tourism',
      vatNumber: '300000000000003',
      address: {
        streetName: 'Olaya Street',
        buildingNumber: '1234',
        additionalNumber: '1111',
        citySubdivisionName: 'Olaya',
        cityName: 'Riyadh',
        postalZone: '12211',
        countryCode: 'SA'
      },
      environment: 'Simulation'
    }
  });

  console.log('Default company created/updated:', company.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
