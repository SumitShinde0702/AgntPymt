import { nanoid } from "nanoid";
import { eq } from "@agntpymt/db";
import { getDb, schema } from "@agntpymt/db";
import { logAudit } from "./audit.js";
import { checkHermesHealth, startHermesRun } from "./hermes.js";
import { runPurchaseFlow } from "../simulation/purchase-flow.js";
import { matchVendor } from "../simulation/vendor-matcher.js";

function inferPurchaseFromPrompt(prompt: string, agentCategory: string): string | null {
  const lower = prompt.toLowerCase();
  if (/book|flight|travel|sfo|jfk|hotel/.test(lower)) return prompt;
  if (/order|supply|mouse|office|equipment/.test(lower)) return prompt;
  if (/aws|cloud|invoice/.test(lower)) return prompt;
  if (/research|data|sector|market/.test(lower)) return prompt;
  if (/compute|forecast|batch/.test(lower)) return prompt;
  if (/pay|buy|purchase/.test(lower)) return prompt;
  if (agentCategory === "travel") return `Book travel: ${prompt}`;
  if (agentCategory === "procurement") return `Order supplies: ${prompt}`;
  if (agentCategory === "cloud") return `Pay cloud invoice: ${prompt}`;
  if (agentCategory === "research") return `Buy research data: ${prompt}`;
  return null;
}

export async function executeRun(runId: string, agentId: string, prompt: string) {
  const db = getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId));
  if (!agent) throw new Error("Agent not found");

  await logAudit({
    runId,
    agentId,
    step: "run_started",
    message: `Run started for ${agent.name}`,
    actor: agent.name,
  });

  const hermes = await checkHermesHealth();
  if (hermes.online) {
    const hermesRunId = await startHermesRun(prompt, agent.name);
    if (hermesRunId) {
      await db.update(schema.runs).set({ hermesRunId }).where(eq(schema.runs.id, runId));
      await logAudit({
        runId,
        agentId,
        step: "hermes_delegated",
        message: `Task delegated to Hermes (run ${hermesRunId})`,
        actor: "Hermes",
      });
      // Hermes will call MCP for purchases; local fallback completes run if no MCP call within timeout
      setTimeout(async () => {
        const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
        if (run?.status === "running") {
          await completeRunWithLocalLogic(runId, agentId, prompt, agent.category);
        }
      }, 8000);
      return { mode: "hermes" as const, hermesRunId };
    }
  }

  await logAudit({
    runId,
    agentId,
    step: "local_runner",
    message: "Hermes offline — running local task simulation",
    actor: "AgntPymt",
  });

  await completeRunWithLocalLogic(runId, agentId, prompt, agent.category);
  return { mode: "local" as const };
}

async function completeRunWithLocalLogic(runId: string, agentId: string, prompt: string, agentCategory: string) {
  const db = getDb();

  await logAudit({
    runId,
    agentId,
    step: "planning",
    message: `Analyzing task: "${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}"`,
    actor: "AgntPymt Planner",
  });

  const purchaseIntent = inferPurchaseFromPrompt(prompt, agentCategory);

  if (purchaseIntent) {
    const vendors = await db.select().from(schema.vendors);
    const vendor = matchVendor(vendors, purchaseIntent, agentCategory);
    await logAudit({
      runId,
      agentId,
      step: "planning",
      message: `Identified purchase need → ${vendor.category} via ${vendor.name}`,
      actor: "AgntPymt Planner",
    });

    try {
      const result = await runPurchaseFlow({
        runId,
        agentId,
        purchaseIntent,
        category: agentCategory,
      });

      if (result.status === "pending_approval") {
        await db.update(schema.runs).set({ status: "awaiting_approval" }).where(eq(schema.runs.id, runId));
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Purchase flow failed";
      await logAudit({
        runId,
        agentId,
        step: "run_failed",
        message: `Run stopped — ${message}`,
        actor: "AgntPymt",
      });
      await db.update(schema.runs).set({ status: "failed" }).where(eq(schema.runs.id, runId));
      return;
    }
  } else {
    await logAudit({
      runId,
      agentId,
      step: "task_completed",
      message: "Task completed — no purchase required",
      actor: "AgntPymt",
    });
  }

  await logAudit({
    runId,
    agentId,
    step: "run_completed",
    message: "Run completed successfully",
    actor: "AgntPymt",
  });

  await db
    .update(schema.runs)
    .set({ status: "completed", completedAt: new Date().toISOString() })
    .where(eq(schema.runs.id, runId));
}

export async function createRun(agentId: string, prompt: string, orgId: string) {
  const db = getDb();
  const runId = nanoid();
  await db.insert(schema.runs).values({
    id: runId,
    orgId,
    agentId,
    prompt,
    status: "running",
    hermesRunId: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  });

  void executeRun(runId, agentId, prompt).catch(async (err) => {
    const message = err instanceof Error ? err.message : "Run failed unexpectedly";
    await logAudit({
      runId,
      agentId,
      step: "run_failed",
      message: `Run stopped — ${message}`,
      actor: "AgntPymt",
    });
    await db
      .update(schema.runs)
      .set({ status: "failed", completedAt: new Date().toISOString() })
      .where(eq(schema.runs.id, runId));
  });
  return runId;
}

export async function finalizeRunIfReady(runId: string) {
  const db = getDb();
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
  if (!run || run.status === "completed") return;

  await logAudit({
    runId,
    agentId: run.agentId,
    step: "run_completed",
    message: "Run completed successfully",
    actor: "AgntPymt",
  });

  await db
    .update(schema.runs)
    .set({ status: "completed", completedAt: new Date().toISOString() })
    .where(eq(schema.runs.id, runId));
}
