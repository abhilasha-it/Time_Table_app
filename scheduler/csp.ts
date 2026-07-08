import { db } from '../models';

export interface Variable {
  id: string; // unique identifier: sectionId_subjectId_sessionIndex
  sectionId?: string;
  labBatchId?: string;
  subjectId: string;
  facultyId: string;
  isLab: boolean;
  duration: number; // e.g. 1 for lecture, 3 for lab
  strength: number;
}

export interface Value {
  timeSlotId: string; // Starting timeslot
  roomId: string;
  facultyId: string;
  assistantFacultyId?: string | null;
  
  // Auxiliary information for constraint checks
  day: number;
  startSlotIndex: number;
  occupiedSlotIndices: number[]; // e.g. [0, 1, 2] for 3-hour lab starting at 0
}

export class TimeTableCSP {
  private variables: Variable[] = [];
  private domains: Map<string, Value[]> = new Map();
  private assignments: Map<string, Value> = new Map();

  // Locked slots from FixedAllocation (represented as lookup sets for speed)
  private lockedSectionSlots: Set<string> = new Set(); // "sectionId_day_slotIndex"
  private lockedFacultySlots: Set<string> = new Set(); // "facultyId_day_slotIndex"
  private lockedRoomSlots: Set<string> = new Set();    // "roomId_day_slotIndex"

  // Database cache
  private sections: any[] = [];
  private subjects: any[] = [];
  private faculties: any[] = [];
  private rooms: any[] = [];
  private timeSlots: any[] = [];
  private fixedAllocations: any[] = [];

  private targetYearId?: string;
  private targetSectionIds?: string[];
  private stepCount = 0;

  constructor(targetYearId?: string, targetSectionIds?: string[]) {
    this.targetYearId = targetYearId;
    this.targetSectionIds = targetSectionIds;
  }

  /**
   * Initializes the CSP by loading all configuration data from database
   */
  public async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      const allSections = await db.section.findMany({
        include: {
          year: { include: { branch: true } },
          labBatches: true
        }
      });
      this.subjects = await db.subject.findMany({
        include: { year: { include: { branch: true } } }
      });
      this.faculties = await db.faculty.findMany();
      this.rooms = await db.room.findMany();
      this.timeSlots = (await db.timeSlot.findMany({
        orderBy: [{ day: 'asc' }, { slotIndex: 'asc' }]
      })).filter((ts: any) => ts.day < 5);
      this.fixedAllocations = await db.fixedAllocation.findMany({
        include: { timeSlot: true }
      });

      // Filter sections to schedule
      if (this.targetSectionIds && this.targetSectionIds.length > 0) {
        this.sections = allSections.filter(s => this.targetSectionIds!.includes(s.id));
      } else if (this.targetYearId) {
        this.sections = allSections.filter(s => s.yearId === this.targetYearId);
      } else {
        this.sections = allSections;
      }

      if (this.sections.length === 0 || this.faculties.length === 0 || this.rooms.length === 0 || this.timeSlots.length === 0) {
        return {
          success: false,
          error: "Incomplete configuration metadata or no sections found for scheduling."
        };
      }

      // If solving for a target year or target sections, load other active timetable entries and treat them as locked!
      const activeTimetable = await db.generatedTimetable.findFirst({
        where: { isActive: true }
      });
      
      if (activeTimetable) {
        let otherEntries: any[] = [];
        
        if (this.targetSectionIds && this.targetSectionIds.length > 0) {
          otherEntries = await db.timetableEntry.findMany({
            where: {
              timetableId: activeTimetable.id,
              NOT: [
                { sectionId: { in: this.targetSectionIds } },
                { labBatch: { sectionId: { in: this.targetSectionIds } } }
              ]
            },
            include: {
              timeSlot: true,
              section: true,
              labBatch: { include: { section: true } }
            }
          });
        } else if (this.targetYearId) {
          otherEntries = await db.timetableEntry.findMany({
            where: {
              timetableId: activeTimetable.id,
              OR: [
                { section: { yearId: { not: this.targetYearId } } },
                { labBatch: { section: { yearId: { not: this.targetYearId } } } }
              ]
            },
            include: {
              timeSlot: true,
              section: true,
              labBatch: { include: { section: true } }
            }
          });
        }

        for (const entry of otherEntries) {
          const keySuffix = `${entry.timeSlot.day}_${entry.timeSlot.slotIndex}`;
          this.lockedFacultySlots.add(`${entry.facultyId}_${keySuffix}`);
          this.lockedRoomSlots.add(`${entry.roomId}_${keySuffix}`);
          const entrySecId = entry.sectionId || entry.labBatch?.sectionId;
          if (entrySecId) {
            this.lockedSectionSlots.add(`${entrySecId}_${keySuffix}`);
          }
        }
      }

