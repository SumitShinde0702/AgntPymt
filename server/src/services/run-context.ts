import { and, desc, eq, getDb, schema } from "@agntpymt/db";

const activeRunByAgent = new Map<string, string>();

export function setActiveRun(agentId: string, runId: string) {
  activeRunByAgent.set(agentId, runId);
}

export function clearActiveRun(agentId: string, runId?: string) {
  if (runId && activeRunByAgent.get(agentId) !== runId) return;
  activeRunByAgent.delete(agentId);
}

/** Same-process cache + DB lookup so Hermes MCP subprocess finds the dashboard run. */
export async function getActiveRunId(agentId: string): Promise<string | undefined> {
  const cached = activeRunByAgent.get(agentId);
  if (cached) return cached;

  const db = getDb();
  const [run] = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(eq(schema.runs.agentId, agentId), eq(schema.runs.status, "running")))
    .orderBy(desc(schema.runs.createdAt))
    .limit(1);

  return run?.id;
}
