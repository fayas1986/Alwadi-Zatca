import './env.js';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  let url = process.env.DATABASE_URL;
  
  // Fix for Neon Postgres: Remove connection pooler to avoid connection issues on cold starts and serverless
  if (url && url.includes('neon.tech')) {
    if (process.env.VERCEL) {
      if (!url.includes('-pooler.')) {
        url = url.replace('.ap-southeast-1.', '-pooler.ap-southeast-1.');
      }
      if (!url.includes('pgbouncer=true')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}pgbouncer=true`;
      }
    } else {
      url = url.replace('-pooler.', '.');
      url = url.replace('?pgbouncer=true&', '?');
      url = url.replace('?pgbouncer=true', '');
      url = url.replace('&pgbouncer=true', '');
    }
    url = url.replace('&channel_binding=require', '');
    url = url.replace('?channel_binding=require&', '?');
    url = url.replace('?channel_binding=require', '');
    
    // Serverless functions on Vercel must use connection_limit=1 to prevent pool exhaustion across lambdas
    const connParams = process.env.VERCEL 
      ? 'connection_limit=1&connect_timeout=10&pool_timeout=10' 
      : 'connection_limit=15&connect_timeout=30&pool_timeout=30';

    if (!url.includes('connect_timeout=')) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}${connParams}`;
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
              errorMsg.includes('Engine is not yet connected') ||
              errorMsg.includes('connection pool')
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

const prisma = process.env.VERCEL ? prismaClientSingleton() : (globalThis.prisma ?? prismaClientSingleton());

export default prisma;

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) globalThis.prisma = prisma;
