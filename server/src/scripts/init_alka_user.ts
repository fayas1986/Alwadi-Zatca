import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// Re-implementing necessary encryption logic to avoid import issues with ts-node
const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY || 'v-7h-Z-9_q-R-4_x-L-1_p-m-9_o-k-2_j').padEnd(32, '0').substring(0, 32); 
const IV_LENGTH = 16;

const encrypt = (text: string) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const prisma = new PrismaClient();

async function main() {
    const email = 'alka.sharma@yiron.in';
    const password = 'Test@123';
    const companyVat = '334534534532343';

    console.log('[Setup] Initializing user and company (self-contained script)...');

    // 1. Create/Update User
    const user = await prisma.user.upsert({
        where: { email },
        update: { 
            password: encrypt(password),
            role: 'IT_ADMIN'
        },
        create: {
            id: crypto.randomUUID(),
            email,
            password: encrypt(password),
            name: 'Alka Sharma',
            role: 'IT_ADMIN',
            company_name: 'Company 38'
        }
    });

    // 2. Create/Update Company
    const company = await prisma.company.upsert({
        where: { vat_number: companyVat },
        update: { user_id: user.id },
        create: {
            user_id: user.id,
            vat_number: companyVat,
            cr_number: '1010101038',
            registered_name: 'Company 38',
            environment: 'SIMULATION',
            is_active: true
        }
    });

    console.log(`[Success] User ${user.email} initialized and linked to company ${company.registered_name}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
