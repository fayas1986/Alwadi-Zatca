
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({ where: { email: 'alka.sharma@yiron.in' } });
  console.log('USERS:', JSON.stringify(users, null, 2));
  
  const allCompanies = await prisma.company.findMany();
  console.log('ALL COMPANIES:', JSON.stringify(allCompanies.map(c => ({ id: c.id, name: c.registered_name, user_id: c.user_id })), null, 2));

  await prisma.$disconnect();
}
check();
