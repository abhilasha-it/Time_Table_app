import { NextResponse } from 'next/server';
import { runGeneration } from '@/services/generate';

export async function POST(request: Request) {
  try {
    let targetYearId: string | undefined;
    let targetSectionIds: string[] | undefined;
    try {
      const body = await request.json();
      targetYearId = body?.targetYearId;
      targetSectionIds = body?.targetSectionIds;
    } catch {
      // Payload might be empty, ignore and run full schedule
    }

    const result = await runGeneration(targetYearId, targetSectionIds);
    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
  } catch (error) {
    console.error("Scheduler run failed:", error);
    return NextResponse.json(
      { error: "Failed to run timetable scheduling engine." },
      { status: 500 }
    );
  }
}
