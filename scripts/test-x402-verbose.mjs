/** Step-by-step x402 debug — logs 402 body, payment headers, second response. */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

const port = Number(process.env.PORT ?? 3001);
const agentId = process.argv[2] ?? "agent_1782747879372";

async function main() {
  const { getDb, schema, eq } = await import("@agntpymt/db");
  const { registerPendingX402Settlement } = await import("../server/src/chain/x402.ts");
  const { nanoid } = await import("nanoid");

  getDb();
  const db = getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId));
  if (!agent?.walletPrivateKey) throw new Error("no agent wallet");

  const sessionId = `diag_${nanoid()}`;
  await db.insert(schema.sellerSessions).values({
    id: sessionId,
    runId: "diag_run",
    vendorId: "vendor_marketdata",
    purchaseIntent: "x402 verbose diagnostic",
    quotedPriceUsd: 0.01,
    finalPriceUsd: 0.01,
    status: "settling",
    fulfillmentPayload: null,
    createdAt: new Date().toISOString(),
  });

  registerPendingX402Settlement(sessionId, 0.01);
  const url = `http://127.0.0.1:${port}/api/x402/vendor/settle/${sessionId}`;
  const body = JSON.stringify({ sessionId });

  const r1 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  console.log("--- First response ---");
  console.log("status:", r1.status);
  for (const [k, v] of r1.headers.entries()) {
    if (k.toLowerCase().includes("payment")) console.log(`header ${k}:`, v.slice(0, 200));
  }
  const text1 = await r1.text();
  console.log("body:", text1.slice(0, 2000));

  const account = privateKeyToAccount(agent.walletPrivateKey);
  const core = new x402Client().register("eip155:*", new ExactEvmScheme(account));
  const httpClient = new x402HTTPClient(core);

  let paymentRequired;
  try {
    paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => r1.headers.get(name),
      text1 ? JSON.parse(text1) : undefined
    );
    console.log("paymentRequired:", JSON.stringify(paymentRequired, null, 2).slice(0, 3000));
  } catch (e) {
    console.error("parse paymentRequired failed:", e);
    process.exit(1);
  }

  let payload;
  try {
    payload = await core.createPaymentPayload(paymentRequired);
    console.log("payment payload created");
  } catch (e) {
    console.error("createPaymentPayload failed:", e);
    process.exit(1);
  }

  const payHeaders = httpClient.encodePaymentSignatureHeader(payload);
  const r2 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...payHeaders },
    body,
  });
  console.log("--- Second response ---");
  console.log("status:", r2.status);
  for (const [k, v] of r2.headers.entries()) {
    if (k.toLowerCase().includes("payment")) console.log(`header ${k}:`, v.slice(0, 400));
  }
  console.log("body:", (await r2.text()).slice(0, 2000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
