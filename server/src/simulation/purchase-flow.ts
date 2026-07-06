import { nanoid } from "nanoid";
import { eq } from "@agntpymt/db";
import { getDb, schema, type Vendor } from "@agntpymt/db";
import { env } from "../config.js";
import { logAudit } from "../services/audit.js";
import { matchVendor, buildFulfillment } from "./vendor-matcher.js";
import { formatUsdc } from "./pricing.js";
import { settleViaX402 } from "../chain/x402.js";
import { generateNegotiationMessage, type TranscriptLine } from "../services/negotiation-ai.js";
import { recordBuyerRatesSeller } from "../services/erc8004.js";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAgentPolicy(agentId: string) {
  const db = getDb();
  const [policy] = await db
    .select()
    .from(schema.agentPolicies)
    .where(eq(schema.agentPolicies.agentId, agentId));
  return policy ?? {
    autoApproveLimitUsd: 0.05,
    requireWalletConfirmation: false,
    autoSettlementEnabled: true,
    negotiationRules: null,
  };
}

async function getAgent(agentId: string) {
  const db = getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId));
  return agent;
}

export type PurchaseParams = {
  runId: string;
  agentId: string;
  purchaseIntent: string;
  category?: string;
  resourceId?: string;
  maxBudget?: number;
  source?: string;
  /** When true (default), skip scripted vendor chat — Hermes or the user owns conversation. */
  settlementOnly?: boolean;
};

function resolveFinalPrice(
  vendor: Vendor,
  params: PurchaseParams,
  listPrice: number
): number {
  let finalPrice = listPrice;
  if (params.maxBudget != null && params.maxBudget < finalPrice) {
    finalPrice = params.maxBudget;
  }

  const agentTarget =
    params.maxBudget != null
      ? Math.min(params.maxBudget, env.demoTransactionFeeUsd)
      : env.demoTransactionFeeUsd;

  if (finalPrice > agentTarget && vendor.negotiationStyle !== "instant") {
    if (vendor.counterPriceUsd != null && agentTarget < vendor.counterPriceUsd) {
      finalPrice = vendor.counterPriceUsd;
    } else {
      finalPrice = agentTarget;
    }
  }

  return finalPrice;
}

