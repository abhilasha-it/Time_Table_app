import { NextResponse } from 'next/server';
import db from '@/models/db';
import ExcelJS from 'exceljs';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let entity = '';
    let records: any[] = [];

    // 1. Check if payload is multipart/form-data (file upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      entity = (formData.get('entity') as string) || 'unified-excel';

      if (!file) {
        return NextResponse.json({ error: "No file uploaded. Please select a spreadsheet." }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer()) as any;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        return NextResponse.json({ error: "Excel sheet is empty or invalid." }, { status: 400 });
      }

      // Read Header Row
      const headers: string[] = [];
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value ? cell.value.toString().trim() : '';
      });

      // Map Column Indices Dynamically (case-insensitive fuzzy match)
      const colIndices = {
        course: -1,
        branch: -1,
        semester: -1,
        section: -1,
        subjectName: -1,
        subjectCode: -1,
        subjectType: -1,
        facultyName: -1
      };

      headers.forEach((h, idx) => {
        if (!h) return;
        const lower = h.toLowerCase();
        if (lower.includes('course')) colIndices.course = idx;
        else if (lower.includes('branch')) colIndices.branch = idx;
        else if (lower.includes('semester') || lower.includes('sem')) colIndices.semester = idx;
        else if (lower.includes('section') || lower.includes('sec')) colIndices.section = idx;
        else if (lower.includes('subject name') || lower.includes('subjectname') || lower.includes('subject_name')) colIndices.subjectName = idx;
        else if (lower.includes('subject code') || lower.includes('subjectcode') || lower.includes('subject_code') || lower.includes('code')) colIndices.subjectCode = idx;
        else if (lower.includes('subject type') || lower.includes('subjecttype') || lower.includes('subject_type') || lower.includes('type')) colIndices.subjectType = idx;
        else if (lower.includes('faculty name') || lower.includes('facultyname') || lower.includes('faculty_name') || lower.includes('faculty')) colIndices.facultyName = idx;
      });

      // Fallbacks if not matched by name
      if (colIndices.course === -1) colIndices.course = 1;
      if (colIndices.branch === -1) colIndices.branch = 2;
      if (colIndices.semester === -1) colIndices.semester = 3;
      if (colIndices.section === -1) colIndices.section = 4;
      if (colIndices.subjectName === -1) colIndices.subjectName = 5;
      if (colIndices.subjectCode === -1) colIndices.subjectCode = 6;
      if (colIndices.subjectType === -1) colIndices.subjectType = 7;
      if (colIndices.facultyName === -1) colIndices.facultyName = 8;

      // Extract rows
      for (let r = 2; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const getVal = (colIdx: number) => {
          if (colIdx === -1) return '';
          const cell = row.getCell(colIdx);
          if (!cell || cell.value === null || cell.value === undefined) return '';
          
          if (typeof cell.value === 'object') {
            if ('result' in cell.value) return String(cell.value.result || '').trim();
            if ('richText' in cell.value) return cell.value.richText.map((rt: any) => rt.text).join('').trim();
          }
          return String(cell.value).trim();
        };

        const course = getVal(colIndices.course);
        const branchVal = getVal(colIndices.branch);
        const semesterVal = getVal(colIndices.semester);
        const sectionVal = getVal(colIndices.section);
        const subjectName = getVal(colIndices.subjectName);
        const subjectCode = getVal(colIndices.subjectCode);
        const subjectType = getVal(colIndices.subjectType);
        const facultyName = getVal(colIndices.facultyName);

        if (!branchVal && !subjectCode && !subjectName) continue;

        records.push({
          course,
          branch: branchVal,
          semester: semesterVal,
          section: sectionVal,
          subjectName,
          subjectCode,
          subjectType,
          facultyName
        });
      }
    } else {
      // 2. Otherwise assume fallback application/json CSV payload
      const body = await request.json();
      entity = body.entity;
      records = body.records;
    }

    if (!entity || !Array.isArray(records)) {
      return NextResponse.json({ error: "Invalid payload. Specify entity and records array." }, { status: 400 });
    }

    let createdCount = 0;
    const errors: string[] = [];

    // Use transaction to ensure atomic execution
    await db.$transaction(async (tx: any) => {
      // If uploading the unified academic excel sheet, do dynamic scaffolding
      if (entity === 'unified-excel') {
        
        // Ensure classrooms & labs are populated to make sure timetable generation can run
        const classroomCount = await tx.room.count({ where: { type: 'CLASSROOM' } });
        if (classroomCount === 0) {
          for (let i = 1; i <= 5; i++) {
            await tx.room.create({
              data: { name: `LH-${i}`, type: 'CLASSROOM', capacity: 80 }
            });
          }
        }
        const labCount = await tx.room.count({ where: { type: 'LAB' } });
        if (labCount === 0) {
          for (let i = 1; i <= 5; i++) {
            await tx.room.create({
              data: { name: `LAB-${i}`, type: 'LAB', capacity: 80 }
            });
          }
        }

        for (let i = 0; i < records.length; i++) {
          const rec = records[i];
          const branchCode = rec.branch?.toUpperCase().trim();
          const semesterStr = String(rec.semester || '1').replace(/\D/g, '');
          const semester = parseInt(semesterStr) || 1;
          const yearNumber = Math.ceil(semester / 2) || 1; // 1-4
          const sectionName = rec.section?.toUpperCase().trim() || 'A';
          const subCode = rec.subjectCode?.trim();
          const subName = rec.subjectName?.trim();
          const subType = rec.subjectType?.toUpperCase().trim() || 'ACADEMIC';
          const facName = rec.facultyName?.trim();

          if (!branchCode || !subCode || !subName) {
            errors.push(`Row ${i + 2}: Branch, Subject Code, and Subject Name are required.`);
            continue;
          }

          // a. Find or Create Branch (and auto-scaffold Years 1 to 4)
          let branch = await tx.branch.findUnique({ where: { code: branchCode } });
          if (!branch) {
            branch = await tx.branch.create({
              data: {
                code: branchCode,
                name: `${branchCode} Department`
              }
            });

            for (let yr = 1; yr <= 4; yr++) {
              await tx.year.create({
                data: {
                  yearNumber: yr,
                  branchId: branch.id
                }
              });
            }
          }

          // b. Resolve Year
          const year = await tx.year.findUnique({
            where: {
              branchId_yearNumber: {
                branchId: branch.id,
                yearNumber: yearNumber
              }
            }
          });
          if (!year) {
            errors.push(`Row ${i + 2}: Failed to resolve year number ${yearNumber} for branch ${branchCode}.`);
            continue;
          }

          // c. Find or Create Section (and auto-scaffold lab batches)
          let section = await tx.section.findUnique({
            where: {
              yearId_sectionName: {
                yearId: year.id,
                sectionName: sectionName
              }
            }
          });
          if (!section) {
            const fullName = `${yearNumber} Yr ${branchCode} - ${sectionName}`;
            section = await tx.section.create({
              data: {
                sectionName,
                strength: 60,
                yearId: year.id,
                name: fullName,
                lunchSlotIndex: 4
              }
            });

            await tx.labBatch.create({
              data: { name: "Batch 1", strength: 30, sectionId: section.id }
            });
            await tx.labBatch.create({
              data: { name: "Batch 2", strength: 30, sectionId: section.id }
            });
          }

          // d. Find or Create Subject (parsing hours/credits from type)
          let subject = await tx.subject.findUnique({ where: { code: subCode } });
          if (!subject) {
            let type = 'ACADEMIC';
            let weeklyLectureHours = 3;
            let weeklyLabHours: number | null = null;
            let credits = 3;

            if (subType.includes('LAB') || subType.includes('PRACTICAL') || subType.includes('PRAC') || subType.includes('P')) {
              type = 'ACADEMIC';
              weeklyLectureHours = 0;
              weeklyLabHours = 2;
              credits = 2;
            } else if (subType.includes('TRAINING') || subType.includes('TRN') || subType.includes('T')) {
              type = 'TRAINING';
              weeklyLectureHours = 3;
              weeklyLabHours = null;
              credits = 3;
            }

            subject = await tx.subject.create({
              data: {
                code: subCode,
                name: subName,
                type,
                credits,
                weeklyLectureHours,
                weeklyLabHours,
                yearId: year.id
              }
            });
          }

          // e. Find or Create Faculty
          if (facName) {
            let faculty = await tx.faculty.findFirst({ where: { name: facName } });
            if (!faculty) {
              const isTraining = subject.type === 'TRAINING';
              await tx.faculty.create({
                data: {
                  name: facName,
                  department: branchCode,
                  maxHoursPerWeek: 18,
                  source: isTraining ? 'TRAINING_DEPT' : 'COLLEGE'
                }
              });
            }
          }
          createdCount++;
        }
      } 
      
      else if (entity === 'faculty') {
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

          const exists = await tx.faculty.findFirst({ where: { name } });
          if (exists) {
            errors.push(`Row ${i + 1}: Faculty with name '${name}' already exists.`);
            continue;
          }

          await tx.faculty.create({
            data: { name, department, maxHoursPerWeek: maxHours, source }
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

          const branch = await tx.branch.findUnique({ where: { code: branchCode } });
          if (!branch) {
            errors.push(`Row ${i + 1}: Branch code '${branchCode}' does not exist.`);
            continue;
          }

          let year = await tx.year.findFirst({
            where: { branchId: branch.id, yearNumber }
          });
          if (!year) {
            year = await tx.year.create({
              data: { branchId: branch.id, yearNumber }
            });
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
          const sectionName = rec.sectionName?.trim();
          const branchCode = rec.branchCode?.trim();
          const yearNumber = Number(rec.yearNumber);
          const day = Number(rec.day);
          const slotIndex = Number(rec.slotIndex);
          const roomName = rec.roomName?.trim();

          if (!subjectCode || !facultyName || !sectionName || !branchCode || !yearNumber || isNaN(day) || isNaN(slotIndex) || !roomName) {
            errors.push(`Row ${i + 1}: All allocation parameters must be specified.`);
            continue;
          }

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

          if (subject.type !== 'TRAINING') {
            errors.push(`Row ${i + 1}: Subject '${subjectCode}' is of type '${subject.type}'. Fixed Allocations are only allowed for TRAINING type subjects.`);
            continue;
          }

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
