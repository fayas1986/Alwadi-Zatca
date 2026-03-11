const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const users = [
    { id: 'user-admin-001',      email: 'admin@tech-solutions.sa',      password: 'password', name: 'IT Admin',       role: 'IT_ADMIN',      company_name: 'Tech Solutions Group' },
    { id: 'user-finance-001',    email: 'finance@tech-solutions.sa',    password: 'password', name: 'Finance Manager', role: 'FINANCE_ADMIN', company_name: 'Tech Solutions Group' },
    { id: 'user-tax-001',        email: 'tax@tech-solutions.sa',        password: 'password', name: 'Tax Officer',    role: 'TAX_OFFICER',   company_name: 'Tech Solutions Group' },
    { id: 'user-superadmin-001', email: 'superadmin@tech-solutions.sa', password: 'password', name: 'Super Admin',    role: 'SUPER_ADMIN',   company_name: 'Tech Solutions Group' },
];

async function main() {
    console.log('Seeding default users...');
    for (const u of users) {
        await prisma.user.upsert({ where: { email: u.email }, update: {}, create: u });
        console.log('  ok:', u.email);
    }
    console.log('Done!');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
