import { eq } from "@agntpymt/db";
import { getDb, schema } from "@agntpymt/db";
import { env } from "../config.js";

export type OrgSettings = {
  agentsPaused: boolean;
};

export async function getOrgSettings(orgId: string = env.orgId): Promise<OrgSettings> {
  const db = getDb();
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId));
  return {
    agentsPaused: org?.agentsPaused ?? false,
  };
}

export async function updateOrgSettings(
  patch: Partial<OrgSettings>,
  orgId: string = env.orgId
): Promise<OrgSettings> {
  const db = getDb();
  if (patch.agentsPaused !== undefined) {
    await db
      .update(schema.organizations)
      .set({ agentsPaused: patch.agentsPaused })
      .where(eq(schema.organizations.id, orgId));
  }
  return getOrgSettings(orgId);
}
