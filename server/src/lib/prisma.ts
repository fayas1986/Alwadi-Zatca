import './env.js';
import { PrismaClient } from '@prisma/client';

const DEFAULT_NEON_URL = "postgresql://neondb_owner:npg_MStg5qT3uFbc@ep-spring-hat-a18pmkyp-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const prismaClientSingleton = () => {
  let url = process.env.DATABASE_URL || DEFAULT_NEON_URL;
  
  if (url.includes('neon.tech')) {
    if (!url.includes('-pooler.')) {
      url = url.replace('ep-spring-hat-a18pmkyp.', 'ep-spring-hat-a18pmkyp-pooler.');
    }
    if (!url.includes('sslmode=require')) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}sslmode=require`;
    }
  }

  console.log('[Prisma] Initializing with DB URL:', url ? (url.substring(0, 30) + '...') : 'MISSING');
  
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
