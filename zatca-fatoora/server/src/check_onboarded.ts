
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Onboarded Companies ---');
    try {
        const companies = await prisma.company.findMany({
            include: {
                certificates: true
            }
        });

        console.log(`Found ${companies.length} companies:`);
        companies.forEach(c => {
            const activeCert = c.certificates.find(cert => cert.is_active);
            console.log(`- VAT: ${c.vat_number}, Name: ${c.registered_name}, Env: ${c.environment}, Active Cert: ${activeCert ? 'Yes' : 'No'}`);
        });

    } catch (error) {
        console.error('Error querying database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
