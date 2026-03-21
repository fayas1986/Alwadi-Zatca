import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCerts() {
    const certs = await prisma.certificate.findMany();
    console.log("Certificates in DB:", certs.length);
    if(certs.length > 0) {
        console.log("First cert:", certs[0]);
    }
}

checkCerts().catch(console.error).finally(() => prisma.$disconnect());
