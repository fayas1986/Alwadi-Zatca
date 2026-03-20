import prisma from '../server/src/lib/prisma.js';

async function main() {
  try {
    const companies = await prisma.company.findMany({
      include: {
        certificates: true
      }
    });
    console.log(JSON.stringify(companies, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
