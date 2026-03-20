
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('--- STARTING TENANT DATA FIX ---');

    // 1. Identify users
    const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    const itAdmin = await prisma.user.findUnique({ where: { email: 'admin@tech-solutions.sa' } });

    if (!itAdmin) {
        console.error('IT Admin (admin@tech-solutions.sa) not found!');
        return;
    }

    console.log(`SuperAdmin ID: ${superAdmin?.id}`);
    console.log(`IT Admin ID: ${itAdmin.id}`);

    // 2. Identify companies
    const satguru = await prisma.company.findFirst({ where: { registered_name: { contains: 'Satguru' } } });
    const easyLease = await prisma.company.findFirst({ where: { registered_name: { contains: 'Easy Lease' } } });

    // 3. Link Satguru to IT Admin
    if (satguru) {
        console.log(`Linking ${satguru.registered_name} to IT Admin`);
        await prisma.company.update({
            where: { id: satguru.id },
            data: { user_id: itAdmin.id }
        });
    }

    // 4. Link Easy Lease to Super Admin
    if (easyLease && superAdmin) {
        console.log(`Linking ${easyLease.registered_name} to Super Admin`);
        await prisma.company.update({
            where: { id: easyLease.id },
            data: { user_id: superAdmin.id }
        });
    }

    console.log('--- TENANT DATA FIX COMPLETE ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
