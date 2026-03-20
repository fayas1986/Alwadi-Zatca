
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkMapping() {
    try {
        console.log('--- User Check ---');
        const user = await prisma.user.findUnique({
            where: { email: 'alka.sharma@yiron.in' }
        });
        console.log('User found:', user);

        if (user) {
            console.log('\n--- Companies Assigned to User ---');
            const companies = await prisma.company.findMany({
                where: { user_id: user.id }
            });
            console.log('Companies:', companies);
        } else {
            console.log('User alka.sharma@yiron.in not found in database.');
        }

        console.log('\n--- All Companies (Registered Name: Satguru) ---');
        const satguru = await prisma.company.findMany({
            where: { registered_name: { contains: 'Satguru', mode: 'insensitive' } },
            include: { user: true }
        });
        console.log('Satguru check:', satguru);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkMapping();
