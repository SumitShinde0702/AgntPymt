import { Router } from "express";
import { eq, desc } from "@agntpymt/db";
import { getDb, schema } from "@agntpymt/db";
import { env } from "../config.js";

export const mcpRouter = Router();

function mcpKeyOk(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  return token === env.mcpServiceKey;
}

mcpRouter.use((req, res, next) => {
  if (!mcpKeyOk(req.headers.authorization)) {
    return res.status(401).json({ error: "Invalid MCP service key" });
  }
  next();
});

async function loadAgent(agentId: string) {
  const db = getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId));
  if (!agent) return null;
  const [policy] = await db
    .select()
    .from(schema.agentPolicies)
    .where(eq(schema.agentPolicies.agentId, agentId));
  return { agent, policy };
}

mcpRouter.get("/active-run", async (req, res) => {
  const agentId = String(req.query.agentId ?? req.headers["x-agent-id"] ?? "");
  if (!agentId) return res.status(400).json({ error: "agentId required" });

  const { getActiveRunId } = await import("../services/run-context.js");
  const runId = await getActiveRunId(agentId);
  res.json({ runId: runId ?? null });
});

mcpRouter.get("/policy", async (req, res) => {
  const agentId = String(req.query.agentId ?? req.headers["x-agent-id"] ?? "");
  if (!agentId) return res.status(400).json({ error: "agentId required" });

  const row = await loadAgent(agentId);
  if (!row) return res.status(404).json({ error: "Agent not found" });

  const { walletPrivateKey: _key, ...agent } = row.agent;
  res.json({ agent, policy: row.policy });
});

mcpRouter.get("/approvals", async (req, res) => {
  const agentId = String(req.query.agentId ?? req.headers["x-agent-id"] ?? "");
  const row = agentId ? await loadAgent(agentId) : null;
  const orgId = row?.agent.orgId;

  const db = getDb();
  const rows = orgId
    ? await db
        .select()
        .from(schema.approvals)
        .where(eq(schema.approvals.orgId, orgId))
        .orderBy(desc(schema.approvals.requestedAt))
    : await db.select().from(schema.approvals).orderBy(desc(schema.approvals.requestedAt));

  const pending = rows.filter((r) => r.status === "pending_approval");
  res.json({ approvals: pending });
});

mcpRouter.get("/transactions", async (req, res) => {
  const agentId = String(req.query.agentId ?? req.headers["x-agent-id"] ?? "");
  const row = agentId ? await loadAgent(agentId) : null;

  const db = getDb();
  const rows = row
    ? await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.agentId, agentId))
        .orderBy(desc(schema.transactions.createdAt))
    : await db.select().from(schema.transactions).orderBy(desc(schema.transactions.createdAt));

  res.json({ transactions: rows });
});
