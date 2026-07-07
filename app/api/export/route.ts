import { NextRequest, NextResponse } from 'next/server';
import { generateExcelBuffer, generatePdfBuffer } from '@/services/export';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'xlsx';
    const type = (searchParams.get('type') || 'section') as 'section' | 'all' | 'faculty';
    const branchId = searchParams.get('branchId') || undefined;
    const yearStr = searchParams.get('year');
    const section = searchParams.get('section') || undefined;
    const facultyId = searchParams.get('facultyId') || undefined;

    const year = yearStr ? Number(yearStr) : undefined;

    if (format === 'xlsx') {
      const buffer = await generateExcelBuffer(type, branchId, year, section, facultyId);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="timetable_${type}_export.xlsx"`,
        },
      });
    } else if (format === 'pdf') {
      const buffer = await generatePdfBuffer(type, branchId, year, section, facultyId);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="timetable_${type}_export.pdf"`,
        },
      });
    } else {
      return NextResponse.json(
        { error: "Unsupported format. Only 'xlsx' and 'pdf' are supported." },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Failed to export timetable:", error);
    return NextResponse.json(
      { error: "Failed to export timetable file." },
      { status: 500 }
    );
  }
}
