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
    
    // Add connection timeout and pool parameters for cold starts
    if (!url.includes('connect_timeout=')) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}connect_timeout=30&pool_timeout=30&connection_limit=15`;
    }
  }

  console.log('[Prisma] Initializing with DB URL:', url ? (url.substring(0, 20) + '...') : 'MISSING');
  
  const basePrisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    errorFormat: 'pretty',
    datasourceUrl: url,
  });

  // Automatically catch transient connection drops or Neon sleep errors and retry once
  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          try {
            return await query(args);
          } catch (error: any) {
            const errorMsg = error?.message || '';
            const errorCode = error?.code;
            if (
              errorCode === 'P1001' ||
              errorCode === 'P2024' ||
              errorMsg.includes('Connection terminated') ||
              errorMsg.includes('Closed connection') ||
              errorMsg.includes('Can\'t reach database server') ||
              errorMsg.includes('timeout expired') ||
              errorMsg.includes('socket disconnected') ||
              errorMsg.includes('Engine is not yet connected')
            ) {
              console.warn(`[Prisma Retry] Connection error (${errorCode || 'drop'}) on ${model}.${operation}. Reconnecting and retrying...`);
              try {
                await basePrisma.$disconnect();
                await basePrisma.$connect();
                return await query(args);
              } catch (retryError: any) {
                console.error(`[Prisma Retry] Second attempt failed on ${model}.${operation}:`, retryError?.message?.split('\n')[0]);
                throw retryError;
              }
            }
            throw error;
          }
        }
      }
    }
  }) as unknown as PrismaClient;
};


declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;
