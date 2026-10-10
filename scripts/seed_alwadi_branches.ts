import prisma from '../server/src/lib/prisma.js';

export const ALWADI_7_BRANCHES = [
  {
    code: 'BR-001',
    name: 'Riyadh Main Branch (HQ)',
    city: 'Riyadh',
    address: 'King Fahd Road, Olaya District, Riyadh, SA',
    street_name: 'King Fahd Road',
    building_number: '7210',
    postal_zone: '12211',
    city_subdivision: 'Olaya',
    country: 'SA',
    is_active: true
  },
  {
    code: 'BR-002',
    name: 'Jeddah Regional Branch',
    city: 'Jeddah',
    address: 'Al Madinah Al Munawwarah Rd, Al Sharafeyah, Jeddah, SA',
    street_name: 'Al Madinah Road',
    building_number: '3410',
    postal_zone: '22234',
    city_subdivision: 'Al Sharafeyah',
    country: 'SA',
    is_active: true
  },
  {
    code: 'BR-003',
    name: 'Dammam Branch',
    city: 'Dammam',
    address: 'King Abdulaziz Street, Al Shati, Dammam, SA',
    street_name: 'King Abdulaziz St',
    building_number: '8912',
    postal_zone: '32414',
    city_subdivision: 'Al Shati',
    country: 'SA',
    is_active: true
  },
  {
    code: 'BR-004',
    name: 'Khobar Commercial Branch',
    city: 'Al Khobar',
    address: 'Prince Turki Street, Al Yarmouk, Khobar, SA',
    street_name: 'Prince Turki St',
    building_number: '4520',
    postal_zone: '34423',
    city_subdivision: 'Al Yarmouk',
    country: 'SA',
    is_active: true
  },
  {
    code: 'BR-005',
    name: 'Medina Branch',
    city: 'Medina',
    address: 'Sultana Road, Al Iskan, Medina, SA',
    street_name: 'Sultana Rd',
    building_number: '6110',
    postal_zone: '42311',
    city_subdivision: 'Al Iskan',
    country: 'SA',
    is_active: true
  },
  {
    code: 'BR-006',
    name: 'Mecca Branch',
    city: 'Mecca',
    address: 'Ibrahim Al Khalil St, Al Msaflah, Mecca, SA',
    street_name: 'Ibrahim Al Khalil St',
    building_number: '2390',
    postal_zone: '24233',
    city_subdivision: 'Al Msaflah',
    country: 'SA',
    is_active: true
  },
  {
    code: 'BR-007',
    name: 'Tabuk Branch',
    city: 'Tabuk',
    address: 'King Khalid Road, Al Muruj, Tabuk, SA',
    street_name: 'King Khalid Rd',
    building_number: '1980',
    postal_zone: '47911',
    city_subdivision: 'Al Muruj',
    country: 'SA',
    is_active: true
  }
];

export async function seedAlwadiBranches() {
  console.log('[Seed] Seeding 7 branches for Alwadi Trading L.L.C...');

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { vat_number: '300000000000003' },
        { registered_name: { contains: 'Alwadi', mode: 'insensitive' } }
      ]
    }
  });

  if (!company) {
    console.warn('[Seed] Company Alwadi not found. Skipping branch seed.');
    return [];
  }

  const seededBranches = [];
  for (const b of ALWADI_7_BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: {
        company_id_code: {
          company_id: company.id,
          code: b.code
        }
      },
      update: {
        name: b.name,
        city: b.city,
        address: b.address,
        street_name: b.street_name,
        building_number: b.building_number,
        postal_zone: b.postal_zone,
        city_subdivision: b.city_subdivision,
        is_active: b.is_active
      },
      create: {
        company_id: company.id,
        code: b.code,
        name: b.name,
        city: b.city,
        address: b.address,
        street_name: b.street_name,
        building_number: b.building_number,
        postal_zone: b.postal_zone,
        city_subdivision: b.city_subdivision,
        country: b.country,
        is_active: b.is_active
      }
    });
    seededBranches.push(branch);
  }

  console.log(`[Seed] Successfully seeded ${seededBranches.length} branches for company ID ${company.id} (${company.registered_name}).`);
  return seededBranches;
}

if (process.argv[1]?.includes('seed_alwadi_branches')) {
  seedAlwadiBranches()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
