import { NextRequest, NextResponse } from 'next/server';
import db from '@/models/db';
import { validateSwapOrMove } from '../swap/route';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, subjectId, facultyId, roomId } = body;

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
      { id, subjectId, facultyId, roomId }
    ]);

    return NextResponse.json({
      valid: errorMsg === null,
      error: errorMsg
    });
  } catch (error: any) {
    console.error("Edit validation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to validate manual edit." },
      { status: 500 }
    );
  }
}
