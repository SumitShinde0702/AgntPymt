import { and, desc, eq, getDb, schema } from "@agntpymt/db";
import { getActiveRunId } from "../services/run-context.js";

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

export async function resolveRunId(agentId: string, args: Record<string, unknown>): Promise<string> {
  if (typeof args.runId === "string" && args.runId.trim()) return args.runId;
  const active = await getActiveRunId(agentId);
  if (active) return active;
  return `mcp_${Date.now()}`;
}

export async function mcpGetAgentPolicy(agentId: string) {
  const row = await loadAgent(agentId);
  if (!row) throw new Error("Agent not found");
  const { walletPrivateKey: _key, ...agent } = row.agent;
  return { agent, policy: row.policy };
}

export async function mcpListApprovals(agentId: string) {
  const row = await loadAgent(agentId);
  const orgId = row?.agent.orgId;
  const db = getDb();
  const rows = orgId
    ? await db
        .select()
        .from(schema.approvals)
        .where(eq(schema.approvals.orgId, orgId))
        .orderBy(desc(schema.approvals.requestedAt))
    : await db.select().from(schema.approvals).orderBy(desc(schema.approvals.requestedAt));
  return { approvals: rows.filter((r) => r.status === "pending_approval") };
}

export async function mcpListTransactions(agentId: string) {
  const row = await loadAgent(agentId);
  const db = getDb();
  const rows = row
    ? await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.agentId, agentId))
        .orderBy(desc(schema.transactions.createdAt))
    : await db.select().from(schema.transactions).orderBy(desc(schema.transactions.createdAt));
  return { transactions: rows };
}

export async function mcpExecutePurchase(params: {
  agentId: string;
  purchaseIntent: string;
  runId: string;
  category?: string;
  resourceId?: string;
  maxBudget?: number;
}) {
  const { runPurchaseFlow } = await import("../simulation/purchase-flow.js");
  try {
    return await runPurchaseFlow({
      runId: params.runId,
      agentId: params.agentId,
      purchaseIntent: params.purchaseIntent,
      category: params.category,
      resourceId: params.resourceId,
      maxBudget: params.maxBudget,
      source: "mcp",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Purchase failed";
    return { status: "error" as const, error: message, runId: params.runId };
  }
}
