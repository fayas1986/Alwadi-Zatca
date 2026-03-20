import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function resetPassword() {
  try {
    await prisma.user.update({
      where: { email: 'alka.sharma@yiron.in' },
      data: { password: 'Test@123' } // Reset to plaintext
    });
    console.log('PASSWORD_RESET_SUCCESS');
  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
