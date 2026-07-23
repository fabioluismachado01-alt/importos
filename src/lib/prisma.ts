import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Injeta pool_timeout=30 e connection_limit=7 no DATABASE_URL se não estiverem já presentes
function buildDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL
  if (!url) return url
  try {
    const u = new URL(url)
    if (!u.searchParams.has('pool_timeout'))    u.searchParams.set('pool_timeout', '30')
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '7')
    return u.toString()
  } catch {
    return url
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: process.env.DATABASE_URL
      ? { db: { url: buildDatabaseUrl() } }
      : undefined,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
