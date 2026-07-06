import { NextResponse } from 'next/server';
import db from '@/models/db';

export async function POST(request: Request) {
  try {
    const { entity, records } = await request.json();

    if (!entity || !Array.isArray(records)) {
      return NextResponse.json({ error: "Invalid payload. Specify 'entity' and a 'records' array." }, { status: 400 });
    }

    let createdCount = 0;
    const errors: string[] = [];

    // Use transaction to ensure atomic execution
    await db.$transaction(async (tx: any) => {
      if (entity === 'faculty') {
        for (let i = 0; i < records.length; i++) {
          const rec = records[i];
          const name = rec.name?.trim();
          const department = rec.department?.trim();
          const maxHours = Number(rec.maxHoursPerWeek || 16);
          const source = rec.source?.trim() || "COLLEGE";

          if (!name || !department) {
            errors.push(`Row ${i + 1}: Name and Department are required.`);
            continue;
          }

          // Check unique name
          const exists = await tx.faculty.findFirst({ where: { name } });
          if (exists) {
            errors.push(`Row ${i + 1}: Faculty with name '${name}' already exists.`);
            continue;
          }

          await tx.faculty.create({
            data: {
              name,
              department,
              maxHoursPerWeek: maxHours,
              source
            }
          });
          createdCount++;
        }
      } 
      
      else if (entity === 'subjects') {
        for (let i = 0; i < records.length; i++) {
          const rec = records[i];
          const code = rec.code?.trim();
          const name = rec.name?.trim();
          const type = rec.type?.trim() || "ACADEMIC";
          const credits = Number(rec.credits || 3);
          const lecHours = Number(rec.weeklyLectureHours || 3);
          const labHours = rec.weeklyLabHours ? Number(rec.weeklyLabHours) : null;
          const branchCode = rec.branchCode?.trim();
          const yearNumber = Number(rec.yearNumber);

          if (!code || !name || !branchCode || !yearNumber) {
            errors.push(`Row ${i + 1}: Code, Name, branchCode, and yearNumber are required.`);
            continue;
          }

          // Find Branch
          const branch = await tx.branch.findUnique({ where: { code: branchCode } });
          if (!branch) {
            errors.push(`Row ${i + 1}: Branch code '${branchCode}' does not exist.`);
            continue;
          }

          // Find or Create Year
          let year = await tx.year.findFirst({
            where: { branchId: branch.id, yearNumber }
          });
          if (!year) {
            year = await tx.year.create({
              data: { branchId: branch.id, yearNumber }
            });
            
            // Auto-create sections A and B for this year to maintain scaffolding
            await tx.section.create({
              data: {
                yearId: year.id,
                sectionName: "A",
                strength: 80,
                name: `${yearNumber} Year ${branch.code} - Section A`
              }
            });
            await tx.section.create({
              data: {
                yearId: year.id,
                sectionName: "B",
                strength: 80,
                name: `${yearNumber} Year ${branch.code} - Section B`
              }
            });
          }

          // Check unique code
          const exists = await tx.subject.findUnique({ where: { code } });
          if (exists) {
            errors.push(`Row ${i + 1}: Subject code '${code}' already exists.`);
            continue;
          }

          await tx.subject.create({
            data: {
              code,
              name,
              type,
              credits,
              weeklyLectureHours: lecHours,
              weeklyLabHours: labHours,
              yearId: year.id
            }
          });
          createdCount++;
        }
      } 
      
      else if (entity === 'fixed-allocations') {
        for (let i = 0; i < records.length; i++) {
          const rec = records[i];
          const subjectCode = rec.subjectCode?.trim();
          const facultyName = rec.facultyName?.trim();
          const sectionName = rec.sectionName?.trim(); // e.g. "A" or "B"
          const branchCode = rec.branchCode?.trim();
          const yearNumber = Number(rec.yearNumber);
          const day = Number(rec.day);
          const slotIndex = Number(rec.slotIndex);
          const roomName = rec.roomName?.trim();

          if (!subjectCode || !facultyName || !sectionName || !branchCode || !yearNumber || isNaN(day) || isNaN(slotIndex) || !roomName) {
            errors.push(`Row ${i + 1}: All allocation parameters must be specified.`);
            continue;
          }

          // Lookups
          const subject = await tx.subject.findUnique({ where: { code: subjectCode } });
          if (!subject) {
            errors.push(`Row ${i + 1}: Subject '${subjectCode}' does not exist.`);
            continue;
          }

          const faculty = await tx.faculty.findFirst({ where: { name: facultyName } });
          if (!faculty) {
            errors.push(`Row ${i + 1}: Faculty '${facultyName}' does not exist.`);
            continue;
          }

          const room = await tx.room.findFirst({ where: { name: roomName } });
          if (!room) {
            errors.push(`Row ${i + 1}: Room '${roomName}' does not exist.`);
            continue;
          }

          const timeSlot = await tx.timeSlot.findFirst({ where: { day, slotIndex } });
          if (!timeSlot) {
            errors.push(`Row ${i + 1}: Timeslot for Day ${day}, Slot ${slotIndex} does not exist.`);
            continue;
          }

          const branch = await tx.branch.findUnique({ where: { code: branchCode } });
          if (!branch) {
            errors.push(`Row ${i + 1}: Branch code '${branchCode}' does not exist.`);
            continue;
          }

          const year = await tx.year.findFirst({ where: { branchId: branch.id, yearNumber } });
          if (!year) {
            errors.push(`Row ${i + 1}: Branch-Year ${branchCode} ${yearNumber} Year does not exist.`);
            continue;
          }

          const section = await tx.section.findFirst({ where: { yearId: year.id, sectionName } });
          if (!section) {
            errors.push(`Row ${i + 1}: Section '${sectionName}' for ${branchCode} Year ${yearNumber} does not exist.`);
            continue;
          }

          // Check subject is TRAINING
          if (subject.type !== 'TRAINING') {
            errors.push(`Row ${i + 1}: Subject '${subjectCode}' is of type '${subject.type}'. Fixed Allocations are only allowed for TRAINING type subjects.`);
            continue;
          }

          // Create FixedAllocation
          await tx.fixedAllocation.create({
            data: {
              subjectId: subject.id,
              facultyId: faculty.id,
              sectionId: section.id,
              timeSlotId: timeSlot.id,
              roomId: room.id
            }
          });
          createdCount++;
        }
      }
    });

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        error: "Transactional bulk import failed.",
        errors,
        createdCount: 0
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${createdCount} records!`,
      createdCount
    });

  } catch (error: any) {
    console.error("Bulk import error:", error);
    return NextResponse.json({ error: error.message || "Failed to commit bulk imports transaction." }, { status: 500 });
  }
}