export async function runPurchaseFlow(params: PurchaseParams) {
  const db = getDb();
  const agent = await getAgent(params.agentId);
  if (!agent) throw new Error("Agent not found");

  const vendors = await db.select().from(schema.vendors);
  const vendor = matchVendor(vendors, params.purchaseIntent, params.category ?? agent.category, params.resourceId);
  const policy = await getAgentPolicy(params.agentId);
  const settlementOnly = params.settlementOnly ?? !env.openaiApiKey;

  const sessionId = nanoid();
  const createdAt = new Date().toISOString();

  await db.insert(schema.sellerSessions).values({
    id: sessionId,
    runId: params.runId,
    vendorId: vendor.id,
    purchaseIntent: params.purchaseIntent,
    quotedPriceUsd: null,
    finalPriceUsd: null,
    status: "negotiating",
    fulfillmentPayload: null,
    createdAt,
  });

  let finalPrice = vendor.listPriceUsd;

  if (settlementOnly) {
    await logAudit({
      runId: params.runId,
      agentId: params.agentId,
      step: "purchase_intent",
      message: `Purchase: ${params.purchaseIntent}`,
      actor: agent.name,
      source: params.source,
    });

    await logAudit({
      runId: params.runId,
      agentId: params.agentId,
      step: "vendor_matched",
      message: `${vendor.name} · list price ${formatUsdc(vendor.listPriceUsd)}`,
      actor: "AgntPymt",
      source: params.source,
    });

    finalPrice = resolveFinalPrice(vendor, params, vendor.listPriceUsd);
  } else {
  const transcript: TranscriptLine[] = [];
  const negotiationBase = {
    agentName: agent.name,
    agentDescription: agent.description,
    vendorName: vendor.name,
    vendorDescription: vendor.description,
    purchaseIntent: params.purchaseIntent,
    autoApproveLimitUsd: policy.autoApproveLimitUsd,
    targetFeeUsd: env.demoTransactionFeeUsd,
    negotiationRules: policy.negotiationRules,
    transcript,
  };

  async function negotiateTurn(
    kind: Parameters<typeof generateNegotiationMessage>[0]["kind"],
    step: string,
    actor: string,
    role: TranscriptLine["role"],
    extra?: Partial<Parameters<typeof generateNegotiationMessage>[0]>
  ) {
    const message = await generateNegotiationMessage({ ...negotiationBase, kind, ...extra });
    transcript.push({ role, speaker: actor, text: message });
    await logAudit({
      runId: params.runId,
      agentId: params.agentId,
      step,
      message,
      actor,
      source: params.source,
      ...(extra?.quotedPriceUsd != null
        ? { payload: { quotedPrice: extra.quotedPriceUsd } }
        : extra?.counterOfferUsd != null
          ? { payload: { counterOffer: extra.counterOfferUsd } }
          : extra?.finalPriceUsd != null
            ? { payload: { finalPrice: extra.finalPriceUsd } }
            : {}),
    });
    await delay(500);
    return message;
  }

  await negotiateTurn("purchase_intent", "purchase_intent", agent.name, "buyer");

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "vendor_matched",
    message: `Matched vendor: ${vendor.name} (${vendor.category})`,
    actor: "AgntPymt",
    source: params.source,
  });

  await delay(300);

  await negotiateTurn("seller_greeting", "seller_contacted", vendor.name, "seller");
  await negotiateTurn("buyer_clarify", "negotiation_round", agent.name, "buyer");

  finalPrice = vendor.listPriceUsd;
  if (params.maxBudget != null && params.maxBudget < finalPrice) {
    finalPrice = params.maxBudget;
  }

  await negotiateTurn("seller_quote", "seller_quoted", vendor.name, "seller", {
    quotedPriceUsd: vendor.listPriceUsd,
  });

  const agentTarget =
    params.maxBudget != null
      ? Math.min(params.maxBudget, env.demoTransactionFeeUsd)
      : env.demoTransactionFeeUsd;

  if (finalPrice > agentTarget && vendor.negotiationStyle !== "instant") {
    await negotiateTurn("buyer_counter", "negotiation_round", agent.name, "buyer", {
      quotedPriceUsd: vendor.listPriceUsd,
      counterOfferUsd: agentTarget,
    });

    if (vendor.counterPriceUsd != null && agentTarget < vendor.counterPriceUsd) {
      finalPrice = vendor.counterPriceUsd;
      await negotiateTurn("seller_response", "negotiation_round", vendor.name, "seller", {
        quotedPriceUsd: vendor.listPriceUsd,
        counterOfferUsd: agentTarget,
        finalPriceUsd: finalPrice,
        vendorAccepted: false,
      });
    } else {
      finalPrice = agentTarget;
      await negotiateTurn("seller_response", "negotiation_round", vendor.name, "seller", {
        quotedPriceUsd: vendor.listPriceUsd,
        counterOfferUsd: agentTarget,
        finalPriceUsd: finalPrice,
        vendorAccepted: true,
      });
    }
  }
  } // end theater (settlementOnly === false)

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "deal_accepted",
    message: settlementOnly
      ? `Settled price ${formatUsdc(finalPrice)} with ${vendor.name}`
      : `Deal closed at ${formatUsdc(finalPrice)}`,
    actor: "AgntPymt",
    payload: { finalPrice },
    source: params.source,
  });

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "policy_evaluated",
    message: `Policy check: ${formatUsdc(finalPrice)} vs auto-approve limit ${formatUsdc(policy.autoApproveLimitUsd)}`,
    actor: "AgntPymt Policy Engine",
    payload: { finalPrice, limit: policy.autoApproveLimitUsd },
    source: params.source,
  });

  if (finalPrice > policy.autoApproveLimitUsd) {
    const approvalId = nanoid();
    await db.insert(schema.approvals).values({
      id: approvalId,
      orgId: agent.orgId,
      agentId: params.agentId,
      runId: params.runId,
      sellerSessionId: sessionId,
      vendorName: vendor.name,
      amountUsd: finalPrice,
      reason: params.purchaseIntent,
      status: "pending_approval",
      requestedAt: new Date().toISOString(),
      resolvedAt: null,
    });

    await db
      .update(schema.sellerSessions)
      .set({ quotedPriceUsd: vendor.listPriceUsd, finalPriceUsd: finalPrice, status: "pending_approval" })
      .where(eq(schema.sellerSessions.id, sessionId));

    await logAudit({
      runId: params.runId,
      agentId: params.agentId,
      step: "payment_pending",
      message: `Requires human approval — ${formatUsdc(finalPrice)} exceeds ${formatUsdc(policy.autoApproveLimitUsd)} limit`,
      actor: "AgntPymt",
      payload: { approvalId },
      source: params.source,
    });

    return {
      status: "pending_approval" as const,
      approvalId,
      vendor,
      finalPrice,
      sessionId,
    };
  }

  return settlePurchase({
    runId: params.runId,
    agentId: params.agentId,
    sessionId,
    vendor,
    finalPrice,
    purchaseIntent: params.purchaseIntent,
    source: params.source,
  });
}

