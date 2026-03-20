
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fix() {
  try {
    const userEmail = 'alka.sharma@yiron.in';
    const companyName = 'Satguru';

    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      console.log('User not found!');
      return;
    }

    const company = await prisma.company.findFirst({
        where: { registered_name: { contains: companyName, mode: 'insensitive' } }
    });

    if (!company) {
      console.log('Company not found!');
      return;
    }

    console.log(`Mapping company "${company.registered_name}" (ID: ${company.id}) to user "${user.name}" (ID: ${user.id})`);
    
    await prisma.company.update({
      where: { id: company.id },
      data: { user_id: user.id }
    });

    console.log('DONE!');
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
}

fix();
