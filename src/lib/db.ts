import { PrismaClient } from '@prisma/client'

// Singleton pattern for serverless environments (Vercel, Netlify, etc.)
// Prevents connection exhaustion by reusing the client across function invocations
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

// Graceful shutdown helper (useful in non-serverless environments)
export async function disconnectDB() {
  await db.$disconnect()
}
