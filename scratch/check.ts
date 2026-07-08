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

  // Override stepCount limit to 25,000
  const originalBacktrack = (solver as any).backtrack;
  (solver as any).backtrack = function(varIndex: number): boolean {
    this.stepCount++;
    if (this.stepCount > 25000) { // Set limit to 25,000
      return false;
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

  const startTime = Date.now();
  const success = (solver as any).backtrack(0);
  const elapsed = Date.now() - startTime;
  
  console.log(`Success: ${success} | Steps: ${solver.stepCount} | Time: ${elapsed}ms`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