      // Populate locked allocations
      for (const fa of this.fixedAllocations) {
        const keySuffix = `${fa.timeSlot.day}_${fa.timeSlot.slotIndex}`;
        this.lockedSectionSlots.add(`${fa.sectionId}_${keySuffix}`);
        this.lockedFacultySlots.add(`${fa.facultyId}_${keySuffix}`);
        this.lockedRoomSlots.add(`${fa.roomId}_${keySuffix}`);
      }

      // 1. Pre-assign Faculty to Subject-Section pairs to ensure teacher consistency
      const subjectSectionFacultyMap = await this.preassignFaculty();

      // 2. Build session variables
      this.buildVariables(subjectSectionFacultyMap);

      // 3. Build domains with forward checks and capacity checks
      this.buildDomains();

      return { success: true };
    } catch (e: any) {
      console.error("CSP Initialization failed:", e);
      return { success: false, error: e.message || "Unknown error during initialization." };
    }
  }

  /**
   * Performs workload balancing to assign a single consistent Faculty member 
   * to each Subject-Section course pair.
   */
  private async preassignFaculty(): Promise<Map<string, string>> {
    const map = new Map<string, string>(); // Key: "sectionId_subjectId", Value: facultyId
    const facultyLoadHours = new Map<string, number>(); // Key: facultyId, Value: current assigned hours
    
    // Initialize workload tracker
    for (const f of this.faculties) {
      facultyLoadHours.set(f.id, 0);
    }

    // Account for FixedAllocations load
    for (const fa of this.fixedAllocations) {
      const current = facultyLoadHours.get(fa.facultyId) || 0;
      facultyLoadHours.set(fa.facultyId, current + 1);
    }

    for (const section of this.sections) {
      // Find all academic subjects for this section's year
      const academicSubjects = this.subjects.filter(
        (s) => s.yearId === section.yearId && s.type === "ACADEMIC"
      );

      for (const subject of academicSubjects) {
        // Find eligible faculties in the same department
        let eligibleFaculties = this.faculties.filter(
          (f) => f.department.toLowerCase() === section.year.branch.code.toLowerCase() && f.source === "COLLEGE"
        );

        // Fallbacks for general subjects (like First Year Math/Physics)
        if (eligibleFaculties.length === 0) {
          if (subject.name.toLowerCase().includes("math") || subject.code.toLowerCase().includes("mat")) {
            eligibleFaculties = this.faculties.filter(f => f.department.toLowerCase() === "mathematics");
          } else if (subject.name.toLowerCase().includes("phys") || subject.code.toLowerCase().includes("phy")) {
            eligibleFaculties = this.faculties.filter(f => f.department.toLowerCase() === "physics");
          } else {
            eligibleFaculties = this.faculties.filter(f => f.source === "COLLEGE");
          }
        }

        // Pick faculty with the least workload who has not exceeded max hours limit
        const requiredHours = subject.weeklyLectureHours + (subject.weeklyLabHours || 0);
        let selectedFaculty = null;
        let minLoad = Infinity;

        for (const faculty of eligibleFaculties) {
          const load = facultyLoadHours.get(faculty.id) || 0;
          if (load + requiredHours <= faculty.maxHoursPerWeek && load < minLoad) {
            minLoad = load;
            selectedFaculty = faculty;
          }
        }

        // Hard fallback if all matched faculty are overloaded
        if (!selectedFaculty && eligibleFaculties.length > 0) {
          selectedFaculty = eligibleFaculties[0];
        }

        if (selectedFaculty) {
          map.set(`${section.id}_${subject.id}`, selectedFaculty.id);
          const current = facultyLoadHours.get(selectedFaculty.id) || 0;
          facultyLoadHours.set(selectedFaculty.id, current + requiredHours);
        } else {
          // Absolute fallback to any college faculty
          const fallback = this.faculties.find(f => f.source === "COLLEGE") || this.faculties[0];
          map.set(`${section.id}_${subject.id}`, fallback.id);
        }
      }
    }

    return map;
  }

  /**
   * Generates session variables from lecture hour and lab hour requirements
   */
  private buildVariables(facultyMap: Map<string, string>) {
    this.variables = [];

    for (const section of this.sections) {
      const academicSubjects = this.subjects.filter(
        (s) => s.yearId === section.yearId && s.type === "ACADEMIC"
      );

      for (const subject of academicSubjects) {
        const facultyId = facultyMap.get(`${section.id}_${subject.id}`);
        if (!facultyId) continue;

        // 1. Generate Lecture Variables (1-hour slots)
        for (let i = 0; i < subject.weeklyLectureHours; i++) {
          this.variables.push({
            id: `lect_${section.id}_${subject.id}_${i}`,
            sectionId: section.id,
            subjectId: subject.id,
            facultyId,
            isLab: false,
            duration: 1,
            strength: section.strength
          });
        }

        // 2. Generate Lab Variables
        if (subject.weeklyLabHours && subject.weeklyLabHours > 0) {
          const duration = subject.weeklyLabHours;
          
          // Check if section strength exceeds lab capacity limit (typically labs capacity ~35)
          const maxLabRoomCap = Math.max(...this.rooms.filter(r => r.type === "LAB").map(r => r.capacity), 35);
          
          if (section.strength > maxLabRoomCap && section.labBatches.length > 0) {
            // Split into parallel/sequential batch variables
            for (const batch of section.labBatches) {
              this.variables.push({
                id: `lab_${section.id}_${batch.id}_${subject.id}`,
                labBatchId: batch.id,
                subjectId: subject.id,
                facultyId,
                isLab: true,
                duration,
                strength: batch.strength
              });
            }
          } else {
            // Schedule section as a whole
            this.variables.push({
              id: `lab_${section.id}_${subject.id}_0`,
              sectionId: section.id,
              subjectId: subject.id,
              facultyId,
              isLab: true,
              duration,
              strength: section.strength
            });
          }
        }
      }
    }
  }

  /**
   * Generates list of valid slot values (Day, Slot, Room) for each variable domain
   */
  private buildDomains() {
    this.domains.clear();

    const classrooms = this.rooms.filter((r) => r.type === "CLASSROOM");
    const labs = this.rooms.filter((r) => r.type === "LAB");

    for (const v of this.variables) {
      const values: Value[] = [];
      const eligibleRooms = v.isLab ? labs : classrooms;

      // Filter rooms by capacity
      const compatibleRooms = eligibleRooms.filter((r) => r.capacity >= v.strength);

      // Find section associated with variable
      let targetSecId = v.sectionId;
      if (v.labBatchId) {
        const batch = this.sections.flatMap(s => s.labBatches).find(b => b.id === v.labBatchId);
        if (batch) targetSecId = batch.sectionId;
      }
      const section = this.sections.find(s => s.id === targetSecId);

      for (const timeSlot of this.timeSlots) {
        const day = timeSlot.day;
        const startSlotIdx = timeSlot.slotIndex;

        // Check if duration fits in the day (Max 9 periods: 0 to 8)
        if (startSlotIdx + v.duration > 9) continue;

        // Get occupied indices
        const occupiedSlotIndices = Array.from({ length: v.duration }, (_, i) => startSlotIdx + i);

        // Freeze custom lunch slot check
        if (section && occupiedSlotIndices.includes(section.lunchSlotIndex)) {
          continue;
        }

        // Pre-check: Timeslot must not collide with fixed allocations for this section
        let collidesWithFixed = false;
        for (const idx of occupiedSlotIndices) {
          const slotSuffix = `${day}_${idx}`;
          
          // Section fixed check
          if (v.sectionId && this.lockedSectionSlots.has(`${v.sectionId}_${slotSuffix}`)) {
            collidesWithFixed = true;
            break;
          }
          // Batch section fixed check
          if (v.labBatchId) {
            const batch = this.sections.flatMap(s => s.labBatches).find(b => b.id === v.labBatchId);
            if (batch && this.lockedSectionSlots.has(`${batch.sectionId}_${slotSuffix}`)) {
              collidesWithFixed = true;
              break;
            }
          }
          // Faculty fixed check
          if (this.lockedFacultySlots.has(`${v.facultyId}_${slotSuffix}`)) {
            collidesWithFixed = true;
            break;
          }
        }

        if (collidesWithFixed) continue;

        for (const room of compatibleRooms) {
          // Pre-check: Room must not collide with fixed allocations
          let roomLocked = false;
          for (const idx of occupiedSlotIndices) {
            if (this.lockedRoomSlots.has(`${room.id}_${day}_${idx}`)) {
              roomLocked = true;
              break;
            }
          }

          if (roomLocked) continue;

          if (v.isLab) {
            // Find eligible assistant faculty members
            const dept = section?.year?.branch?.code || "";
            let eligibleAssistants = this.faculties.filter(f => 
              f.id !== v.facultyId &&
              f.source === "COLLEGE" &&
              f.department.toLowerCase() === dept.toLowerCase()
            );
            if (eligibleAssistants.length === 0) {
              eligibleAssistants = this.faculties.filter(f => 
                f.id !== v.facultyId &&
                f.source === "COLLEGE"
              );
            }

            const availableAssistants = eligibleAssistants.filter(f => {
              for (const idx of occupiedSlotIndices) {
                if (this.lockedFacultySlots.has(`${f.id}_${day}_${idx}`)) {
                  return false;
                }
              }
              return true;
            });

            if (availableAssistants.length > 0) {
              for (const assistant of availableAssistants) {
                values.push({
                  timeSlotId: timeSlot.id,
                  roomId: room.id,
                  facultyId: v.facultyId,
                  assistantFacultyId: assistant.id,
                  day,
                  startSlotIndex: startSlotIdx,
                  occupiedSlotIndices
                });
              }
            } else {
              // Fallback to any other faculty member who is free
              const fallback = this.faculties.find(f => f.id !== v.facultyId) || this.faculties[0];
              values.push({
                timeSlotId: timeSlot.id,
                roomId: room.id,
                facultyId: v.facultyId,
                assistantFacultyId: fallback?.id,
                day,
                startSlotIndex: startSlotIdx,
                occupiedSlotIndices
              });
            }
          } else {
            values.push({
              timeSlotId: timeSlot.id,
              roomId: room.id,
              facultyId: v.facultyId,
              day,
              startSlotIndex: startSlotIdx,
              occupiedSlotIndices
            });
          }
        }
      }

      this.domains.set(v.id, values);
    }
  }

  /**
   * Sorts values by a penalty score to encourage soft constraint optimization:
   * - Penalize: daily gaps for sections.
   * - Penalize: faculty load clustering.
   * - Penalize: > 2 consecutive hours of same subject.
   */
  private sortValuesByHeuristics(vId: string, values: Value[]): Value[] {
    const variable = this.variables.find(v => v.id === vId)!;
    
    return values.map((val) => {
      let penalty = 0;
      
      // 1. Load Balance Penalty: Check how many slots are already scheduled for this faculty on this day
      let facultyDayLoad = 0;
      for (const [assignedId, assignedVal] of this.assignments.entries()) {
        const assignedVar = this.variables.find(v => v.id === assignedId)!;
        if (assignedVar.facultyId === variable.facultyId && assignedVal.day === val.day) {
          facultyDayLoad += assignedVar.duration;
        }
      }
      // Penalize day load exceeding 4 hours to distribute weekly slots evenly
      if (facultyDayLoad + variable.duration > 4) {
        penalty += 15;
      }

      // 2. Daily Subject Cap: Avoid scheduling more than 2 lectures of the same subject on the same day for a section
      if (!variable.isLab) {
        let sameSubjectDayCount = 0;
        const sectionId = variable.sectionId || this.sections.flatMap(s => s.labBatches).find(b => b.id === variable.labBatchId)?.sectionId;
        
        for (const [assignedId, assignedVal] of this.assignments.entries()) {
          const assignedVar = this.variables.find(v => v.id === assignedId)!;
          const assignedSecId = assignedVar.sectionId || this.sections.flatMap(s => s.labBatches).find(b => b.id === assignedVar.labBatchId)?.sectionId;
          
          if (assignedSecId === sectionId && assignedVar.subjectId === variable.subjectId && assignedVal.day === val.day) {
            sameSubjectDayCount++;
          }
        }
        if (sameSubjectDayCount >= 2) {
          penalty += 25;
        }
      }

      return { val, penalty };
    })
    .sort((a, b) => {
      if (a.penalty === b.penalty) {
        return Math.random() - 0.5; // Random shuffle to get alternative layouts upon regeneration
      }
      return a.penalty - b.penalty;
    })
    .map(x => x.val);
  }

  /**
   * Main backtracking recursion solver.
   * Uses MRV (Minimum Remaining Values) for variable selection and Forward Checking for pruning.
   */
  private backtrack(varIndex: number): boolean {
    this.stepCount++;
    if (this.stepCount > 8000) {
      return false; // Prevent infinite/long recursion hanging the server
    }

    // Base Case: all variables successfully assigned!
    if (this.assignments.size === this.variables.length) {
      return true;
    }

    // 1. Variable Selection using MRV
    const nextVar = this.selectNextVariable();
    if (!nextVar) return false;

    const values = this.domains.get(nextVar.id) || [];
    
    // Sort values using heuristics (load balance, subject cap)
    const sortedValues = this.sortValuesByHeuristics(nextVar.id, values);

    for (const val of sortedValues) {
      // Check hard constraints against current assignments
      if (!this.isValidAssignment(nextVar, val)) {
        continue;
      }

      // Make Assignment
      this.assignments.set(nextVar.id, val);

      // Perform Forward Checking: prune domains of remaining variables
      const savedDomains = this.forwardCheck(nextVar, val);
      const forwardCheckSucceeded = Array.from(savedDomains.keys()).every(
        (key) => (this.domains.get(key) || []).length > 0
      );

      if (forwardCheckSucceeded) {
        // Recurse
        const success = this.backtrack(varIndex + 1);
        if (success) return true;
      }

      // Undo Assignment & Restore Domains (Backtrack)
      this.assignments.delete(nextVar.id);
      for (const [key, oldValues] of savedDomains.entries()) {
        this.domains.set(key, oldValues);
      }
    }

    return false;
  }

  /**
   * Selects the next unassigned variable with the minimum remaining values (MRV)
   */
  private selectNextVariable(): Variable | null {
    let selected: Variable | null = null;
    let minDomainSize = Infinity;

    for (const v of this.variables) {
      if (this.assignments.has(v.id)) continue;
      
      const domainSize = (this.domains.get(v.id) || []).length;
      
      if (domainSize < minDomainSize) {
        minDomainSize = domainSize;
        selected = v;
      } else if (domainSize === minDomainSize && selected) {
        // Degree Heuristic tie-breaker: select variable with larger duration (e.g. Labs)
        if (v.duration > selected.duration) {
          selected = v;
        } else if (v.duration === selected.duration && Math.random() > 0.5) {
          // Random tie-breaker for equal domains and durations
          selected = v;
        }
      }
    }

    return selected;
  }

  /**
   * Hard Constraint Validator
   */
  private isValidAssignment(variable: Variable, val: Value): boolean {
    const secId = variable.sectionId || this.sections.flatMap(s => s.labBatches).find(b => b.id === variable.labBatchId)?.sectionId;

    for (const [assignedId, assignedVal] of this.assignments.entries()) {
      const assignedVar = this.variables.find(v => v.id === assignedId)!;
      const assignedSecId = assignedVar.sectionId || this.sections.flatMap(s => s.labBatches).find(b => b.id === assignedVar.labBatchId)?.sectionId;

      // Check for timeslot overlaps
      const timesOverlap = assignedVal.day === val.day && 
        assignedVal.occupiedSlotIndices.some(idx => val.occupiedSlotIndices.includes(idx));

      if (timesOverlap) {
        // 1. Section conflict
        if (assignedSecId === secId) {
          // If scheduling batches of the same section, they can run in parallel in DIFFERENT lab rooms!
          // Else, a section cannot be in two places at once.
          const bothLabs = variable.labBatchId && assignedVar.labBatchId;
          const sameBatch = variable.labBatchId === assignedVar.labBatchId;
          
          if (!bothLabs || sameBatch) {
            return false;
          }
        }

        // 2. Faculty conflict (check both primary and assistant double-bookings)
        const valF1 = val.facultyId;
        const valF2 = val.assistantFacultyId;
        const assF1 = assignedVar.facultyId;
        const assF2 = assignedVal.assistantFacultyId;

        if (assF1 === valF1 || 
            (valF2 && assF1 === valF2) || 
            (assF2 && assF2 === valF1) || 
            (assF2 && valF2 && assF2 === valF2)) {
          return false;
        }

        // 3. Room conflict
        if (assignedVal.roomId === val.roomId) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Forward checking: reduces domains of remaining variables based on the new assignment.
   * Returns a map containing the original domains before pruning for easy rollback.
   */
  private forwardCheck(variable: Variable, val: Value): Map<string, Value[]> {
    const rolledBackDomains = new Map<string, Value[]>();
    const secId = variable.sectionId || this.sections.flatMap(s => s.labBatches).find(b => b.id === variable.labBatchId)?.sectionId;

    for (const v of this.variables) {
      if (this.assignments.has(v.id)) continue;

      const currentDomain = this.domains.get(v.id) || [];
      const newDomain = currentDomain.filter((domainVal) => {
        // Check overlap
        const timesOverlap = domainVal.day === val.day && 
          domainVal.occupiedSlotIndices.some(idx => val.occupiedSlotIndices.includes(idx));

        if (timesOverlap) {
          // Section overlap check
          const vSecId = v.sectionId || this.sections.flatMap(s => s.labBatches).find(b => b.id === v.labBatchId)?.sectionId;
          if (vSecId === secId) {
            const bothLabs = variable.labBatchId && v.labBatchId;
            const sameBatch = variable.labBatchId === v.labBatchId;
            if (!bothLabs || sameBatch) return false;
          }
          
          // Faculty check (check both primary and assistant double-bookings)
          const valF1 = val.facultyId;
          const valF2 = val.assistantFacultyId;
          const domF1 = domainVal.facultyId;
          const domF2 = domainVal.assistantFacultyId;

          if (domF1 === valF1 || 
              (valF2 && domF1 === valF2) || 
              (domF2 && domF2 === valF1) || 
              (domF2 && valF2 && domF2 === valF2)) {
            return false;
          }
          
          // Room check
          if (domainVal.roomId === val.roomId) return false;
        }

        return true;
      });

      if (newDomain.length !== currentDomain.length) {
        rolledBackDomains.set(v.id, currentDomain);
        this.domains.set(v.id, newDomain);
      }
    }

    return rolledBackDomains;
  }

  /**
   * Triggers the recursive solving algorithm.
   */
  public solve(): { success: boolean; assignments: Map<string, Value>; error?: string } {
    // Check if any variable has an empty initial domain
    for (const v of this.variables) {
      const d = this.domains.get(v.id) || [];
      if (d.length === 0) {
        const subject = this.subjects.find((s) => s.id === v.subjectId);
        const section = this.sections.find((s) => s.id === v.sectionId || (v.labBatchId && s.labBatches.some((b: any) => b.id === v.labBatchId)));
        const batch = v.labBatchId ? section?.labBatches?.find((b: any) => b.id === v.labBatchId) : null;
        
        return {
          success: false,
          assignments: new Map(),
          error: `Infeasible constraints: Variable '${v.id}' has 0 valid options. Not enough Room capacity/availability or Faculty hours cap exceeded for subject '${subject?.code}' on section '${section?.name}'${batch ? ` (Batch ${batch.name})` : ""}.`
        };
      }
    }

    this.stepCount = 0;
    this.assignments.clear();
    const success = this.backtrack(0);

    if (success) {
      return { success: true, assignments: this.assignments };
    } else {
      const errorMsg = this.stepCount > 8000 
        ? "Timetable generation timed out due to complex constraints. Please add more classrooms/labs or reduce subject lecture/lab hours to expand slot options."
        : "Timetable constraints are infeasible. Could not find a conflict-free allocation of rooms and faculty hours for all sections. Distribute workloads or add classrooms.";
      return {
        success: false,
        assignments: new Map(),
        error: errorMsg
      };
    }
  }

  /**
   * Saves the generated assignments as TimetableEntry rows in the SQLite database.
   */
  public async saveAssignments(assignments: Map<string, Value>): Promise<any> {
    // Determine new version
    const lastTimetable = await db.generatedTimetable.findFirst({
      orderBy: { version: 'desc' }
    });
    const nextVersion = lastTimetable ? lastTimetable.version + 1 : 1;

    // Create new GeneratedTimetable container
    const newTimetable = await db.generatedTimetable.create({
      data: {
        name: `AI Scheduler Timetable v${nextVersion}`,
        version: nextVersion,
        isActive: true
      }
    });

    // Set other versions to inactive
    await db.generatedTimetable.updateMany({
      where: { id: { not: newTimetable.id } },
      data: { isActive: false }
    });

    let count = 0;

    // Copy active entries from OTHER sections to carry them over
    const activeTimetableForCarryOver = await db.generatedTimetable.findFirst({
      where: { isActive: true }
    });
    
    if (activeTimetableForCarryOver) {
      const rescheduledSectionIds = this.sections.map(s => s.id);
      const otherSectionEntries = await db.timetableEntry.findMany({
        where: {
          timetableId: activeTimetableForCarryOver.id,
          NOT: [
            { sectionId: { in: rescheduledSectionIds } },
            { labBatch: { sectionId: { in: rescheduledSectionIds } } }
          ]
        }
      });

      for (const entry of otherSectionEntries) {
        await db.timetableEntry.create({
          data: {
            timetableId: newTimetable.id,
            sectionId: entry.sectionId,
            labBatchId: entry.labBatchId,
            subjectId: entry.subjectId,
            facultyId: entry.facultyId,
            roomId: entry.roomId,
            timeSlotId: entry.timeSlotId
          }
        });
        count++;
      }
    }

    // 1. Copy Fixed Allocations (Centralized training slots)
    for (const fa of this.fixedAllocations) {
      await db.timetableEntry.create({
        data: {
          timetableId: newTimetable.id,
          sectionId: fa.sectionId,
          subjectId: fa.subjectId,
          facultyId: fa.facultyId,
          roomId: fa.roomId,
          timeSlotId: fa.timeSlotId
        }
      });
      count++;
    }

    // 2. Save CSP solved entries
    for (const [vId, val] of assignments.entries()) {
      const v = this.variables.find((x) => x.id === vId)!;
      
      // If variable spans multiple slots (duration > 1), we create an entry for each slot!
      // This is necessary because in our schema, TimetableEntry corresponds to a single timeslot period.
      for (const idx of val.occupiedSlotIndices) {
        // Find the timeslot representing this index on this day
        const slot = this.timeSlots.find((ts) => ts.day === val.day && ts.slotIndex === idx);
        if (!slot) continue;

        await db.timetableEntry.create({
          data: {
            timetableId: newTimetable.id,
            sectionId: v.sectionId || null,
            labBatchId: v.labBatchId || null,
            subjectId: v.subjectId,
            facultyId: val.facultyId,
            assistantFacultyId: val.assistantFacultyId || null,
            roomId: val.roomId,
            timeSlotId: slot.id
          }
        });
        count++;
      }
    }

    return {
      version: nextVersion,
      name: newTimetable.name,
      totalEntries: count
    };
  }
}
