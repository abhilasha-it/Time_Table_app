import { NextResponse } from 'next/server';
import db from '@/models/db';

export async function PUT(request: Request) {
  try {
    const { action, idA, idB, timeSlotId, roomId } = await request.json();

    if (action === 'swap') {
      if (!idA || !idB) {
        return NextResponse.json({ error: "Specify idA and idB to swap." }, { status: 400 });
      }

      // Fetch entries
      const entryA = await db.timetableEntry.findUnique({
        where: { id: idA },
        include: { section: true, labBatch: true, subject: true }
      });
      const entryB = await db.timetableEntry.findUnique({
        where: { id: idB },
        include: { section: true, labBatch: true, subject: true }
      });

      if (!entryA || !entryB) {
        return NextResponse.json({ error: "One or both timetable entries not found." }, { status: 404 });
      }

      if (entryA.timetableId !== entryB.timetableId) {
        return NextResponse.json({ error: "Entries must belong to the same timetable." }, { status: 400 });
      }

      // Perform validation check on temporary swap state
      const err = await validateSwapOrMove(
        entryA.timetableId,
        [
          { id: idA, timeSlotId: entryB.timeSlotId, roomId: entryB.roomId },
          { id: idB, timeSlotId: entryA.timeSlotId, roomId: entryA.roomId }
        ]
      );

      if (err) {
        return NextResponse.json({ error: err }, { status: 400 });
      }

      // Save swapped values
      await db.$transaction([
        db.timetableEntry.update({
          where: { id: idA },
          data: { timeSlotId: entryB.timeSlotId, roomId: entryB.roomId }
        }),
        db.timetableEntry.update({
          where: { id: idB },
          data: { timeSlotId: entryA.timeSlotId, roomId: entryA.roomId }
        })
      ]);

      // Create Audit Log
      await db.auditLog.create({
        data: {
          action: "SWAP",
          details: `Swapped slot A (${entryA.subject.code}) with slot B (${entryB.subject.code}).`
        }
      });

      return NextResponse.json({ success: true, message: "Entries swapped successfully." });
    } 
    
    else if (action === 'move') {
      if (!idA || !timeSlotId || !roomId) {
        return NextResponse.json({ error: "Specify idA, timeSlotId, and roomId to move." }, { status: 400 });
      }

      const entryA = await db.timetableEntry.findUnique({
        where: { id: idA }
      });

      if (!entryA) {
        return NextResponse.json({ error: "Timetable entry not found." }, { status: 404 });
      }

      // Perform validation check on temporary move state
      const err = await validateSwapOrMove(
        entryA.timetableId,
        [
          { id: idA, timeSlotId, roomId }
        ]
      );

      if (err) {
        return NextResponse.json({ error: err }, { status: 400 });
      }

      // Save moved values
      await db.timetableEntry.update({
        where: { id: idA },
        data: { timeSlotId, roomId }
      });

      // Create Audit Log
      const targetTimeSlot = await db.timeSlot.findUnique({ where: { id: timeSlotId } });
      const targetRoom = await db.room.findUnique({ where: { id: roomId } });
      const entryWithSubject = await db.timetableEntry.findUnique({
        where: { id: idA },
        include: { subject: true }
      });
      await db.auditLog.create({
        data: {
          action: "MOVE",
          details: `Moved slot ${entryWithSubject?.subject.code} to Day ${targetTimeSlot?.day}, Period ${targetTimeSlot?.slotIndex ? targetTimeSlot.slotIndex + 1 : 1} in Room ${targetRoom?.name}.`
        }
      });

      return NextResponse.json({ success: true, message: "Entry moved successfully." });
    }

    return NextResponse.json({ error: "Invalid action. Must be 'swap' or 'move'." }, { status: 400 });

  } catch (error: any) {
    console.error("Swapping error:", error);
    return NextResponse.json({ error: error.message || "Failed to swap/move timetable entries." }, { status: 500 });
  }
}

/**
 * Simulates a swap or move to check for hard constraint violations.
 * Returns null if valid, or a string describing the error if invalid.
 */
