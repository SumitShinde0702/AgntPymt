import { Router } from "express";
import { eq, desc, and, getDb, schema, inArray, type AuditLog } from "@agntpymt/db";
import { z } from "zod";
import { env } from "../config.js";
import { checkHermesHealth } from "../services/hermes.js";
import { createRun } from "../services/run-orchestrator.js";
import { runEventBus } from "../services/event-bus.js";
import { approveAndSettle, denyApproval } from "../simulation/purchase-flow.js";
import {
  ensureAllAgentWallets,
  getWalletsOverview,
  provisionAgentWallet,
  setTreasuryWallet,
} from "../services/agent-wallet.js";
import { suggestAgentProfile } from "../services/agent-profile-ai.js";
import { authEnabled, getOrgId } from "../middleware/auth.js";
import { getOrCreateTenant } from "../services/tenant.js";
import { getAuth } from "@clerk/express";

export const apiRouter = Router();

apiRouter.get("/me", async (req, res) => {
  const orgId = getOrgId(req);
  if (!authEnabled) {
    return res.json({
      authEnabled: false,
      orgId,
      orgName: "Demo Organization",
      userId: null,
    });
  }
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const tenant = await getOrCreateTenant(userId);
  res.json({
    authEnabled: true,
    orgId: tenant.orgId,
    orgName: tenant.orgName,
    userId,
  });
});

apiRouter.get("/health", async (_req, res) => {
  const hermes = await checkHermesHealth();
  res.json({
    status: "ok",
    daemon: hermes.online ? "running" : "degraded",
    hermes,
    simulatePayments: env.simulatePayments,
    demoTransactionFeeUsd: env.demoTransactionFeeUsd,
    aiNegotiation: Boolean(env.openaiApiKey),
    paymentMode: env.simulatePayments ? "simulated" : "x402",
    facilitatorUrl: env.facilitatorUrl,
    network: "Base Sepolia",
  });
});

/** x402-protected vendor settlement — payment handled by x402 middleware before this runs. */
apiRouter.post("/x402/vendor/settle/:sessionId", async (req, res) => {
  res.json({
    ok: true,
    protocol: "x402",
    sessionId: req.params.sessionId,
  });
});

apiRouter.get("/wallets", async (req, res) => {
  const data = await getWalletsOverview(getOrgId(req));
  res.json(data);
});

const treasurySchema = z.object({
  address: z.string().nullable(),
});

apiRouter.patch("/treasury", async (req, res) => {
  const parsed = treasurySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  await setTreasuryWallet(parsed.data.address, getOrgId(req));
  const data = await getWalletsOverview(getOrgId(req));
  res.json(data);
});

apiRouter.get("/dashboard", async (req, res) => {
  const orgId = getOrgId(req);
  await ensureAllAgentWallets(orgId);
  const db = getDb();
  const agents = await db.select().from(schema.agents).where(eq(schema.agents.orgId, orgId));
  const approvals = await db
    .select()
    .from(schema.approvals)
    .where(and(eq(schema.approvals.orgId, orgId), eq(schema.approvals.status, "pending_approval")));
  const transactions = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.orgId, orgId))
    .orderBy(desc(schema.transactions.createdAt))
    .limit(5);

  const totalBalance = agents.reduce((sum, a) => sum + a.balanceUsd, 0);
  const activeAgents = agents.filter((a) => a.status === "active").length;
  const spend30Days = transactions.reduce((sum, t) => sum + t.amountUsd, 0);

  res.json({
    kpis: {
      totalBalanceUsd: totalBalance,
      activeAgents: `${activeAgents} of ${agents.length}`,
      pendingApprovals: approvals.length,
      spend30DaysUsd: spend30Days,
    },
    agents: agents.map(stripAgentSecrets),
    pendingApprovals: approvals,
    recentTransactions: transactions,
    activeWallets: agents.filter((a) => a.walletProvisioned && a.walletAddress).length,
  });
});

function stripAgentSecrets<T extends { walletPrivateKey?: string | null }>(agent: T) {
  const { walletPrivateKey: _key, ...safe } = agent;
  return safe;
}

async function agentIdsForOrg(orgId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.orgId, orgId));
  return rows.map((r) => r.id);
}

apiRouter.get("/policies", async (_req, res) => {
  const db = getDb();
  const rows = await db.select().from(schema.agentPolicies);
  res.json(rows);
});

const patchPolicySchema = z.object({
  autoApproveLimitUsd: z.number().positive().optional(),
  negotiationRules: z.string().nullable().optional(),
});

