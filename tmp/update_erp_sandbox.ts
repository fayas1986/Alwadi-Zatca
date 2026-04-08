import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const updated = await prisma.erp_configuration.updateMany({
        where: {
            environment: 'SANDBOX',
            base_url: {
                contains: 'uat01.factslite.com'
            }
        },
        data: {
            base_url: 'http://uat01.factslite.com:8087/api/token?vendorId=2',
            api_key: 'sk_cus_test_4anvtlha245kq3v9'
        }
    });

    console.log(`Updated ${updated.count} ERP configuration(s) for Sandbox.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