export async function settlePurchase(params: {
  runId: string;
  agentId: string;
  sessionId: string;
  vendor: Vendor;
  finalPrice: number;
  purchaseIntent: string;
  approvalId?: string;
  source?: string;
}) {
  const db = getDb();
  const agent = await getAgent(params.agentId);

  let txHash: string | null = null;

  if (env.simulatePayments) {
    await logAudit({
      runId: params.runId,
      agentId: params.agentId,
      step: "payment_simulated",
      message: `Simulated payment of ${formatUsdc(params.finalPrice)} to ${params.vendor.name}`,
      actor: "AgntPymt",
      payload: { simulated: true, amountUsd: params.finalPrice },
      source: params.source,
    });
  } else {
    if (!env.evmPayToAddress) {
      await logAudit({
        runId: params.runId,
        agentId: params.agentId,
        step: "payment_failed",
        message: "Settlement blocked — set EVM_PAY_TO_ADDRESS in .env to the vendor receiving wallet",
        actor: "AgntPymt",
        source: params.source,
      });
      throw new Error("EVM_PAY_TO_ADDRESS not configured");
    }

    if (!agent?.walletAddress || !agent.walletPrivateKey) {
      await logAudit({
        runId: params.runId,
        agentId: params.agentId,
        step: "payment_failed",
        message: "Settlement blocked — agent operational wallet is not ready to sign",
        actor: "AgntPymt",
        source: params.source,
      });
      throw new Error("Agent wallet cannot sign transactions");
    }

    await db
      .update(schema.sellerSessions)
      .set({ finalPriceUsd: params.finalPrice, status: "settling" })
      .where(eq(schema.sellerSessions.id, params.sessionId));

    try {
      const settled = await settleViaX402(
        agent.walletPrivateKey as `0x${string}`,
        params.sessionId,
        params.finalPrice
      );
      txHash = settled.txHash;

      await logAudit({
        runId: params.runId,
        agentId: params.agentId,
        step: "payment_settled",
        message: `x402 payment of ${formatUsdc(params.finalPrice)} settled via facilitator`,
        actor: "AgntPymt",
        payload: {
          simulated: false,
          protocol: "x402",
          facilitator: env.facilitatorUrl,
          payTo: env.evmPayToAddress,
          amountUsd: params.finalPrice,
          txHash,
          from: settled.from,
          explorerUrl: `https://sepolia.basescan.org/tx/${txHash}`,
        },
        source: params.source,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "x402 settlement failed";
      const hint = reason.includes("Insufficient USDC")
        ? " Fund the agent wallet with Base Sepolia USDC on the Wallets page."
        : reason.includes("Base Sepolia ETH") || reason.includes("needs testnet ETH")
        ? " Fund ETH gas on the Wallets page (Coinbase faucet → treasury → agent ETH gas)."
        : reason.includes("(402)")
          ? " Open Wallets → fund the running agent with more USDC + ETH, then retry."
          : reason.includes("not registered")
          ? " If using facilitator.openx402.ai, register EVM_PAY_TO_ADDRESS at https://openx402.ai/register."
          : "";
      await logAudit({
        runId: params.runId,
        agentId: params.agentId,
        step: "payment_failed",
        message: `x402 settlement failed — ${reason}${hint}`,
        actor: "AgntPymt",
        payload: { agentWallet: agent.walletAddress, protocol: "x402" },
        source: params.source,
      });
      throw err;
    }
  }

  const fulfillment = buildFulfillment(params.vendor, params.purchaseIntent, params.finalPrice);

  const fulfillmentDetail =
    fulfillment.type === "data_delivery"
      ? `dataset ${fulfillment.dataset}`
      : `order ${(fulfillment as { orderId?: string }).orderId ?? "confirmed"}`;

  await db
    .update(schema.sellerSessions)
    .set({
      quotedPriceUsd: params.vendor.listPriceUsd,
      finalPriceUsd: params.finalPrice,
      status: "delivered",
      fulfillmentPayload: JSON.stringify(fulfillment),
    })
    .where(eq(schema.sellerSessions.id, params.sessionId));

  const txId = nanoid();

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "order_fulfilled",
    message: `${params.vendor.name} fulfilled — ${fulfillmentDetail} (${formatUsdc(params.finalPrice)})`,
    actor: params.vendor.name,
    payload: { ...fulfillment, txHash: txHash ?? undefined } as Record<string, unknown>,
    source: params.source,
  });

  let feedbackTxHash: string | null = null;

  if (!env.simulatePayments && agent) {
    const reputation = await recordBuyerRatesSeller({
      buyerAgentId: params.agentId,
      vendorId: params.vendor.id,
      paymentTxHash: txHash as `0x${string}` | undefined,
    });
    if (reputation.submitted && reputation.txHash) {
      feedbackTxHash = reputation.txHash;
      await logAudit({
        runId: params.runId,
        agentId: params.agentId,
        step: "erc8004_feedback",
        message: "Buyer agent rated seller on ERC-8004 reputation registry",
        actor: agent.name,
        payload: { txHash: reputation.txHash, sellerVendorId: params.vendor.id },
        source: params.source,
      });
    } else if (reputation.reason === "seller_not_registered") {
      await logAudit({
        runId: params.runId,
        agentId: params.agentId,
        step: "erc8004_feedback_pending",
        message: `Register seller agent "${params.vendor.name}" before on-chain ratings`,
        actor: "AgntPymt",
        payload: { reason: reputation.reason, vendorId: params.vendor.id },
        source: params.source,
      });
    }
  }

  if (!agent) throw new Error("Agent not found");

  await db.insert(schema.transactions).values({
    id: txId,
    orgId: agent.orgId,
    agentId: params.agentId,
    runId: params.runId,
    approvalId: params.approvalId ?? null,
    vendorName: params.vendor.name,
    description: `${agent.name} → ${params.vendor.name}`,
    amountUsd: params.finalPrice,
    status: env.simulatePayments ? "simulated" : "completed",
    txHash,
    feedbackTxHash,
    createdAt: new Date().toISOString(),
  });

  if (agent.walletAddress && !env.simulatePayments) {
    const { fetchWalletBalances } = await import("../chain/wallet.js");
    const onChain = await fetchWalletBalances(agent.walletAddress);
    await db
      .update(schema.agents)
      .set({ balanceUsd: onChain.usdc })
      .where(eq(schema.agents.id, params.agentId));
  } else if (env.simulatePayments) {
    await db
      .update(schema.agents)
      .set({ balanceUsd: Math.max(0, agent.balanceUsd - params.finalPrice) })
      .where(eq(schema.agents.id, params.agentId));
  }

  return {
    status: "completed" as const,
    finalPrice: params.finalPrice,
    fulfillment,
    transactionId: txId,
  };
}

