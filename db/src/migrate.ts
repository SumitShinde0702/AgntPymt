import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

const migrationSql = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  icon_color TEXT NOT NULL DEFAULT 'violet',
  wallet_address TEXT,
  balance_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_policies (
  agent_id TEXT PRIMARY KEY,
  auto_approve_limit_usd REAL NOT NULL DEFAULT 50,
  require_wallet_confirmation INTEGER NOT NULL DEFAULT 0,
  auto_settlement_enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  list_price_usd REAL NOT NULL,
  counter_price_usd REAL,
  negotiation_style TEXT NOT NULL DEFAULT 'instant'
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  hermes_run_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS seller_sessions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  purchase_intent TEXT NOT NULL,
  quoted_price_usd REAL,
  final_price_usd REAL,
  status TEXT NOT NULL DEFAULT 'negotiating',
  fulfillment_payload TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT,
  seller_session_id TEXT,
  vendor_name TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  requested_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT,
  approval_id TEXT,
  vendor_name TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  step TEXT NOT NULL,
  message TEXT NOT NULL,
  actor TEXT,
  payload TEXT,
  source TEXT NOT NULL DEFAULT 'dashboard',
  created_at TEXT NOT NULL
);
`;

const dbPath = process.env.DATABASE_URL?.replace(/^file:/, "") ?? "dev.db";
const absoluteDbPath = path.isAbsolute(dbPath) ? dbPath : path.join(rootDir, dbPath);

fs.mkdirSync(path.dirname(absoluteDbPath), { recursive: true });

const client = createClient({ url: `file:${absoluteDbPath}` });
await client.executeMultiple(migrationSql);

const alters = [
  `ALTER TABLE organizations ADD COLUMN treasury_wallet_address TEXT`,
  `ALTER TABLE agents ADD COLUMN wallet_provisioned INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE agents ADD COLUMN wallet_private_key TEXT`,
  `ALTER TABLE agent_policies ADD COLUMN negotiation_rules TEXT`,
];
for (const sql of alters) {
  try {
    await client.execute(sql);
  } catch {
    // column already exists
  }
}

client.close();

console.log(`Migrated database at ${absoluteDbPath}`);
