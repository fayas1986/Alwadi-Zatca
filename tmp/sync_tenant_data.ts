
import { PrismaClient, UserRole } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('--- SYNCING USERS AND COMPANIES ---');

    // 1. Ensure IT Admin user exists in DB (even if used for fallback)
    const itAdminEmail = 'admin@tech-solutions.sa';
    const itAdmin = await prisma.user.upsert({
        where: { email: itAdminEmail },
        update: { role: 'IT_ADMIN' },
        create: {
            id: 'u-it-admin-001',
            email: itAdminEmail,
            name: 'IT Administrator',
            role: 'IT_ADMIN',
            password: 'password123'
        }
    });
    console.log(`Ensured IT Admin exists: ${itAdmin.id}`);

    // 2. Ensure Super Admin user exists in DB
    const superAdminEmail = 'superadmin@tech-solutions.sa';
    const superAdmin = await prisma.user.upsert({
        where: { email: superAdminEmail },
        update: { role: 'SUPER_ADMIN' },
        create: {
            id: 'u-super-admin-001',
            email: superAdminEmail,
            name: 'Super Admin',
            role: 'SUPER_ADMIN',
            password: 'Zatca#Secure!2026@Connect'
        }
    });
    console.log(`Ensured Super Admin exists: ${superAdmin.id}`);

    // 3. Find companies
    const satguru = await prisma.company.findFirst({ where: { registered_name: { contains: 'Satguru' } } });
    const easyLease = await prisma.company.findFirst({ where: { registered_name: { contains: 'Easy Lease' } } });

    // 4. Correct Associations
    if (satguru) {
        console.log(`Linking Satguru (${satguru.id}) to IT Admin (${itAdmin.id})`);
        await prisma.company.update({
            where: { id: satguru.id },
            data: { user: { connect: { id: itAdmin.id } } }
        });
    }

    if (easyLease) {
        console.log(`Linking Easy Lease (${easyLease.id}) to Super Admin (${superAdmin.id})`);
        await prisma.company.update({
            where: { id: easyLease.id },
            data: { user: { connect: { id: superAdmin.id } } }
        });
    }

    // 5. Check if any other companies are accidentally linked to IT Admin
    const allItAdminCompanies = await prisma.company.findMany({
        where: { user: { email: itAdminEmail } }
    });
    console.log(`IT Admin now sees ${allItAdminCompanies.length} companies:`, allItAdminCompanies.map(c => c.registered_name));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
