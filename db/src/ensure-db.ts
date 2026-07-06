import postgres from "postgres";
import { resolveDatabaseUrl } from "./connection.js";

const url = new URL(resolveDatabaseUrl());
const dbName = url.pathname.replace(/^\//, "");
url.pathname = "/postgres";

const admin = postgres(url.toString(), { max: 1, prepare: false });
try {
  const rows = await admin<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${dbName}) AS exists
  `;
  if (!rows[0]?.exists) {
    await admin.unsafe(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    console.log(`Created database "${dbName}"`);
  } else {
    console.log(`Database "${dbName}" already exists`);
  }
} finally {
  await admin.end({ timeout: 5 });
}
