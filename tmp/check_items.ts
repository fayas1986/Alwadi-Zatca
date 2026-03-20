import prisma from '../server/src/lib/prisma.js';

async function check() {
    try {
        const items = await prisma.item.findMany({
            where: {
                name: { contains: 'Test' }
            },
            take: 5,
            orderBy: { created_at: 'desc' }
        });
        console.log('RECENT TEST ITEMS:', JSON.stringify(items, null, 2));
    } catch (err: any) {
        console.error('DB CHECK FAILED:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}
check();
