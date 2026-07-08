import { generateTimetable } from '../scheduler';

export async function runGeneration(targetYearId?: string, targetSectionIds?: string[]) {
  return generateTimetable({
    daysPerWeek: 6,
    periodsPerDay: 9,
    targetYearId,
    targetSectionIds
  });
}
