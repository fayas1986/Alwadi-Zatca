import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetCerts() {
    console.log("Deleting corrupted certificates...");
    await prisma.certificate.deleteMany({});
    console.log("Deleted all certificates. The system will fall back to simulated real-time mode.");
}

resetCerts().catch(console.error).finally(() => prisma.$disconnect());
