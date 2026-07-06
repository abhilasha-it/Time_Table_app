const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const url = 'file:./dev.db';
const adapter = new PrismaBetterSqlite3({ url });
const db = new PrismaClient({ adapter });

async function main() {
  const subjects = await db.subject.findMany({
    include: { year: { include: { branch: true } } }
  });

  const branchMap = {};
  for (const s of subjects) {
    const code = s.year?.branch?.code || 'None';
    if (!branchMap[code]) branchMap[code] = 0;
    branchMap[code]++;
  }

  console.log("=== SUBJECT COUNT BY BRANCH ===");
  console.log(branchMap);
}

main().catch(console.error).finally(() => db.$disconnect());
