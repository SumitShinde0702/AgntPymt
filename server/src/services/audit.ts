import { nanoid } from "nanoid";
import { getDb, schema } from "@agntpymt/db";
import { runEventBus, type RunEvent } from "./event-bus.js";

export async function logAudit(params: {
  runId: string;
  agentId: string;
  step: string;
  message: string;
  actor?: string;
  payload?: Record<string, unknown>;
  source?: string;
}) {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const id = nanoid();

  await db.insert(schema.auditLogs).values({
    id,
    runId: params.runId,
    agentId: params.agentId,
    step: params.step,
    message: params.message,
    actor: params.actor ?? null,
    payload: params.payload ? JSON.stringify(params.payload) : null,
    source: params.source ?? "dashboard",
    createdAt,
  });

  const event: RunEvent = {
    runId: params.runId,
    step: params.step,
    message: params.message,
    actor: params.actor,
    payload: params.payload,
    createdAt,
  };

  runEventBus.emitRunEvent(event);
  return event;
}
