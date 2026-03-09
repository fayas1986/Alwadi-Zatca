
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

let prisma: PrismaClient;

export const getPrisma = () => {
  if (!prisma) {
    const connectionString = process.env.DATABASE_URL;
    console.log('--- Initializing Prisma with pg Pool ---');
    console.log('Connection String defined:', !!connectionString);
    
    // Explicitly handle SSL for Neon on Windows
    const pool = new pg.Pool({ 
      connectionString,
      ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : false
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    
    console.log('Prisma Client initialized with Driver Adapter');
  }
  return prisma;
};

export default getPrisma;
