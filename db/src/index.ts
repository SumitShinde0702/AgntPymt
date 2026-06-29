import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";
import { createLibsqlClient } from "./connection.js";

let client: ReturnType<typeof createLibsqlClient> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!dbInstance) {
    client = createLibsqlClient();
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

export { schema };
export type { Agent, Vendor, Run, Approval, Transaction, AuditLog } from "./schema.js";
export { eq, desc, and, or } from "drizzle-orm";
