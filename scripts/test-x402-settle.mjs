/**
 * Diagnose x402 settlement against the running API server.
 * Usage: node scripts/test-x402-settle.mjs [agentId]
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

const agentId = process.argv[2] ?? "agent_1782747879372";

async function main() {
  const { getDb, schema, eq } = await import("@agntpymt/db");
  const { settleViaX402, registerPendingX402Settlement } = await import(
    "../server/src/chain/x402.ts"
  );
  const { fetchWalletBalances } = await import("../server/src/chain/wallet.ts");
  const { nanoid } = await import("nanoid");

  getDb();
  const db = getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId));
  if (!agent?.walletPrivateKey) {
    console.error("Agent or wallet not found:", agentId);
    process.exit(1);
  }

  const balances = await fetchWalletBalances(agent.walletAddress);
  console.log("Wallet:", agent.walletAddress);
  console.log("Balances:", balances);

  const sessionId = `diag_${nanoid()}`;
  await db.insert(schema.sellerSessions).values({
    id: sessionId,
    runId: "diag_run",
    vendorId: "vendor_marketdata",
    purchaseIntent: "x402 diagnostic",
    quotedPriceUsd: 0.01,
    finalPriceUsd: 0.01,
    status: "settling",
    fulfillmentPayload: null,
    createdAt: new Date().toISOString(),
  });

  registerPendingX402Settlement(sessionId, 0.01);
  try {
    const result = await settleViaX402(agent.walletPrivateKey, sessionId, 0.01);
    console.log("SUCCESS:", result);
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
