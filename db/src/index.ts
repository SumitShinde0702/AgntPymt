import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { resolveDatabaseUrl } from "./connection.js";

let sql: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!dbInstance) {
    const url = resolveDatabaseUrl();
    sql = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30,
      prepare: false,
    });
    dbInstance = drizzle(sql, { schema });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
    dbInstance = null;
  }
}

export { schema };
export type { Agent, Vendor, Run, Approval, Transaction, AuditLog } from "./schema.js";
export { eq, desc, and, or, inArray } from "drizzle-orm";
