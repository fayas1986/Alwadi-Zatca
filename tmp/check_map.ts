
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('--- USER-COMPANY MAP ---');
    const companies = await prisma.company.findMany({
        include: { user: true }
    });
    
    for (const c of companies) {
        console.log(`[COMPANY] ID: ${c.id} | Name: ${c.registered_name} | Owner: ${c.user?.email} (${c.user?.role})`);
    }

    console.log('\n--- ALL USERS ---');
    const users = await prisma.user.findMany();
    for (const u of users) {
        console.log(`[USER] ID: ${u.id} | Email: ${u.email} | Role: ${u.role}`);
    }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
