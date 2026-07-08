import { NextRequest, NextResponse } from 'next/server';
import db from '@/models/db';
import { validateSwapOrMove } from '../swap/route';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, subjectId, facultyId, assistantFacultyId, roomId, timeSlotId } = body;

    if (!id || !subjectId || !facultyId || !roomId) {
      return NextResponse.json(
        { error: "Missing required fields: id, subjectId, facultyId, roomId" },
        { status: 400 }
      );
    }

    const entry = await db.timetableEntry.findUnique({ where: { id } });
    if (!entry) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    // Run constraint conflict checker in dry-run simulation mode
    const errorMsg = await validateSwapOrMove(entry.timetableId, [
      { id, subjectId, facultyId, assistantFacultyId: assistantFacultyId || null, roomId, timeSlotId }
    ]);

    const suggestions: any[] = [];
    if (errorMsg) {
      // Loop through all timeslots to find available conflict-free slots
      const timeslots = await db.timeSlot.findMany({
        orderBy: [{ day: 'asc' }, { slotIndex: 'asc' }]
      });

      for (const ts of timeslots) {
        // Skip current slot
        if (ts.id === (timeSlotId || entry.timeSlotId)) continue;
        
        const testError = await validateSwapOrMove(entry.timetableId, [
          { id, subjectId, facultyId, assistantFacultyId: assistantFacultyId || null, roomId, timeSlotId: ts.id }
        ]);

        if (testError === null) {
          suggestions.push({
            timeSlotId: ts.id,
            day: ts.day,
            slotIndex: ts.slotIndex,
            startTime: ts.startTime,
            endTime: ts.endTime
          });
        }
      }
    }

    return NextResponse.json({
      valid: errorMsg === null,
      error: errorMsg,
      suggestions
    });
  } catch (error: any) {
    console.error("Edit validation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to validate manual edit." },
      { status: 500 }
    );
  }
}
