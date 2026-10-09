import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('--- STARTING TENANT DATA ALIGNMENT ---');

    const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    const defaultCompany = await prisma.company.findFirst();

    if (defaultCompany && superAdmin) {
        console.log(`Ensuring primary company "${defaultCompany.registered_name}" is assigned to Super Admin`);
        await prisma.company.update({
            where: { id: defaultCompany.id },
            data: { user_id: superAdmin.id }
        });
    }

    console.log('--- TENANT DATA ALIGNMENT COMPLETE ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
