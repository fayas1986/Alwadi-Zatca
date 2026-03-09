
import { PrismaClient } from '@prisma/client';
require('dotenv').config();

const prisma = new PrismaClient();

async function test() {
  console.log('Testing Prisma connection...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'PRESENT' : 'MISSING');
  try {
    const count = await prisma.company.count();
    console.log('Company count:', count);
    console.log('SUCCESS: Connection verified.');
  } catch (err) {
    console.error('Prisma Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
