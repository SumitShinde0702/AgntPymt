import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

export function resolveDbUrl(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  if (url.startsWith("file:")) {
    const relative = url.replace(/^file:/, "");
    const absolute = path.isAbsolute(relative) ? relative : path.join(rootDir, relative);
    return `file:${absolute}`;
  }
  return url;
}

export function createLibsqlClient() {
  const url = resolveDbUrl();
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (authToken) {
    return createClient({ url, authToken });
  }
  return createClient({ url });
}

export function ensureLocalDbDir() {
  const url = resolveDbUrl();
  if (!url.startsWith("file:")) return;
  const dbPath = url.replace(/^file:/, "");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
