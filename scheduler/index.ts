import { TimeTableCSP } from './csp';

export interface SchedulerConfig {
  daysPerWeek?: number;
  periodsPerDay?: number;
  targetYearId?: string;
  targetSectionIds?: string[];
}

/**
 * Triggers the core Constraint Satisfaction Problem (CSP) timetable scheduler engine.
 * Locks in training fixed allocations first, then solves for academic lectures and labs.
 */
export async function generateTimetable(config: SchedulerConfig = {}) {
  try {
    const csp = new TimeTableCSP(config.targetYearId, config.targetSectionIds);

    // 1. Initialize the CSP (fetches metadata, balance faculty workloads, creates variables)
    const initResult = await csp.initialize();
    if (!initResult.success) {
      return {
        success: false,
        message: initResult.error || "Failed to initialize college configuration parameters.",
        slotsScheduled: 0
      };
    }

    // 2. Execute Constraint-based Backtracking search
    const solveResult = csp.solve();
    if (!solveResult.success) {
      return {
        success: false,
        message: solveResult.error || "College timetable constraints are infeasible.",
        slotsScheduled: 0
      };
    }

    // 3. Save solved schedule versions to the database
    const saveResult = await csp.saveAssignments(solveResult.assignments);

    return {
      success: true,
      message: `Timetable version ${saveResult.version} ('${saveResult.name}') generated successfully! Scheduled ${saveResult.totalEntries} slot periods (inclusive of locked training allocations and batch-split labs).`,
      slotsScheduled: saveResult.totalEntries
    };
  } catch (error) {
    console.error("Scheduler Execution Error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "An unknown error occurred during scheduling execution.",
      slotsScheduled: 0
    };
  }
}
