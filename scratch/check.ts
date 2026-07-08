import { PrismaClient } from '@prisma/client';
import { TimeTableCSP } from '../scheduler/csp';

let prisma: PrismaClient;
const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
if (dbUrl.startsWith('postgres') || dbUrl.startsWith('mongodb') || dbUrl.startsWith('mysql')) {
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: dbUrl });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
} else {
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  prisma = new PrismaClient({ adapter });
}

async function main() {
  const solver = new TimeTableCSP();
  await solver.initialize();

  let maxDepth = 0;
  
  (solver as any).backtrack = function(varIndex: number): boolean {
    this.stepCount++;
    if (varIndex > maxDepth) {
      maxDepth = varIndex;
      console.log(`New max depth reached: ${maxDepth} / ${this.variables.length}`);
    }

    if (this.assignments.size === this.variables.length) {
      return true;
    }

    const nextVar = this.selectNextVariable();
    if (!nextVar) return false;

    const values = this.domains.get(nextVar.id) || [];
    const sortedValues = this.sortValuesByHeuristics(nextVar.id, values);

    let assignedCount = 0;
    let failReasons: string[] = [];

    for (const val of sortedValues) {
      // Inline check to collect conflict details
      let valid = true;
      const secId = nextVar.sectionId || solver.sections.flatMap(s => s.labBatches).find(b => b.id === nextVar.labBatchId)?.sectionId;

      for (const [assignedId, assignedVal] of this.assignments.entries()) {
        const assignedVar = this.variables.find((v: any) => v.id === assignedId)!;
        const assignedSecId = assignedVar.sectionId || solver.sections.flatMap(s => s.labBatches).find(b => b.id === assignedVar.labBatchId)?.sectionId;

        const timesOverlap = assignedVal.day === val.day && 
          assignedVal.occupiedSlotIndices.some((idx: any) => val.occupiedSlotIndices.includes(idx));

        if (timesOverlap) {
          if (assignedSecId === secId) {
            const bothLabs = nextVar.labBatchId && assignedVar.labBatchId;
            const sameBatch = nextVar.labBatchId === assignedVar.labBatchId;
            if (!bothLabs || sameBatch) {
              valid = false;
              failReasons.push(`Section overlap with ${assignedVar.id} on day ${val.day} slot ${val.occupiedSlotIndices.join(',')}`);
              break;
            }
          }

          const valF1 = val.facultyId;
          const valF2 = val.assistantFacultyId;
          const assF1 = assignedVar.facultyId;
          const assF2 = assignedVal.assistantFacultyId;

          if (assF1 === valF1 || 
              (valF2 && assF1 === valF2) || 
              (assF2 && assF2 === valF1) || 
              (assF2 && valF2 && assF2 === valF2)) {
            valid = false;
            failReasons.push(`Faculty overlap for ${val.facultyId} with ${assignedVar.id} on day ${val.day}`);
            break;
          }

          if (assignedVal.roomId === val.roomId) {
            valid = false;
            failReasons.push(`Room overlap for ${val.roomId} with ${assignedVar.id} on day ${val.day}`);
            break;
          }
        }
      }

      if (!valid) {
        continue;
      }

      assignedCount++;

      this.assignments.set(nextVar.id, val);
      const savedDomains = this.forwardCheck(nextVar, val);
      const forwardCheckSucceeded = Array.from(savedDomains.keys()).every(
        (key) => (this.domains.get(key) || []).length > 0
      );

      if (forwardCheckSucceeded) {
        const success = this.backtrack(varIndex + 1);
        if (success) return true;
      }

      this.assignments.delete(nextVar.id);
      for (const [key, oldValues] of savedDomains.entries()) {
        this.domains.set(key, oldValues);
      }
    }

    if (assignedCount === 0 && varIndex === maxDepth && this.stepCount > 1000) {
      console.log(`\nSTUCK at depth ${varIndex}. Variable: ${nextVar.id}`);
      const sub = solver.subjects.find(s => s.id === nextVar.subjectId);
      const fac = solver.faculties.find(f => f.id === nextVar.facultyId);
      console.log(`Variable details: Subject: ${sub?.code}, Faculty: ${fac?.name}, isLab: ${nextVar.isLab}`);
      console.log(`Domain values tested: ${values.length}`);
      console.log("Sample failure reasons (up to 5):");
      console.log(failReasons.slice(0, 5));
    }

    if (this.stepCount > 50000) {
      return false;
    }

    return false;
  };

  (solver as any).backtrack(0);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
