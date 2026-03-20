import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const companies = await prisma.company.findMany({
            include: { certificates: true }
        });
        console.log("Companies with certificates:");
        console.dir(companies, { depth: null });
        
        const invoices = await prisma.invoice.findMany({
            take: 5,
            orderBy: { created_at: 'desc' }
        });
        console.log("\nRecent invoices:");
        console.dir(invoices, { depth: null });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
