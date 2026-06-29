import { eq } from "@agntpymt/db";
import { getDb, schema } from "@agntpymt/db";

export type TenantInfo = {
  orgId: string;
  orgName: string;
  clerkUserId: string;
};

export async function getOrCreateTenant(clerkUserId: string): Promise<TenantInfo> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, clerkUserId))
    .limit(1);

  if (existing) {
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, existing.orgId))
      .limit(1);
    return {
      orgId: existing.orgId,
      orgName: org?.name ?? "Workspace",
      clerkUserId,
    };
  }

  const orgId = `org_${clerkUserId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();

  await db.insert(schema.organizations).values({
    id: orgId,
    name: "My Workspace",
    createdAt: now,
  });

  await db.insert(schema.users).values({
    id: clerkUserId,
    orgId,
    email: null,
    createdAt: now,
  });

  return { orgId, orgName: "My Workspace", clerkUserId };
}
