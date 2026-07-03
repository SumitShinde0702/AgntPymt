import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

/** PostgreSQL connection string (local Docker or Cloud SQL via socket). */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return "postgresql://agntpymt:agntpymt@localhost:5432/agntpymt";
  }
  return url;
}

export function isCloudSqlSocketUrl(url: string): boolean {
  return url.includes("/cloudsql/");
}
