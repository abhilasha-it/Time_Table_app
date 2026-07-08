import { NextRequest, NextResponse } from 'next/server';
import db from '@/models/db';

// Map URL segments to Prisma client model delegates
const modelMap: { [key: string]: string } = {
  'branches': 'branch',
  'years': 'year',
  'sections': 'section',
  'subjects': 'subject',
  'faculty': 'faculty',
  'rooms': 'room',
  'timeslots': 'timeSlot',
  'fixed-allocations': 'fixedAllocation',
  'batches': 'labBatch',
  'auditlogs': 'auditLog',
  'faculty-assignments': 'facultyAssignment',
};

// Map URL segments to their automatic relationship includes
const includeMap: { [key: string]: any } = {
  'years': { branch: true },
  'sections': { year: { include: { branch: true } }, labBatches: true },
  'subjects': { year: { include: { branch: true } } },
  'rooms': { sharedSections: true },
  'fixed-allocations': { subject: true, faculty: true, section: true, timeSlot: true, room: true },
  'batches': { section: true },
  'faculty-assignments': { subject: true, section: true, faculty: true, assistantFaculty: true },
};

function getModelDelegate(entity: string) {
  const modelName = modelMap[entity];
  if (!modelName) return null;
  return (db as any)[modelName];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  try {
    const { entity } = await params;
    const model = getModelDelegate(entity);
    if (!model) {
      return NextResponse.json({ error: `Entity '${entity}' not found.` }, { status: 404 });
    }

    const includes = includeMap[entity];
    const items = await model.findMany({
      ...(includes ? { include: includes } : {}),
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("Admin GET Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retrieve items." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  try {
    const { entity } = await params;
    const model = getModelDelegate(entity);
    if (!model) {
      return NextResponse.json({ error: `Entity '${entity}' not found.` }, { status: 404 });
    }

    const body = await request.json();

    if (entity === 'branches') {
      const createdBranch = await db.branch.create({
        data: body,
      });

      for (let yr = 1; yr <= 4; yr++) {
        await db.year.create({
          data: {
            yearNumber: yr,
            branchId: createdBranch.id,
          },
        });
      }

      await db.auditLog.create({
        data: {
          action: "CREATE",
          details: `Created Branch: ${createdBranch.code} (${createdBranch.name}) and initialized Years 1-4.`
        }
      });

      return NextResponse.json(createdBranch);
    }

    if (entity === 'sections') {
      const { sectionName, strength, yearId, lunchSlotIndex } = body;
      const year = await db.year.findUnique({
        where: { id: yearId },
        include: { branch: true }
      });
      const name = `${year?.yearNumber} Yr ${year?.branch?.code} - ${sectionName}`;

      const createdSection = await db.section.create({
        data: {
          sectionName,
          strength: Number(strength),
          yearId,
          name,
          lunchSlotIndex: lunchSlotIndex !== undefined ? Number(lunchSlotIndex) : 4
        },
      });

      const numBatches = Math.ceil(Number(strength) / 35);
      let remaining = Number(strength);
      for (let idx = 0; idx < numBatches; idx++) {
        const size = Math.ceil(remaining / (numBatches - idx));
        await db.labBatch.create({
          data: {
            name: `Batch ${idx + 1}`,
            strength: size,
            sectionId: createdSection.id,
          },
        });
        remaining -= size;
      }

      await db.auditLog.create({
        data: {
          action: "CREATE",
          details: `Created Section: ${name} (strength: ${strength}) and initialized ${numBatches} lab batches.`
        }
      });

      return NextResponse.json(createdSection);
    }

    // Specific validation for fixed-allocations
    if (entity === 'fixed-allocations') {
      const consecutive = Number(body.consecutiveLectures || 1);
      
      // 1. Fetch selected start timeslot
      const startSlot = await db.timeSlot.findUnique({
        where: { id: body.timeSlotId }
      });
      if (!startSlot) {
        return NextResponse.json({ error: "Invalid start timeslot." }, { status: 400 });
      }

      // 2. Fetch all timeslots on the same day spanning the consecutive range
      const slotsToAllocate = await db.timeSlot.findMany({
        where: {
          day: startSlot.day,
          slotIndex: {
            gte: startSlot.slotIndex,
            lt: startSlot.slotIndex + consecutive
          }
        },
        orderBy: { slotIndex: 'asc' }
      });

      if (slotsToAllocate.length < consecutive) {
        return NextResponse.json({ error: `Not enough periods left in the day to schedule ${consecutive} consecutive slots.` }, { status: 400 });
      }

      const slotIds = slotsToAllocate.map((s: any) => s.id);

      const subject = await db.subject.findUnique({
        where: { id: body.subjectId }
      });
      if (!subject || subject.type !== 'TRAINING') {
        return NextResponse.json(
          { error: "Only subjects of type 'TRAINING' can be added to Fixed Allocations." },
          { status: 400 }
        );
      }

      // 3. Check conflicts in the active generated timetable across ALL consecutive slots
      const activeTimetable = await db.generatedTimetable.findFirst({
        where: { isActive: true }
      });

      let conflicts: any[] = [];
      if (activeTimetable) {
        conflicts = await db.timetableEntry.findMany({
          where: {
            timetableId: activeTimetable.id,
            timeSlotId: { in: slotIds },
            OR: [
              { roomId: body.roomId },
              { facultyId: body.facultyId },
              { sectionId: body.sectionId },
              { labBatch: { sectionId: body.sectionId } }
            ]
          },
          include: {
            section: { include: { year: { include: { branch: true } } } },
            labBatch: { include: { section: { include: { year: { include: { branch: true } } } } } },
            subject: true,
            room: true,
            faculty: true
          }
        });
      }

      if (conflicts.length > 0 && !body.force) {
        return NextResponse.json(
          { 
            conflict: true, 
            message: "This training fixed-allocation conflicts with existing timetable entries.",
            conflicts: conflicts.map(c => ({
              id: c.id,
              sectionName: c.section?.name || c.labBatch?.section?.name || "Unknown Section",
              subjectName: `${c.subject.name} (${c.subject.code})`,
              roomName: c.room.name,
              facultyName: c.faculty.name
            }))
          },
          { status: 409 } // Conflict
        );
      }

      // 4. Force check: delete conflicting entries
      if (conflicts.length > 0 && body.force) {
        const conflictIds = conflicts.map(c => c.id);
        await db.timetableEntry.deleteMany({
          where: { id: { in: conflictIds } }
        });

        await db.auditLog.create({
          data: {
            action: "OVERWRITE",
            details: `Forced creation of Fixed Allocation for ${subject.code}. Removed ${conflicts.length} conflicting timetable entries.`
          }
        });
      }

      // 5. Create Fixed Allocation records for each timeslot
      const createdAllocations: any[] = [];
      for (const slot of slotsToAllocate) {
        // Delete existing FixedAllocation for this section/faculty/room at this slot to avoid unique constraint violations
        await db.fixedAllocation.deleteMany({
          where: {
            timeSlotId: slot.id,
            OR: [
              { sectionId: body.sectionId },
              { facultyId: body.facultyId },
              { roomId: body.roomId }
            ]
          }
        });

        const allocation = await db.fixedAllocation.create({
          data: {
            subjectId: body.subjectId,
            facultyId: body.facultyId,
            sectionId: body.sectionId,
            timeSlotId: slot.id,
            roomId: body.roomId,
            isLocked: body.isLocked ?? true
          }
        });
        createdAllocations.push(allocation);
      }

      // Create Audit Log
      const faculty = await db.faculty.findUnique({ where: { id: body.facultyId } });
      const room = await db.room.findUnique({ where: { id: body.roomId } });
      const section = await db.section.findUnique({ where: { id: body.sectionId } });
      
      await db.auditLog.create({
        data: {
          action: "CREATE",
          details: `Added ${consecutive} consecutive Fixed Allocations for Subject ${subject?.code}, Faculty ${faculty?.name}, Section ${section?.name}, Room ${room?.name} starting at Day ${startSlot.day}, Period ${startSlot.slotIndex + 1}.`
        }
      });

      return NextResponse.json(createdAllocations[0]);
    } else {
      if (entity === 'rooms') {
        const { name, type, capacity, sectionIds } = body;
        const createdRoom = await db.room.create({
          data: {
            name,
            type,
            capacity,
            sharedSections: sectionIds && sectionIds.length > 0 ? {
              connect: sectionIds.map((id: string) => ({ id }))
            } : undefined
          },
          include: { sharedSections: true }
        });
        await db.auditLog.create({
          data: {
            action: "CREATE",
            details: `Created Room: ${createdRoom.name} (${createdRoom.type}, Cap: ${createdRoom.capacity}) shared with ${sectionIds ? sectionIds.length : 0} sections.`
          }
        });
        return NextResponse.json(createdRoom);
      }

      if (entity === 'faculty-assignments') {
        const { subjectId, sectionId, facultyId, assistantFacultyId } = body;
        const created = await db.facultyAssignment.create({
          data: {
            subjectId,
            sectionId,
            facultyId,
            assistantFacultyId: assistantFacultyId || null
          },
          include: { subject: true, section: true, faculty: true, assistantFaculty: true }
        });
        await db.auditLog.create({
          data: {
            action: "CREATE",
            details: `Created Faculty Assignment: Section ${created.section.sectionName}, Subject ${created.subject.code}, Teacher ${created.faculty.name}.`
          }
        });
        return NextResponse.json(created);
      }

      // General audit log for other entity creation
      await db.auditLog.create({
        data: {
          action: "CREATE",
          details: `Created new item in ${entity}.`
        }
      });
    }

    const includes = includeMap[entity];
    const created = await model.create({
      data: body,
      ...(includes ? { include: includes } : {}),
    });

    return NextResponse.json(created);
  } catch (error: any) {
    console.error("Admin POST Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create item." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  try {
    const { entity } = await params;
    const model = getModelDelegate(entity);
    if (!model) {
      return NextResponse.json({ error: `Entity '${entity}' not found.` }, { status: 404 });
    }

    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing ID for update." }, { status: 400 });
    }

    // Specific validation for sections (update dynamic display name)
    if (entity === 'sections') {
      const year = await db.year.findUnique({
        where: { id: data.yearId },
        include: { branch: true }
      });
      data.name = `${year?.yearNumber} Yr ${year?.branch?.code} - ${data.sectionName}`;
    }

    // Specific validation for fixed-allocations
    if (entity === 'fixed-allocations' && data.subjectId) {
      const subject = await db.subject.findUnique({
        where: { id: data.subjectId }
      });
      if (!subject || subject.type !== 'TRAINING') {
        return NextResponse.json(
          { error: "Only subjects of type 'TRAINING' can be added to Fixed Allocations." },
          { status: 400 }
        );
      }
    }

    if (entity === 'rooms') {
      const { name, type, capacity, sectionIds } = data;
      const updatedRoom = await db.room.update({
        where: { id },
        data: {
          name,
          type,
          capacity,
          sharedSections: {
            set: sectionIds ? sectionIds.map((sid: string) => ({ id: sid })) : []
          }
        },
        include: { sharedSections: true }
      });
      await db.auditLog.create({
        data: {
          action: "UPDATE",
          details: `Updated Room: ${updatedRoom.name} shared with ${sectionIds ? sectionIds.length : 0} sections.`
        }
      });
      return NextResponse.json(updatedRoom);
    }

    if (entity === 'faculty-assignments') {
      const { subjectId, sectionId, facultyId, assistantFacultyId } = data;
      const updated = await db.facultyAssignment.update({
        where: { id },
        data: {
          subjectId,
          sectionId,
          facultyId,
          assistantFacultyId: assistantFacultyId || null
        },
        include: { subject: true, section: true, faculty: true, assistantFaculty: true }
      });
      await db.auditLog.create({
        data: {
          action: "UPDATE",
          details: `Updated Faculty Assignment: Section ${updated.section.sectionName}, Subject ${updated.subject.code}, Teacher ${updated.faculty.name}.`
        }
      });
      return NextResponse.json(updated);
    }

    const includes = includeMap[entity];
    const updated = await model.update({
      where: { id },
      data,
      ...(includes ? { include: includes } : {}),
    });

    // Create Audit Log
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        details: `Updated item in ${entity} (ID: ${id}).`
      }
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Admin PUT Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update item." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  try {
    const { entity } = await params;
    const model = getModelDelegate(entity);
    if (!model) {
      return NextResponse.json({ error: `Entity '${entity}' not found.` }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "Missing query parameter 'id'." }, { status: 400 });
    }

    await model.delete({
      where: { id }
    });

    // Create Audit Log
    await db.auditLog.create({
      data: {
        action: "DELETE",
        details: `Deleted item from ${entity} (ID: ${id}).`
      }
    });

    return NextResponse.json({ success: true, message: "Item deleted successfully." });
  } catch (error: any) {
    console.error("Admin DELETE Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete item." },
      { status: 500 }
    );
  }
}
