import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const invoices = await prisma.invoice.findMany({
            take: 10,
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                invoice_number: true,
                status: true,
                submission_response: true,
                created_at: true
            }
        });
        
        console.log("=== Recent Invoices ===");
        invoices.forEach(i => {
           console.log(`Invoice: ${i.invoice_number} | Status: ${i.status} | Date: ${i.created_at}`);
           console.log(`Response: ${i.submission_response}\n`);
        });

        const companies = await prisma.company.findMany({
            select: {
               id: true,
               registered_name: true,
               certificates: {
                  select: { id: true, is_active: true }
               }
            }
        });

        console.log("=== Companies & Certs ===");
        companies.forEach(c => {
           console.log(`Company: ${c.registered_name} | Active Certs: ${c.certificates.filter(cert => cert.is_active).length}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
