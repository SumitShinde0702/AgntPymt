import { eq } from "drizzle-orm";
import { getDb, schema, closeDb } from "./index.js";

const ORG_ID = "org_demo";
const now = () => new Date().toISOString();

const VENDOR_ROWS = [
  {
    id: "vendor_marketdata",
    name: "MarketData Co. Agent",
    category: "research",
    description: "Premium market data and sector reports",
    listPriceUsd: 0.02,
    counterPriceUsd: 0.01,
    negotiationStyle: "single_round",
  },
  {
    id: "vendor_expedia",
    name: "Expedia Agent",
    category: "travel",
    description: "Flight and hotel bookings",
    listPriceUsd: 0.04,
    counterPriceUsd: 0.02,
    negotiationStyle: "single_round",
  },
  {
    id: "vendor_amazon",
    name: "Amazon Business Agent",
    category: "procurement",
    description: "Office supplies and equipment",
    listPriceUsd: 0.01,
    counterPriceUsd: null,
    negotiationStyle: "instant",
  },
  {
    id: "vendor_aws",
    name: "AWS Vendor Agent",
    category: "cloud",
    description: "Cloud infrastructure invoices",
    listPriceUsd: 0.1,
    counterPriceUsd: 0.08,
    negotiationStyle: "single_round",
  },
  {
    id: "vendor_cloudbatch",
    name: "CloudBatch Vendor Agent",
    category: "compute",
    description: "Batch compute and forecasting jobs",
    listPriceUsd: 0.06,
    counterPriceUsd: 0.04,
    negotiationStyle: "single_round",
  },
  {
    id: "vendor_openmarket",
    name: "OpenMarket Agent",
    category: "generic",
    description: "General marketplace fallback",
    listPriceUsd: 0.01,
    counterPriceUsd: null,
    negotiationStyle: "instant",
  },
] as const;

async function ensureVendors(db: ReturnType<typeof getDb>) {
  await db.insert(schema.vendors).values([...VENDOR_ROWS]);
}

async function seed() {
  const db = getDb();

  const existingVendors = await db.select({ id: schema.vendors.id }).from(schema.vendors).limit(1);
  if (existingVendors.length === 0) {
    await ensureVendors(db);
    console.log("Seeded vendors (were missing).");
  }

  const existing = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ORG_ID))
    .limit(1);

  if (existing.length > 0) {
    console.log("Demo org already seeded, skipping agents/approvals.");
    return;
  }

  await db.delete(schema.auditLogs);
  await db.delete(schema.transactions);
  await db.delete(schema.approvals);
  await db.delete(schema.sellerSessions);
  await db.delete(schema.runs);
  await db.delete(schema.agentPolicies);
  await db.delete(schema.agents);
  await db.delete(schema.vendors);
  await db.delete(schema.organizations);

  await db.insert(schema.organizations).values({
    id: ORG_ID,
    name: "Demo Organization",
    createdAt: now(),
  });

  const agentRows = [
    {
      id: "agent_research",
      orgId: ORG_ID,
      name: "Research Agent",
      category: "research",
      description: "Sector research and market intelligence",
      status: "active",
      iconColor: "violet",
      walletAddress: null,
      walletProvisioned: false,
      balanceUsd: 0,
      createdAt: now(),
    },
    {
      id: "agent_procurement",
      orgId: ORG_ID,
      name: "Procurement Agent",
      category: "procurement",
      description: "Office supplies and vendor orders",
      status: "active",
      iconColor: "blue",
      walletAddress: null,
      walletProvisioned: false,
      balanceUsd: 0,
      createdAt: now(),
    },
    {
      id: "agent_travel",
      orgId: ORG_ID,
      name: "Travel Agent",
      category: "travel",
      description: "Flights, hotels, and travel bookings",
      status: "active",
      iconColor: "green",
      walletAddress: null,
      walletProvisioned: false,
      balanceUsd: 0,
      createdAt: now(),
    },
    {
      id: "agent_cloud",
      orgId: ORG_ID,
      name: "Cloud Ops Agent",
      category: "cloud",
      description: "Cloud infrastructure and vendor bills",
      status: "active",
      iconColor: "orange",
      walletAddress: null,
      walletProvisioned: false,
      balanceUsd: 0,
      createdAt: now(),
    },
  ];

  await db.insert(schema.agents).values(agentRows);

const POLICY_RULES: Record<string, string> = {
  agent_research:
    "You buy sector research and market data. Counter at the micro-payment target ($0.01) when quotes are above that. Stay under the auto-approve limit unless the data is critical.",
  agent_procurement:
    "You procure office supplies. Prefer instant buys at list price when under $0.02. Be concise and cost-conscious.",
  agent_travel:
    "You book travel. Negotiate politely — aim for the lowest fare but accept vendor floor prices when reasonable.",
  agent_cloud:
    "You pay cloud invoices. Negotiate firmly on large quotes. Anything above the auto-approve limit must escalate to a human.",
};

  for (const agent of agentRows) {
    await db.insert(schema.agentPolicies).values({
      agentId: agent.id,
      autoApproveLimitUsd: 0.05,
      requireWalletConfirmation: false,
      autoSettlementEnabled: true,
      negotiationRules: POLICY_RULES[agent.id] ?? null,
    });
  }

  await ensureVendors(db);

  await db.insert(schema.approvals).values([
    {
      id: "approval_1",
      orgId: ORG_ID,
      agentId: "agent_cloud",
      runId: null,
      sellerSessionId: null,
      vendorName: "AWS Vendor Agent",
      amountUsd: 0.08,
      reason: "Pay AWS — monthly cloud infrastructure invoice",
      status: "pending_approval",
      requestedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "approval_2",
      orgId: ORG_ID,
      agentId: "agent_procurement",
      runId: null,
      sellerSessionId: null,
      vendorName: "Amazon Business Agent",
      amountUsd: 0.06,
      reason: "Bulk order — ergonomic equipment for new hires",
      status: "pending_approval",
      requestedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
  ]);

  await db.insert(schema.transactions).values([
    {
      id: "tx_1",
      orgId: ORG_ID,
      agentId: "agent_travel",
      runId: null,
      approvalId: null,
      vendorName: "Expedia Agent",
      description: "Travel Agent → Expedia",
      amountUsd: 0.02,
      status: "completed",
      txHash: null,
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
    {
      id: "tx_2",
      orgId: ORG_ID,
      agentId: "agent_research",
      runId: null,
      approvalId: null,
      vendorName: "MarketData Co. Agent",
      description: "Research Agent → MarketData Co.",
      amountUsd: 0.01,
      status: "completed",
      txHash: null,
      createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    },
    {
      id: "tx_3",
      orgId: ORG_ID,
      agentId: "agent_cloud",
      runId: null,
      approvalId: null,
      vendorName: "AWS Vendor Agent",
      description: "Cloud Ops Agent → AWS",
      amountUsd: 0.08,
      status: "pending",
      txHash: null,
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: "tx_4",
      orgId: ORG_ID,
      agentId: "agent_procurement",
      runId: null,
      approvalId: null,
      vendorName: "Amazon Business Agent",
      description: "Procurement Agent → Amazon Business",
      amountUsd: 0.01,
      status: "completed",
      txHash: null,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  ]);

  console.log("Seeded demo organization, agents, vendors, approvals, and transactions.");
}

seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());
