import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
  if (dbUrl.startsWith('postgres') || dbUrl.startsWith('mongodb') || dbUrl.startsWith('mysql')) {
    const { PrismaPg } = require('@prisma/adapter-pg');
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: dbUrl });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
  } else {
    const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
    const adapter = new PrismaBetterSqlite3({ url: dbUrl });
    return new PrismaClient({ adapter });
  }
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof prismaClientSingleton> | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
