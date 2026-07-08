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
  let bestAssignments: any = null;

  (solver as any).backtrack = function(varIndex: number): boolean {
    this.stepCount++;
    if (varIndex > maxDepth) {
      maxDepth = varIndex;
      bestAssignments = new Map(this.assignments);
    }

    if (this.assignments.size === this.variables.length) {
      return true;
    }

    const nextVar = this.selectNextVariable();
    if (!nextVar) return false;

    const values = this.domains.get(nextVar.id) || [];
    const sortedValues = this.sortValuesByHeuristics(nextVar.id, values);

    for (const val of sortedValues) {
      if (!this.isValidAssignment(nextVar, val)) {
        continue;
      }

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

    return false;
  };

  const success = (solver as any).backtrack(0);
  console.log(`Success: ${success} | Max Depth: ${maxDepth}`);
  
  if (bestAssignments) {
    console.log("\nBEST ASSIGNMENTS AT MAX DEPTH:");
    // Print day by day
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    for (let d = 0; d < 5; d++) {
      console.log(`\n${days[d]}:`);
      for (let p = 0; p < 9; p++) {
        // Find if any variable is assigned to this day/period
        const matches: string[] = [];
        for (const [vId, val] of bestAssignments.entries()) {
          if (val.day === d && val.occupiedSlotIndices.includes(p)) {
            const v = solver.variables.find(x => x.id === vId)!;
            const sub = solver.subjects.find(s => s.id === v.subjectId);
            const fac = solver.faculties.find(f => f.id === val.facultyId);
            const sec = solver.sections.find(s => s.id === v.sectionId || (v.labBatchId && s.labBatches.some((b: any) => b.id === v.labBatchId)));
            matches.push(`[Sec ${sec?.sectionName}: ${sub?.code} by ${fac?.name} in ${val.roomId}]`);
          }
        }
        if (matches.length > 0) {
          console.log(`  Period ${p}: ${matches.join(' | ')}`);
        } else {
          console.log(`  Period ${p}: Free`);
        }
      }
    }

    // Print unassigned variables details
    console.log("\nUNASSIGNED VARIABLES:");
    for (const v of solver.variables) {
      if (!bestAssignments.has(v.id)) {
        const sub = solver.subjects.find(s => s.id === v.subjectId);
        const fac = solver.faculties.find(f => f.id === v.facultyId);
        console.log(`- Var: ${v.id} | Subject: ${sub?.code} | Faculty: ${fac?.name} | isLab: ${v.isLab}`);
      }
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
