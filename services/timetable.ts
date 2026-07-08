import db from '../models/db';

export interface TimetableFilters {
  branchId?: string;
  year?: number;
  section?: string;
}

export async function getTimetable(filters?: TimetableFilters) {
  // Find the active version of the generated timetable
  const activeTimetable = await db.generatedTimetable.findFirst({
    where: { isActive: true },
    orderBy: { version: 'desc' }
  });

  if (!activeTimetable) return [];

  const where: any = { timetableId: activeTimetable.id };

  if (filters?.branchId || filters?.year || filters?.section) {
    where.section = {};
    if (filters.branchId) {
      where.section.year = { branchId: filters.branchId };
    }
    if (filters.year) {
      where.section.year = {
        ...where.section.year,
        yearNumber: Number(filters.year)
      };
    }
    if (filters.section) {
      where.section.sectionName = filters.section;
    }
  }

  return db.timetableEntry.findMany({
    where,
    include: {
      section: {
        include: {
          year: {
            include: {
              branch: true
            }
          }
        }
      },
      labBatch: {
        include: {
          section: {
            include: {
              year: {
                include: {
                  branch: true
                }
              }
            }
          }
        }
      },
      subject: true,
      faculty: true,
      assistantFaculty: true,
      room: true,
      timeSlot: true,
    }
  });
}

export async function getMetadata() {
  const branches = await db.branch.findMany({
    include: {
      years: {
        include: {
          sections: {
            include: {
              labBatches: true
            }
          },
          subjects: true,
        },
        orderBy: { yearNumber: 'asc' }
      }
    },
    orderBy: { code: 'asc' }
  });

  const teachers = await db.faculty.findMany({
    orderBy: { name: 'asc' }
  });

  const rooms = await db.room.findMany({
    orderBy: { name: 'asc' }
  });

  const timeslots = await db.timeSlot.findMany({
    orderBy: [
      { day: 'asc' },
      { slotIndex: 'asc' }
    ]
  });

  return { branches, teachers, rooms, timeslots };
}

export async function updateSlot(
  entryId: string, 
  data: { 
    facultyId: string; 
    assistantFacultyId?: string | null; 
    roomId: string; 
    subjectId: string;
    timeSlotId?: string;
  }
) {
  return db.timetableEntry.update({
    where: { id: entryId },
    data,
    include: {
      section: {
        include: {
          year: {
            include: {
              branch: true
            }
          }
        }
      },
      labBatch: { include: { section: true } },
      subject: true,
      faculty: true,
      assistantFaculty: true,
      room: true,
      timeSlot: true,
    }
  });
}

export async function deleteSlot(entryId: string) {
  return db.timetableEntry.delete({
    where: { id: entryId }
  });
}
