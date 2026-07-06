const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const url = 'file:./dev.db';
const adapter = new PrismaBetterSqlite3({ url });
const db = new PrismaClient({ adapter });

async function main() {
  const years = await db.year.findMany({ include: { branch: true } });
  const sections = await db.section.findMany({
    include: { year: { include: { branch: true } }, labBatches: true }
  });
  const subjects = await db.subject.findMany({
    include: { year: { include: { branch: true } } }
  });
  const rooms = await db.room.findMany();
  const timeSlots = await db.timeSlot.findMany();
  const fixedAllocations = await db.fixedAllocation.findMany();

  const classrooms = rooms.filter(r => r.type === 'CLASSROOM');
  const labs = rooms.filter(r => r.type === 'LAB');
  const totalSlots = timeSlots.length;

  console.log(`=== CONFIGURATION ===`);
  console.log(`Classrooms: ${classrooms.length}, Labs: ${labs.length}, Slots per room per week: ${totalSlots}`);
  console.log(`Total weekly classroom capacity: ${classrooms.length * totalSlots} hours`);
  console.log(`Total weekly lab capacity: ${labs.length * totalSlots} hours`);

  const activeTimetable = await db.generatedTimetable.findFirst({ where: { isActive: true } });
  console.log(`Active timetable exists: ${!!activeTimetable}`);

  for (const year of years) {
    const targetYearId = year.id;
    let availableClassroomHours = classrooms.length * totalSlots;
    let availableLabHours = labs.length * totalSlots;

    if (targetYearId && activeTimetable) {
      const otherYearEntries = await db.timetableEntry.findMany({
        where: {
          timetableId: activeTimetable.id,
          OR: [
            { section: { yearId: { not: targetYearId } } },
            { labBatch: { section: { yearId: { not: targetYearId } } } }
          ]
        },
        include: { room: true }
      });
      const classEntries = otherYearEntries.filter(e => e.room.type === 'CLASSROOM');
      const labEntries = otherYearEntries.filter(e => e.room.type === 'LAB');

      availableClassroomHours = Math.max(0, availableClassroomHours - classEntries.length);
      availableLabHours = Math.max(0, availableLabHours - labEntries.length);
    }

    const fixedClassroomHours = fixedAllocations.filter(fa => {
      const room = rooms.find(r => r.id === fa.roomId);
      return room && room.type === 'CLASSROOM';
    }).length;

    const fixedLabHours = fixedAllocations.filter(fa => {
      const room = rooms.find(r => r.id === fa.roomId);
      return room && room.type === 'LAB';
    }).length;

    availableClassroomHours = Math.max(0, availableClassroomHours - fixedClassroomHours);
    availableLabHours = Math.max(0, availableLabHours - fixedLabHours);

    // Compute demand
    const targetSections = sections.filter(s => s.yearId === targetYearId);
    let requiredClassroomHours = 0;
    let requiredLabHours = 0;
    const maxLabRoomCap = labs.length > 0 ? Math.max(...labs.map(r => r.capacity)) : 35;

    for (const section of targetSections) {
      const academicSubjects = subjects.filter(
        s => s.yearId === section.yearId && s.type === 'ACADEMIC'
      );

      for (const subject of academicSubjects) {
        requiredClassroomHours += subject.weeklyLectureHours;

        if (subject.weeklyLabHours && subject.weeklyLabHours > 0) {
          if (section.strength > maxLabRoomCap && section.labBatches.length > 0) {
            requiredLabHours += (section.labBatches.length * subject.weeklyLabHours);
          } else {
            requiredLabHours += subject.weeklyLabHours;
          }
        }
      }
    }

    const classroomDeficit = requiredClassroomHours - availableClassroomHours;
    const labDeficit = requiredLabHours - availableLabHours;
    const isFeasible = classroomDeficit <= 0 && labDeficit <= 0;

    console.log(`Year ${year.branch.code} Y${year.yearNumber}: ` +
                `Classroom (Req: ${requiredClassroomHours}, Avail: ${availableClassroomHours}, Deficit: ${classroomDeficit}), ` +
                `Lab (Req: ${requiredLabHours}, Avail: ${availableLabHours}, Deficit: ${labDeficit}) -> ${isFeasible ? 'FEASIBLE' : 'INFEASIBLE'}`);
  }
}

main().catch(console.error).finally(() => db.$disconnect());
