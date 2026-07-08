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
  // Find Section A to copy branch/year details
  const sectionA = await prisma.section.findFirst({
    where: { sectionName: 'A' },
    include: { year: true }
  });

  if (!sectionA) {
    console.error("Section A not found. Please run npm run build/seed first.");
    return;
  }

  console.log(`Found Section A: ${sectionA.name} (Year ID: ${sectionA.yearId})`);

  // Create Section B
  let sectionB = await prisma.section.findFirst({
    where: { sectionName: 'B', yearId: sectionA.yearId }
  });
  if (!sectionB) {
    sectionB = await prisma.section.create({
      data: {
        sectionName: 'B',
        name: `3rd Yr CSE - B`,
        strength: 80,
        yearId: sectionA.yearId,
        lunchSlotIndex: 4
      }
    });
    console.log(`Created Section B: ${sectionB.name}`);
    await prisma.labBatch.create({ data: { name: "Batch 1", strength: 40, sectionId: sectionB.id } });
    await prisma.labBatch.create({ data: { name: "Batch 2", strength: 40, sectionId: sectionB.id } });
  } else {
    console.log(`Section B already exists.`);
  }

  // Create Section C
  let sectionC = await prisma.section.findFirst({
    where: { sectionName: 'C', yearId: sectionA.yearId }
  });
  if (!sectionC) {
    sectionC = await prisma.section.create({
      data: {
        sectionName: 'C',
        name: `3rd Yr CSE - C`,
        strength: 80,
        yearId: sectionA.yearId,
        lunchSlotIndex: 4
      }
    });
    console.log(`Created Section C: ${sectionC.name}`);
    await prisma.labBatch.create({ data: { name: "Batch 1", strength: 40, sectionId: sectionC.id } });
    await prisma.labBatch.create({ data: { name: "Batch 2", strength: 40, sectionId: sectionC.id } });
  } else {
    console.log(`Section C already exists.`);
  }

  // Auto-create faculty assignments for B and C using Section A's assigned teachers
  const assignmentsA = await prisma.facultyAssignment.findMany({
    where: { sectionId: sectionA.id }
  });

  console.log(`Copying ${assignmentsA.length} faculty workload assignments to B and C...`);
  for (const asst of assignmentsA) {
    // Upsert B
    const existB = await prisma.facultyAssignment.findUnique({
      where: { subjectId_sectionId: { subjectId: asst.subjectId, sectionId: sectionB.id } }
    });
    if (!existB) {
      await prisma.facultyAssignment.create({
        data: {
          subjectId: asst.subjectId,
          sectionId: sectionB.id,
          facultyId: asst.facultyId,
          assistantFacultyId: asst.assistantFacultyId
        }
      });
    }

    // Upsert C
    const existC = await prisma.facultyAssignment.findUnique({
      where: { subjectId_sectionId: { subjectId: asst.subjectId, sectionId: sectionC.id } }
    });
    if (!existC) {
      await prisma.facultyAssignment.create({
        data: {
          subjectId: asst.subjectId,
          sectionId: sectionC.id,
          facultyId: asst.facultyId,
          assistantFacultyId: asst.assistantFacultyId
        }
      });
    }
  }

  console.log("Section B and Section C created with complete faculty assignments.");

  // Run generation locally via import
  const { generateTimetable } = require('../scheduler');
  console.log("\nRunning timetable generation solver...");
  const result = await generateTimetable();
  console.log("Result:", result);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
