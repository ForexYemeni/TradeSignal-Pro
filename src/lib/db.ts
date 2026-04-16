import { PrismaClient } from '@prisma/client'

/**
 * Prisma Client for Vercel Serverless + PostgreSQL (Neon)
 *
 * Uses the singleton pattern to prevent connection exhaustion
 * in serverless environments (Vercel, Netlify, etc.)
 * where each function invocation could create a new connection.
 *
 * For Neon PostgreSQL, use the pooled connection URL:
 * - Direct: postgresql://user:pass@ep-xxx.region.neon.tech/dbname?sslmode=require
 * - Pooled: postgresql://user:pass@ep-xxx.region.neon.tech/dbname?sslmode=require&pgbouncer=true
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    // Connection pooling settings for serverless
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

// Graceful shutdown helper
export async function disconnectDB() {
  await db.$disconnect()
}
