import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY || 'v-7h-Z-9_q-R-4_x-L-1_p-m-9_o-k-2_j').padEnd(32, '0').substring(0, 32); 
const IV_LENGTH = 16;

export const encrypt = (text: string) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const usersToUpdate = [
    { email: 'superadmin@tech-solutions.sa', password: 'Zatca#Secure!2026@Connect' },
    { email: 'admin@tech-solutions.sa', password: 'password123' },
    { email: 'finance@tech-solutions.sa', password: 'password123' },
    { email: 'tax@tech-solutions.sa', password: 'password123' }
];

async function main() {
    for (const u of usersToUpdate) {
        try {
            await prisma.user.update({
                where: { email: u.email },
                data: { password: encrypt(u.password) }
            });
            console.log(`Updated ${u.email}`);
        } catch (e: any) {
            console.error(`Failed to update ${u.email}:`, e.message);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
