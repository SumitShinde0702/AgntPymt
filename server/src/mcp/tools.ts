import { and, desc, eq, getDb, schema } from "@agntpymt/db";
import { getActiveRunId } from "../services/run-context.js";

const DEFAULT_AGENT_ID = process.env.AGENT_ID ?? "";

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

/** HTTP MCP does not inherit Hermes mcp_servers.env — resolve agentId from args, runId, or active run. */
export async function resolveAgentId(args: Record<string, unknown>): Promise<string> {
  const fromArgs = args.agentId ?? args.agent_id;
  if (typeof fromArgs === "string" && fromArgs.trim()) return fromArgs.trim();
  if (DEFAULT_AGENT_ID.trim()) return DEFAULT_AGENT_ID.trim();

  const runId = args.runId ?? args.run_id;
  if (typeof runId === "string" && runId.trim()) {
    const db = getDb();
    const [run] = await db
      .select({ agentId: schema.runs.agentId })
      .from(schema.runs)
      .where(eq(schema.runs.id, runId.trim()))
      .limit(1);
    if (run?.agentId) return run.agentId;
  }

  const db = getDb();
  const [active] = await db
    .select({ agentId: schema.runs.agentId })
    .from(schema.runs)
    .where(eq(schema.runs.status, "running"))
    .orderBy(desc(schema.runs.createdAt))
    .limit(1);
  if (active?.agentId) return active.agentId;

  throw new Error("agentId is required (pass agentId or runId in tool args)");
}

export async function resolveRunId(agentId: string, args: Record<string, unknown>): Promise<string> {
  if (typeof args.runId === "string" && args.runId.trim()) return args.runId;
  if (typeof args.run_id === "string" && args.run_id.trim()) return args.run_id;
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
