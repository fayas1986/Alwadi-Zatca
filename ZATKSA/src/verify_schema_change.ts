
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const vatNumber = '300000000000003';
    const companyName = 'Test Company';

    console.log('Cleaning up existing test data...');
    await prisma.company.deleteMany({
        where: { vatNumber }
    });

    console.log('Creating Sandbox company...');
    await prisma.company.create({
        data: {
            vatNumber,
            name: companyName,
            address: {},
            environment: 'Sandbox'
        }
    });
    console.log('✅ Sandbox company created.');

    console.log('Creating Production company (same VAT)...');
    await prisma.company.create({
        data: {
            vatNumber,
            name: companyName,
            address: {},
            environment: 'Production'
        }
    });
    console.log('✅ Production company created.');

    console.log('Attempting duplicate Sandbox company...');
    try {
        await prisma.company.create({
            data: {
                vatNumber,
                name: companyName,
                address: {},
                environment: 'Sandbox'
            }
        });
        console.error('❌ Failed: Duplicate should have thrown error');
    } catch (e) {
        console.log('✅ Success: Duplicate blocked correctly.');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
