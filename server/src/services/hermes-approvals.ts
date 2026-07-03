import { nanoid } from "nanoid";
import { eq, getDb, schema } from "@agntpymt/db";
import { env } from "../config.js";
import { logAudit } from "./audit.js";
import type { HermesRunEvent } from "./hermes.js";

export type HermesApprovalChoice = "once" | "session" | "always" | "deny";

function hermesHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.hermesApiKey) headers.Authorization = `Bearer ${env.hermesApiKey}`;
  return headers;
}

export async function respondToHermesApproval(
  hermesRunId: string,
  choice: HermesApprovalChoice
): Promise<{ resolved: number }> {
  const res = await fetch(`${env.hermesApiUrl}/v1/runs/${hermesRunId}/approval`, {
    method: "POST",
    headers: hermesHeaders(),
    body: JSON.stringify({ choice }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Hermes approval failed (${res.status})`);
  }

  const data = (await res.json()) as { resolved?: number };
  return { resolved: data.resolved ?? 1 };
}

export async function createHermesToolApproval(params: {
  orgId: string;
  agentId: string;
  runId: string;
  hermesRunId: string;
  event: HermesRunEvent;
}) {
  const db = getDb();
  const toolName = String(
    params.event.tool ?? params.event.tool_name ?? params.event.name ?? "tool"
  );
  const command = String(params.event.command ?? params.event.command_preview ?? "").trim();
  const description = String(params.event.description ?? "").trim();
  const reason =
    description ||
    command ||
    `Hermes wants to run ${toolName}`;

  const existing = await db
    .select()
    .from(schema.approvals)
    .where(eq(schema.approvals.runId, params.runId));

  const pending = existing.find(
    (a) => a.status === "pending_approval" && a.kind === "hermes_action"
  );
  if (pending) return pending;

  const approvalId = nanoid();
  const now = new Date().toISOString();

  await db.insert(schema.approvals).values({
    id: approvalId,
    orgId: params.orgId,
    agentId: params.agentId,
    runId: params.runId,
    sellerSessionId: null,
    vendorName: `Hermes · ${toolName}`,
    amountUsd: 0,
    reason,
    status: "pending_approval",
    kind: "hermes_action",
    hermesRunId: params.hermesRunId,
    toolName,
    requestedAt: now,
    resolvedAt: null,
  });

  await db
    .update(schema.runs)
    .set({ status: "awaiting_approval" })
    .where(eq(schema.runs.id, params.runId));

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "hermes_approval",
    message: `Approval needed: ${toolName}${command ? ` — ${command.slice(0, 120)}` : ""}`,
    actor: "Hermes",
    payload: {
      approvalId,
      kind: "hermes_action",
      toolName,
      command,
      hermesRunId: params.hermesRunId,
    },
  });

  return { id: approvalId, toolName, reason };
}

export async function resolveHermesApproval(
  approvalId: string,
  choice: HermesApprovalChoice
) {
  const db = getDb();
  const [approval] = await db
    .select()
    .from(schema.approvals)
    .where(eq(schema.approvals.id, approvalId));

  if (!approval) throw new Error("Approval not found");
  if (approval.kind !== "hermes_action") {
    throw new Error("Not a Hermes tool approval");
  }
  if (approval.status !== "pending_approval") {
    throw new Error("Approval already resolved");
  }
  if (!approval.hermesRunId) {
    throw new Error("Missing Hermes run id");
  }

  const hermesChoice = choice === "deny" ? "deny" : "once";
  await respondToHermesApproval(approval.hermesRunId, hermesChoice);

  const now = new Date().toISOString();
  await db
    .update(schema.approvals)
    .set({
      status: hermesChoice === "deny" ? "denied" : "approved",
      resolvedAt: now,
    })
    .where(eq(schema.approvals.id, approvalId));

  if (approval.runId) {
    await db
      .update(schema.runs)
      .set({ status: "running" })
      .where(eq(schema.runs.id, approval.runId));

    await logAudit({
      runId: approval.runId,
      agentId: approval.agentId,
      step: hermesChoice === "deny" ? "hermes_approval_denied" : "hermes_approval_granted",
      message:
        hermesChoice === "deny"
          ? `Denied Hermes tool: ${approval.toolName ?? approval.vendorName}`
          : `Approved Hermes tool: ${approval.toolName ?? approval.vendorName}`,
      actor: "You",
      payload: { approvalId, choice: hermesChoice },
    });
  }

  return { ok: true, choice: hermesChoice };
}
