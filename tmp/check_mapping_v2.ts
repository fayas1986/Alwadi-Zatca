
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  try {
    const userRole = 'IT_ADMIN';
    const userEmail = 'alka.sharma@yiron.in';

    console.log(`Searching for user with email: ${userEmail}`);
    const user = await prisma.user.findUnique({
      where: { email: userEmail }
    });

    if (!user) {
      console.log('User NOT found!');
      return;
    }

    console.log('User found:', { id: user.id, email: user.email, company_name: user.company_name });

    const companies = await prisma.company.findMany({
      where: { user_id: user.id }
    });

    console.log(`Found ${companies.length} companies assigned to user ID ${user.id}:`);
    companies.forEach(c => {
      console.log(` - ID: ${c.id}, Name: ${c.registered_name}, VAT: ${c.vat_number}`);
    });

    if (companies.length === 0) {
        console.log('\nSearching for companies by registered_name "Satguru" to see who owns them...');
        const satguruCompanies = await prisma.company.findMany({
            where: { registered_name: { contains: 'Satguru', mode: 'insensitive' } }
        });
        satguruCompanies.forEach(c => {
            console.log(` - ID: ${c.id}, Name: ${c.registered_name}, Owner ID: ${c.user_id}`);
        });
    }

  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
