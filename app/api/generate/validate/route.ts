import { NextResponse } from 'next/server';
import db from '@/models/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetYearId = searchParams.get('targetYearId') || undefined;

    // 1. Fetch metadata needed for calculations
    const sections = await db.section.findMany({
      include: {
        year: { include: { branch: true } },
        labBatches: true
      }
    });

    const subjects = await db.subject.findMany({
      include: { year: { include: { branch: true } } }
    });

    const rooms = await db.room.findMany();
    const timeSlots = await db.timeSlot.findMany();
    const fixedAllocations = await db.fixedAllocation.findMany();

    const classrooms = rooms.filter((r: any) => r.type === 'CLASSROOM');
    const labs = rooms.filter((r: any) => r.type === 'LAB');
    const totalSlots = timeSlots.length; // e.g. 42

    // Get active timetable
    const activeTimetable = await db.generatedTimetable.findFirst({
      where: { isActive: true }
    });

    // 2. Compute room hours supply (accounting for slot-by-slot allocations of other years)
    let availableClassroomHours = classrooms.length * totalSlots;
    let availableLabHours = labs.length * totalSlots;

    let otherYearClassroomHours = 0;
    let otherYearLabHours = 0;

    // Map other years' scheduled entries as locked room-hours
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

      // Deduct these room hours directly from supply
      const classEntries = otherYearEntries.filter((e: any) => e.room.type === 'CLASSROOM');
      const labEntries = otherYearEntries.filter((e: any) => e.room.type === 'LAB');
      
      otherYearClassroomHours = classEntries.length;
      otherYearLabHours = labEntries.length;

      availableClassroomHours = Math.max(0, availableClassroomHours - otherYearClassroomHours);
      availableLabHours = Math.max(0, availableLabHours - otherYearLabHours);
    }

    // Deduct FixedAllocations (training slots)
    const fixedClassroomHours = fixedAllocations.filter(fa => {
      const room = rooms.find((r: any) => r.id === fa.roomId);
      // For yearly check, only count if it belongs to target year or other years
      return room && room.type === 'CLASSROOM';
    }).length;

    const fixedLabHours = fixedAllocations.filter(fa => {
      const room = rooms.find((r: any) => r.id === fa.roomId);
      return room && room.type === 'LAB';
    }).length;

    availableClassroomHours = Math.max(0, availableClassroomHours - fixedClassroomHours);
    availableLabHours = Math.max(0, availableLabHours - fixedLabHours);

    // 3. Compute demand (only for sections of targetYearId if specified)
    const targetSections = targetYearId 
      ? sections.filter((s: any) => s.yearId === targetYearId)
      : sections;

    let requiredClassroomHours = 0;
    let requiredLabHours = 0;
    const maxLabRoomCap = labs.length > 0 ? Math.max(...labs.map((r: any) => r.capacity)) : 35;

    for (const section of targetSections) {
      const academicSubjects = subjects.filter(
        (s: any) => s.yearId === section.yearId && s.type === 'ACADEMIC'
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

    const isClassroomFeasible = requiredClassroomHours <= availableClassroomHours;
    const isLabFeasible = requiredLabHours <= availableLabHours;
    const isFeasible = isClassroomFeasible && isLabFeasible;

    // 4. Warnings and Suggestions
    const warnings: string[] = [];
    const suggestions: { title: string; desc: string; tab: string }[] = [];

    const labelPrefix = targetYearId ? "Selected Year sections" : "All active sections";

    if (!isClassroomFeasible) {
      const excess = requiredClassroomHours - availableClassroomHours;
      warnings.push(
        `${labelPrefix} demand ${requiredClassroomHours} lecture-hours/week, but only ${availableClassroomHours} classroom-hours are available. Deficit of ${excess} hours.`
      );
      suggestions.push({
        title: "Extend Working Hours",
        desc: "Add more Period indexes or Saturday timeslots in the Admin panel to increase available timeslots.",
        tab: "timeslots"
      });
      suggestions.push({
        title: "Add Classrooms",
        desc: "Add new lecture rooms in the Rooms tab to expand available room hours.",
        tab: "rooms"
      });
    }

    if (!isLabFeasible) {
      const excess = requiredLabHours - availableLabHours;
      warnings.push(
        `Selected timetable sections demand ${requiredLabHours} lab-hours/week (with batch splits), but only ${availableLabHours} lab-room hours are available. Deficit of ${excess} hours.`
      );
      suggestions.push({
        title: "Add Lab Infrastructure",
        desc: "Add new LAB rooms in the Rooms tab to expand lab capacity.",
        tab: "rooms"
      });
    }

    return NextResponse.json({
      isFeasible,
      classroom: {
        required: requiredClassroomHours,
        available: availableClassroomHours,
        roomsCount: classrooms.length,
        isFeasible: isClassroomFeasible,
        otherYearDeductions: otherYearClassroomHours
      },
      lab: {
        required: requiredLabHours,
        available: availableLabHours,
        roomsCount: labs.length,
        isFeasible: isLabFeasible,
        otherYearDeductions: otherYearLabHours
      },
      totalSlots,
      sectionsCount: targetSections.length,
      warnings,
      suggestions
    });

  } catch (error) {
    console.error("Resource validation check failed:", error);
    return NextResponse.json(
      { error: "Failed to compile pre-flight resource capacity analysis." },
      { status: 500 }
    );
  }
}
