import { NextRequest, NextResponse } from 'next/server';
import { getTimetable, updateSlot, deleteSlot } from '@/api/timetable';
import db from '@/models/db';
import { validateSwapOrMove } from './swap/route';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId') || undefined;
    const yearStr = searchParams.get('year');
    const section = searchParams.get('section') || undefined;

    const year = yearStr ? Number(yearStr) : undefined;

    const slots = await getTimetable({ branchId, year, section });
    return NextResponse.json(slots);
  } catch (error) {
    console.error("Failed to fetch timetable:", error);
    return NextResponse.json(
      { error: "Failed to fetch timetable slots." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, facultyId, assistantFacultyId, roomId, subjectId } = body;

    if (!id || !facultyId || !roomId || !subjectId) {
       return NextResponse.json(
         { error: "Missing required fields: id, facultyId, roomId, subjectId" },
         { status: 400 }
       );
     }

     // Fetch existing entry to check timetableId
     const entry = await db.timetableEntry.findUnique({ where: { id } });
     if (!entry) {
       return NextResponse.json({ error: "Timetable slot not found." }, { status: 404 });
     }

     // Run constraint conflict checker in real-time
     const conflictError = await validateSwapOrMove(entry.timetableId, [
       { id, facultyId, assistantFacultyId: assistantFacultyId || null, roomId, subjectId }
     ]);

     if (conflictError) {
       return NextResponse.json({ error: conflictError }, { status: 400 });
     }

     const updated = await updateSlot(id, { facultyId, assistantFacultyId: assistantFacultyId || null, roomId, subjectId });

    // Create Audit Log
    const secName = updated.section?.name || updated.labBatch?.section?.name || "Unknown Section";
    await db.auditLog.create({
      data: {
        action: "EDIT",
        details: `Edited slot: Section ${secName}, Subject changed to ${updated.subject.code}, Faculty to ${updated.faculty.name}, Room to ${updated.room.name}.`
      }
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update timetable slot:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update timetable slot." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    // Fetch entry details for audit log
    const entry = await db.timetableEntry.findUnique({
      where: { id },
      include: {
        section: true,
        labBatch: { include: { section: true } },
        subject: true,
        timeSlot: true
      }
    });

    if (!entry) {
      return NextResponse.json({ error: "Timetable slot not found." }, { status: 404 });
    }

    await deleteSlot(id);

    // Create Audit Log
    const secName = entry.section?.name || entry.labBatch?.section?.name || "Unknown Section";
    await db.auditLog.create({
      data: {
        action: "DELETE",
        details: `Cleared slot: Section ${secName}, Subject ${entry.subject.code} at Day ${entry.timeSlot.day}, Period ${entry.timeSlot.slotIndex + 1}.`
      }
    });

    return NextResponse.json({ success: true, message: "Slot deleted successfully." });
  } catch (error: any) {
    console.error("Failed to delete timetable slot:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete timetable slot." },
      { status: 500 }
    );
  }
}
