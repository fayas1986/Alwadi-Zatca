import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'alka.sharma@yiron.in' } });
    console.log("Password:", user.password);
    console.log("Includes colon:", user.password.includes(':'));
}
main().catch(console.error).finally(() => prisma.$disconnect());