apiRouter.patch("/agents/:id/policy", async (req, res) => {
  const parsed = patchPolicySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const db = getDb();
  const orgId = getOrgId(req);
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, req.params.id));
  if (!agent || agent.orgId !== orgId) return res.status(404).json({ error: "Not found" });

  const updates: Record<string, number | string | null> = {};
  if (parsed.data.autoApproveLimitUsd != null) {
    updates.autoApproveLimitUsd = parsed.data.autoApproveLimitUsd;
  }
  if (parsed.data.negotiationRules !== undefined) {
    updates.negotiationRules = parsed.data.negotiationRules;
  }

  await db
    .update(schema.agentPolicies)
    .set(updates)
    .where(eq(schema.agentPolicies.agentId, req.params.id));

  const [policy] = await db
    .select()
    .from(schema.agentPolicies)
    .where(eq(schema.agentPolicies.agentId, req.params.id));
  res.json(policy);
});

apiRouter.get("/agents", async (req, res) => {
  const orgId = getOrgId(req);
  await ensureAllAgentWallets(orgId);
  const db = getDb();
  const agents = await db.select().from(schema.agents).where(eq(schema.agents.orgId, orgId));
  res.json(agents.map(stripAgentSecrets));
});

apiRouter.get("/agents/:id", async (req, res) => {
  const db = getDb();
  const orgId = getOrgId(req);
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, req.params.id));
  if (!agent || agent.orgId !== orgId) return res.status(404).json({ error: "Not found" });
  const [policy] = await db
    .select()
    .from(schema.agentPolicies)
    .where(eq(schema.agentPolicies.agentId, agent.id));
  res.json({ ...stripAgentSecrets(agent), policy });
});

const iconColorSchema = z.enum(["violet", "blue", "green", "orange"]);

const suggestAgentSchema = z.object({
  prompt: z.string().min(1),
});

apiRouter.post("/agents/suggest", async (req, res) => {
  const parsed = suggestAgentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const suggestion = await suggestAgentProfile(parsed.data.prompt);
    res.json({ ...suggestion, aiEnabled: Boolean(env.openaiApiKey) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

const createAgentSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  iconColor: iconColorSchema.optional(),
  negotiationRules: z.string().optional(),
  autoApproveLimitUsd: z.number().positive().optional(),
});

apiRouter.post("/agents", async (req, res) => {
  const parsed = createAgentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const db = getDb();
  const orgId = getOrgId(req);
  const id = `agent_${Date.now()}`;
  const row = {
    id,
    orgId,
    name: parsed.data.name,
    category: parsed.data.category,
    description: parsed.data.description ?? null,
    status: "active",
    iconColor: parsed.data.iconColor ?? "violet",
    walletAddress: null,
    balanceUsd: 0,
    createdAt: new Date().toISOString(),
  };

  await db.insert(schema.agents).values(row);
  await db.insert(schema.agentPolicies).values({
    agentId: id,
    autoApproveLimitUsd: parsed.data.autoApproveLimitUsd ?? 0.05,
    negotiationRules: parsed.data.negotiationRules?.trim() || null,
  });
  await provisionAgentWallet(id);
  const [created] = await db.select().from(schema.agents).where(eq(schema.agents.id, id));
  res.status(201).json(created ? stripAgentSecrets(created) : row);
});

const patchAgentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

apiRouter.patch("/agents/:id", async (req, res) => {
  const parsed = patchAgentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const db = getDb();
  const orgId = getOrgId(req);
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, req.params.id));
  if (!agent || agent.orgId !== orgId) return res.status(404).json({ error: "Not found" });

  const updates: Record<string, string | null> = {};
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  await db.update(schema.agents).set(updates).where(eq(schema.agents.id, req.params.id));
  const [updated] = await db.select().from(schema.agents).where(eq(schema.agents.id, req.params.id));
  res.json(updated ? stripAgentSecrets(updated) : null);
});

apiRouter.get("/vendors", async (_req, res) => {
  const db = getDb();
  const vendors = await db.select().from(schema.vendors);
  res.json(vendors);
});

apiRouter.get("/approvals", async (req, res) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.approvals)
    .where(eq(schema.approvals.orgId, getOrgId(req)))
    .orderBy(desc(schema.approvals.requestedAt));
  res.json(rows);
});

