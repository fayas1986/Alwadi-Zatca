import { PrismaClient, UserRole } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

const defaultUsers = [
    { id: 'user-admin-001', email: 'admin@tech-solutions.sa', password: 'password', name: 'IT Admin', role: UserRole.IT_ADMIN, company_name: 'Tech Solutions Group' },
    { id: 'user-finance-001', email: 'finance@tech-solutions.sa', password: 'password', name: 'Finance Manager', role: UserRole.FINANCE_ADMIN, company_name: 'Tech Solutions Group' },
    { id: 'user-tax-001', email: 'tax@tech-solutions.sa', password: 'password', name: 'Tax Officer', role: UserRole.TAX_OFFICER, company_name: 'Tech Solutions Group' },
    { id: 'user-superadmin-001', email: 'superadmin@tech-solutions.sa', password: 'password', name: 'Super Admin', role: UserRole.SUPER_ADMIN, company_name: 'Tech Solutions Group' },
];

async function main() {
    console.log('Seeding users...');
    for (const user of defaultUsers) {
        await prisma.user.upsert({
            where: { email: user.email },
            update: {},
            create: user,
        });
        console.log(`  ✓ User: ${user.email} (${user.role})`);
    }
    console.log('Done!');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
