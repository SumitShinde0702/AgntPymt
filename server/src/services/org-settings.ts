import { eq } from "@agntpymt/db";
import { getDb, schema } from "@agntpymt/db";
import { env } from "../config.js";

export type OrgSettings = {
  agentsPaused: boolean;
  maxExposureLimitUsd: number | null;
};

export async function getOrgSettings(orgId: string = env.orgId): Promise<OrgSettings> {
  const db = getDb();
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId));
  return {
    agentsPaused: org?.agentsPaused ?? false,
    maxExposureLimitUsd: org?.maxExposureLimitUsd ?? null,
  };
}

export async function updateOrgSettings(
  patch: Partial<OrgSettings>,
  orgId: string = env.orgId
): Promise<OrgSettings> {
  const db = getDb();
  const updates: Record<string, boolean | number | null> = {};
  if (patch.agentsPaused !== undefined) updates.agentsPaused = patch.agentsPaused;
  if (patch.maxExposureLimitUsd !== undefined) updates.maxExposureLimitUsd = patch.maxExposureLimitUsd;

  if (Object.keys(updates).length > 0) {
    await db.update(schema.organizations).set(updates).where(eq(schema.organizations.id, orgId));
  }
  return getOrgSettings(orgId);
}

/** Effective auto-approve = min(agent limit, org ceiling). Ceiling null = no org cap. */
export function effectiveAutoApproveLimit(
  agentLimitUsd: number,
  maxExposureLimitUsd: number | null
): number {
  if (maxExposureLimitUsd == null) return agentLimitUsd;
  return Math.min(agentLimitUsd, maxExposureLimitUsd);
}
