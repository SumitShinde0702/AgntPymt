import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  treasuryWalletAddress: text("treasury_wallet_address"),
  createdAt: text("created_at").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  iconColor: text("icon_color").notNull().default("violet"),
  walletAddress: text("wallet_address"),
  walletPrivateKey: text("wallet_private_key"),
  walletProvisioned: integer("wallet_provisioned", { mode: "boolean" }).notNull().default(false),
  balanceUsd: real("balance_usd").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const agentPolicies = sqliteTable("agent_policies", {
  agentId: text("agent_id").primaryKey(),
  autoApproveLimitUsd: real("auto_approve_limit_usd").notNull().default(50),
  requireWalletConfirmation: integer("require_wallet_confirmation", { mode: "boolean" }).notNull().default(false),
  autoSettlementEnabled: integer("auto_settlement_enabled", { mode: "boolean" }).notNull().default(true),
  negotiationRules: text("negotiation_rules"),
});

export const vendors = sqliteTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  listPriceUsd: real("list_price_usd").notNull(),
  counterPriceUsd: real("counter_price_usd"),
  negotiationStyle: text("negotiation_style").notNull().default("instant"),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  agentId: text("agent_id").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull().default("running"),
  hermesRunId: text("hermes_run_id"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const sellerSessions = sqliteTable("seller_sessions", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  vendorId: text("vendor_id").notNull(),
  purchaseIntent: text("purchase_intent").notNull(),
  quotedPriceUsd: real("quoted_price_usd"),
  finalPriceUsd: real("final_price_usd"),
  status: text("status").notNull().default("negotiating"),
  fulfillmentPayload: text("fulfillment_payload"),
  createdAt: text("created_at").notNull(),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  agentId: text("agent_id").notNull(),
  runId: text("run_id"),
  sellerSessionId: text("seller_session_id"),
  vendorName: text("vendor_name").notNull(),
  amountUsd: real("amount_usd").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending_approval"),
  requestedAt: text("requested_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  agentId: text("agent_id").notNull(),
  runId: text("run_id"),
  approvalId: text("approval_id"),
  vendorName: text("vendor_name").notNull(),
  description: text("description").notNull(),
  amountUsd: real("amount_usd").notNull(),
  status: text("status").notNull(),
  txHash: text("tx_hash"),
  createdAt: text("created_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  agentId: text("agent_id").notNull(),
  step: text("step").notNull(),
  message: text("message").notNull(),
  actor: text("actor"),
  payload: text("payload"),
  source: text("source").notNull().default("dashboard"),
  createdAt: text("created_at").notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
