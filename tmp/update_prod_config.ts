import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const result = await prisma.erp_configuration.updateMany({
        where: { environment: 'PRODUCTION' },
        data: {
            base_url: 'http://uat01.factslite.com:8087/api/token?vendorId=2',
            api_key: 'sk_cus_test_4anvtlha245kq3v9'
        }
    });
    console.log(`Updated ${result.count} Production ERP configurations.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