apiRouter.post("/approvals/:id/approve", async (req, res) => {
  try {
    const db = getDb();
    const orgId = getOrgId(req);
    const [approval] = await db
      .select()
      .from(schema.approvals)
      .where(eq(schema.approvals.id, req.params.id));
    if (!approval || approval.orgId !== orgId) {
      return res.status(404).json({ error: "Not found" });
    }
    const result = await approveAndSettle(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

apiRouter.post("/approvals/:id/deny", async (req, res) => {
  const db = getDb();
  const orgId = getOrgId(req);
  const [approval] = await db
    .select()
    .from(schema.approvals)
    .where(eq(schema.approvals.id, req.params.id));
  if (!approval || approval.orgId !== orgId) {
    return res.status(404).json({ error: "Not found" });
  }
  await denyApproval(req.params.id);
  res.json({ ok: true });
});

apiRouter.get("/transactions", async (req, res) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.orgId, getOrgId(req)))
    .orderBy(desc(schema.transactions.createdAt));
  res.json(rows);
});

apiRouter.get("/logs", async (req, res) => {
  const db = getDb();
  const orgId = getOrgId(req);
  const allowedAgentIds = await agentIdsForOrg(orgId);
  const runId = req.query.runId as string | undefined;
  const agentId = req.query.agentId as string | undefined;

  if (agentId && !allowedAgentIds.includes(agentId)) {
    return res.status(404).json({ error: "Not found" });
  }

  let rows: AuditLog[] = [];
  if (runId) {
    rows = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.runId, runId))
      .orderBy(schema.auditLogs.createdAt);
    rows = rows.filter((r) => allowedAgentIds.includes(r.agentId));
  } else if (agentId) {
    rows = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.agentId, agentId))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(100);
  } else if (allowedAgentIds.length > 0) {
    rows = await db
      .select()
      .from(schema.auditLogs)
      .where(inArray(schema.auditLogs.agentId, allowedAgentIds))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(100);
  } else {
    rows = [];
  }

  res.json(rows);
});

const runSchema = z.object({
  agentId: z.string(),
  prompt: z.string().min(1),
});

apiRouter.post("/agent/run", async (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const db = getDb();
  const orgId = getOrgId(req);
  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.id, parsed.data.agentId));
  if (!agent || agent.orgId !== orgId) {
    return res.status(404).json({ error: "Agent not found" });
  }

  const runId = await createRun(parsed.data.agentId, parsed.data.prompt, orgId);
  res.status(202).json({ runId });
});

apiRouter.get("/agent/run/:runId/events", (req, res) => {
  const { runId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = runEventBus.subscribe(runId, send);

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15_000);

  void getDb()
    .select()
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.runId, runId))
    .orderBy(schema.auditLogs.createdAt)
    .then((existing) => {
      for (const log of existing) {
        send({
          runId: log.runId,
          step: log.step,
          message: log.message,
          actor: log.actor,
          payload: log.payload ? JSON.parse(log.payload) : undefined,
          createdAt: log.createdAt,
        });
      }
    });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

const purchaseSchema = z.object({
  agentId: z.string(),
  purchaseIntent: z.string(),
  runId: z.string().optional(),
  category: z.string().optional(),
  resourceId: z.string().optional(),
  maxBudget: z.number().optional(),
});

apiRouter.post("/agent/execute", async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { runPurchaseFlow } = await import("../simulation/purchase-flow.js");
  const runId = parsed.data.runId ?? `mcp_${Date.now()}`;
  const result = await runPurchaseFlow({
    runId,
    agentId: parsed.data.agentId,
    purchaseIntent: parsed.data.purchaseIntent,
    category: parsed.data.category,
    resourceId: parsed.data.resourceId,
    maxBudget: parsed.data.maxBudget,
    source: "mcp",
  });

  res.json(result);
});

apiRouter.post("/agents/:id/topup", async (req, res) => {
  const amount = Number(req.body.amount ?? 0);
  if (amount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const db = getDb();
  const orgId = getOrgId(req);
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, req.params.id));
  if (!agent || agent.orgId !== orgId) return res.status(404).json({ error: "Not found" });

  const { fetchWalletBalances } = await import("../chain/wallet.js");
  const onChain = agent.walletAddress
    ? await fetchWalletBalances(agent.walletAddress)
    : { eth: 0, usdc: 0 };

  await db
    .update(schema.agents)
    .set({ balanceUsd: onChain.usdc })
    .where(eq(schema.agents.id, req.params.id));

  res.json({ ok: true, onChainUsdc: onChain.usdc });
});