export async function validateSwapOrMove(
  timetableId: string,
  modifications: { 
    id: string; 
    timeSlotId?: string; 
    roomId?: string; 
    facultyId?: string; 
    assistantFacultyId?: string | null; 
    subjectId?: string; 
  }[]
): Promise<string | null> {
  // Load all entries in this timetable run
  const allEntries = await db.timetableEntry.findMany({
    where: { timetableId },
    include: {
      timeSlot: true,
      section: { include: { year: { include: { branch: true } } } },
      labBatch: { include: { section: { include: { year: { include: { branch: true } } } } } },
      faculty: true,
      assistantFaculty: true,
      room: true,
      subject: true
    }
  });

  // Load target timeslots, rooms, faculties, subjects for checking properties
  const targetTimeSlots = await db.timeSlot.findMany();
  const targetRooms = await db.room.findMany();
  const targetFaculties = await db.faculty.findMany();
  const targetSubjects = await db.subject.findMany();

  // Apply modifications in memory
  const simulated = allEntries.map(entry => {
    const mod = modifications.find(m => m.id === entry.id);
    if (mod) {
      const ts = mod.timeSlotId ? targetTimeSlots.find(t => t.id === mod.timeSlotId)! : entry.timeSlot;
      const rm = mod.roomId ? targetRooms.find(r => r.id === mod.roomId)! : entry.room;
      const fac = mod.facultyId ? targetFaculties.find(f => f.id === mod.facultyId)! : entry.faculty;
      const sub = mod.subjectId ? targetSubjects.find(s => s.id === mod.subjectId)! : entry.subject;
      const asstFac = mod.assistantFacultyId !== undefined
        ? (mod.assistantFacultyId ? targetFaculties.find(f => f.id === mod.assistantFacultyId)! : null)
        : entry.assistantFaculty;
      
      return {
        ...entry,
        timeSlotId: mod.timeSlotId || entry.timeSlotId,
        timeSlot: ts,
        roomId: mod.roomId || entry.roomId,
        room: rm,
        facultyId: mod.facultyId || entry.facultyId,
        faculty: fac,
        assistantFacultyId: mod.assistantFacultyId !== undefined ? mod.assistantFacultyId : entry.assistantFacultyId,
        assistantFaculty: asstFac,
        subjectId: mod.subjectId || entry.subjectId,
        subject: sub
      };
    }
    return entry;
  });

  // Verify constraints
  for (let i = 0; i < simulated.length; i++) {
    const a = simulated[i];
    const aSecId = a.sectionId || a.labBatch?.sectionId;
    const aYearId = a.section?.yearId || a.labBatch?.section?.yearId;
    const aStrength = a.section?.strength || a.labBatch?.strength || 0;

    // Room Capacity check
    if (a.room.capacity < aStrength) {
      return `Room '${a.room.name}' has capacity ${a.room.capacity}, but subject '${a.subject.code}' requires capacity >= ${aStrength} for its students.`;
    }

    // Room Type check
    const isLabVar = (a.subject.weeklyLabHours || 0) > 0 || a.labBatchId !== null;
    if (isLabVar && a.room.type !== 'LAB') {
      return `Subject '${a.subject.code}' requires a LAB type room, but '${a.room.name}' is a ${a.room.type}.`;
    }
    if (!isLabVar && a.room.type !== 'CLASSROOM') {
      return `Subject '${a.subject.code}' requires a CLASSROOM type room, but '${a.room.name}' is a ${a.room.type}.`;
    }

    // Cross-comparison check
    for (let j = i + 1; j < simulated.length; j++) {
      const b = simulated[j];
      const bSecId = b.sectionId || b.labBatch?.sectionId;

      const sameSlot = a.timeSlotId === b.timeSlotId;
      if (sameSlot) {
        // 1. Room Double-Booking
        if (a.roomId === b.roomId) {
          return `Room double-booking detected: Room '${a.room.name}' is scheduled for both '${a.subject.code}' and '${b.subject.code}' at Day ${a.timeSlot.day}, Slot ${a.timeSlot.slotIndex + 1}.`;
        }

        // 2. Faculty Double-Booking
        const facA1 = a.facultyId;
        const facA2 = a.assistantFacultyId;
        const facB1 = b.facultyId;
        const facB2 = b.assistantFacultyId;

        const clashedFaculty = 
          facA1 === facB1 ? a.faculty : 
          (facA2 && facA2 === facB1 ? a.assistantFaculty : 
          (facB2 && facA1 === facB2 ? b.assistantFaculty : 
          (facA2 && facB2 && facA2 === facB2 ? a.assistantFaculty : null)));
        
        if (clashedFaculty) {
          return `Faculty double-booking detected: '${clashedFaculty.name}' is scheduled for both '${a.subject.code}' and '${b.subject.code}' at Day ${a.timeSlot.day}, Slot ${a.timeSlot.slotIndex + 1}.`;
        }

        // 3. Section Overlap (except for parallel lab batches in different rooms)
        if (aSecId === bSecId) {
          const bothLabs = a.labBatchId !== null && b.labBatchId !== null;
          const sameBatch = a.labBatchId === b.labBatchId;
          
          if (!bothLabs || sameBatch) {
            const secName = a.section?.sectionName || a.labBatch?.section?.sectionName || "";
            const yrNum = a.section?.year?.yearNumber || a.labBatch?.section?.year?.yearNumber || "";
            return `Section conflict: Section ${yrNum} Yr Sec ${secName} is scheduled for both '${a.subject.code}' and '${b.subject.code}' at Day ${a.timeSlot.day}, Slot ${a.timeSlot.slotIndex + 1}.`;
          }
        }
      }
    }
  }

  return null;
}
