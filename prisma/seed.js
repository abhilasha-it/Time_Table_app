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
  const timeslotsCount = await prisma.timeSlot.count();
  if (timeslotsCount > 0) {
    console.log("Database already seeded. Skipping seed execution to prevent data loss.");
    return;
  }
  console.log("Seeding redesigned timetable database...");

  // 1. Clear existing data in reverse dependency order
  await prisma.timetableEntry.deleteMany();
  await prisma.generatedTimetable.deleteMany();
  await prisma.fixedAllocation.deleteMany();
  await prisma.labBatch.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.section.deleteMany();
  await prisma.year.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.faculty.deleteMany();
  await prisma.room.deleteMany();
  await prisma.timeSlot.deleteMany();

  console.log("Database cleared.");

  // 2. Create TimeSlots (Mon-Sat, 9 periods a day)
  const times = [
    { start: "08:50", end: "09:40", idx: 0 },
    { start: "09:40", end: "10:30", idx: 1 },
    { start: "10:40", end: "11:30", idx: 2 },
    { start: "11:30", end: "12:20", idx: 3 },
    { start: "12:20", end: "13:10", idx: 4 },
    { start: "13:10", end: "14:00", idx: 5 },
    { start: "14:00", end: "14:50", idx: 6 },
    { start: "14:50", end: "15:40", idx: 7 },
    { start: "15:40", end: "16:30", idx: 8 },
  ];

  const timeSlots = [];
  for (let day = 0; day < 5; day++) {
    for (const t of times) {
      const slot = await prisma.timeSlot.create({
        data: {
          day,
          startTime: t.start,
          endTime: t.end,
          slotIndex: t.idx
        }
      });
      timeSlots.push(slot);
    }
  }
  console.log(`Created ${timeSlots.length} timeslots (excluding lunch).`);

  console.log("Database seeded with static weekly timeslots grid.");
}

main()
  .catch(e => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
