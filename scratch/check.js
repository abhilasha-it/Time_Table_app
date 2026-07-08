const { PrismaClient } = require('@prisma/client');

let prisma;
const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
if (dbUrl.startsWith('postgres') || dbUrl.startsWith('mongodb') || dbUrl.startsWith('mysql')) {
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: dbUrl });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
} else {
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  prisma = new PrismaClient({ adapter });
}

async function main() {
  const sections = await prisma.section.findMany({
    include: { year: { include: { branch: true } } }
  });
  console.log("Sections in DB:");
  for (const s of sections) {
    console.log(`  - Section ID: ${s.id} | Name: ${s.name} | lunchSlotIndex: ${s.lunchSlotIndex}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
