import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

function resolveDbUrl(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  if (url.startsWith("file:")) {
    const relative = url.replace(/^file:/, "");
    const absolute = path.isAbsolute(relative) ? relative : path.join(rootDir, relative);
    return `file:${absolute}`;
  }
  return url;
}

let client: ReturnType<typeof createClient> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!dbInstance) {
    client = createClient({ url: resolveDbUrl() });
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

export { schema };
export { eq, desc, and, or } from "drizzle-orm";