export async function approveAndSettle(approvalId: string) {
  const db = getDb();
  const [approval] = await db.select().from(schema.approvals).where(eq(schema.approvals.id, approvalId));
  if (!approval) throw new Error("Approval not found");
  if (approval.status !== "pending_approval") throw new Error("Approval already resolved");

  const [session] = approval.sellerSessionId
    ? await db.select().from(schema.sellerSessions).where(eq(schema.sellerSessions.id, approval.sellerSessionId))
    : [null];

  const vendors = await db.select().from(schema.vendors);
  const vendor = vendors.find((v) => v.name === approval.vendorName) ?? vendors[0];

  await db
    .update(schema.approvals)
    .set({ status: "approved", resolvedAt: new Date().toISOString() })
    .where(eq(schema.approvals.id, approvalId));

  if (approval.runId && session) {
    const result = await settlePurchase({
      runId: approval.runId,
      agentId: approval.agentId,
      sessionId: session.id,
      vendor,
      finalPrice: approval.amountUsd,
      purchaseIntent: approval.reason,
      approvalId,
    });

    const { finalizeRunIfReady } = await import("../services/run-orchestrator.js");
    await finalizeRunIfReady(approval.runId);
    return result;
  }

  const txId = nanoid();
  await db.insert(schema.transactions).values({
    id: txId,
    orgId: approval.orgId,
    agentId: approval.agentId,
    runId: approval.runId,
    approvalId,
    vendorName: approval.vendorName,
    description: `Approved → ${approval.vendorName}`,
    amountUsd: approval.amountUsd,
    status: "simulated",
    txHash: null,
    createdAt: new Date().toISOString(),
  });

  return { status: "completed" as const, transactionId: txId };
}

export async function denyApproval(approvalId: string) {
  const db = getDb();
  await db
    .update(schema.approvals)
    .set({ status: "denied", resolvedAt: new Date().toISOString() })
    .where(eq(schema.approvals.id, approvalId));
}
