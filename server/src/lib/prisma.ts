import './env.js';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  let url = process.env.DATABASE_URL;
  
  // Fix for Neon Postgres: Remove connection pooler to avoid connection issues on cold starts
  if (url && url.includes('neon.tech')) {
    url = url.replace('-pooler.', '.');
    url = url.replace('?pgbouncer=true&', '?');
    url = url.replace('?pgbouncer=true', '');
    url = url.replace('&pgbouncer=true', '');
    
    // Add connection timeout for cold starts
    if (!url.includes('connect_timeout=')) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}connect_timeout=30`;
    }
  }

  console.log('[Prisma] Initializing with DB URL:', url ? (url.substring(0, 20) + '...') : 'MISSING');
  
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    errorFormat: 'pretty',
    datasourceUrl: url,
  });
};


declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;
