import { NextResponse } from 'next/server';
import { getMetadata } from '@/services/timetable';

export async function GET() {
  try {
    const metadata = await getMetadata();
    return NextResponse.json(metadata);
  } catch (error) {
    console.error("Failed to fetch metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration metadata." },
      { status: 500 }
    );
  }
}
