import { nanoid } from "nanoid";
import { eq } from "@agntpymt/db";
import { getDb, schema, type Vendor } from "@agntpymt/db";
import { env } from "../config.js";
import { logAudit } from "../services/audit.js";
import { matchVendor, buildFulfillment } from "./vendor-matcher.js";
import { formatUsdc } from "./pricing.js";
import { settleViaX402 } from "../chain/x402.js";
import { generateNegotiationMessage } from "../services/negotiation-ai.js";

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
};

export async function runPurchaseFlow(params: PurchaseParams) {
  const db = getDb();
  const agent = await getAgent(params.agentId);
  if (!agent) throw new Error("Agent not found");

  const vendors = await db.select().from(schema.vendors);
  const vendor = matchVendor(vendors, params.purchaseIntent, params.category ?? agent.category, params.resourceId);
  const policy = await getAgentPolicy(params.agentId);

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

  const intentMessage = await generateNegotiationMessage({
    kind: "purchase_intent",
    agentName: agent.name,
    agentDescription: agent.description,
    vendorName: vendor.name,
    vendorDescription: vendor.description,
    purchaseIntent: params.purchaseIntent,
    autoApproveLimitUsd: policy.autoApproveLimitUsd,
    targetFeeUsd: env.demoTransactionFeeUsd,
    negotiationRules: policy.negotiationRules,
  });

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "purchase_intent",
    message: intentMessage,
    actor: agent.name,
    source: params.source,
  });

  await delay(400);

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "vendor_matched",
    message: `Matched vendor: ${vendor.name} (${vendor.category})`,
    actor: "AgntPymt",
    source: params.source,
  });

  await delay(300);

  const greetingMessage = await generateNegotiationMessage({
    kind: "seller_greeting",
    agentName: agent.name,
    vendorName: vendor.name,
    vendorDescription: vendor.description,
    purchaseIntent: params.purchaseIntent,
    autoApproveLimitUsd: policy.autoApproveLimitUsd,
    targetFeeUsd: env.demoTransactionFeeUsd,
    negotiationRules: policy.negotiationRules,
  });

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "seller_contacted",
    message: greetingMessage,
    actor: vendor.name,
    source: params.source,
  });

  await delay(500);

  let finalPrice = vendor.listPriceUsd;
  if (params.maxBudget != null && params.maxBudget < finalPrice) {
    finalPrice = params.maxBudget;
  }

  const quoteMessage = await generateNegotiationMessage({
    kind: "seller_quote",
    agentName: agent.name,
    vendorName: vendor.name,
    vendorDescription: vendor.description,
    purchaseIntent: params.purchaseIntent,
    quotedPriceUsd: vendor.listPriceUsd,
    autoApproveLimitUsd: policy.autoApproveLimitUsd,
    targetFeeUsd: env.demoTransactionFeeUsd,
    negotiationRules: policy.negotiationRules,
  });

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "seller_quoted",
    message: quoteMessage,
    actor: vendor.name,
    payload: { quotedPrice: vendor.listPriceUsd },
    source: params.source,
  });

  const agentTarget =
    params.maxBudget != null
      ? Math.min(params.maxBudget, env.demoTransactionFeeUsd)
      : env.demoTransactionFeeUsd;

  if (finalPrice > agentTarget && vendor.negotiationStyle !== "instant") {
    await delay(600);

    const counterMessage = await generateNegotiationMessage({
      kind: "buyer_counter",
      agentName: agent.name,
      agentDescription: agent.description,
      vendorName: vendor.name,
      purchaseIntent: params.purchaseIntent,
      quotedPriceUsd: vendor.listPriceUsd,
      counterOfferUsd: agentTarget,
      autoApproveLimitUsd: policy.autoApproveLimitUsd,
      targetFeeUsd: env.demoTransactionFeeUsd,
      negotiationRules: policy.negotiationRules,
    });

    await logAudit({
      runId: params.runId,
      agentId: params.agentId,
      step: "negotiation_round",
      message: counterMessage,
      actor: agent.name,
      payload: { counterOffer: agentTarget },
      source: params.source,
    });

    await delay(500);

    if (vendor.counterPriceUsd != null && agentTarget < vendor.counterPriceUsd) {
      finalPrice = vendor.counterPriceUsd;
      const holdMessage = await generateNegotiationMessage({
        kind: "seller_response",
        agentName: agent.name,
        vendorName: vendor.name,
        purchaseIntent: params.purchaseIntent,
        counterOfferUsd: agentTarget,
        finalPriceUsd: finalPrice,
        vendorAccepted: false,
        autoApproveLimitUsd: policy.autoApproveLimitUsd,
        targetFeeUsd: env.demoTransactionFeeUsd,
        negotiationRules: policy.negotiationRules,
      });
      await logAudit({
        runId: params.runId,
        agentId: params.agentId,
        step: "negotiation_round",
        message: holdMessage,
        actor: vendor.name,
        payload: { finalPrice },
        source: params.source,
      });
    } else {
      finalPrice = agentTarget;
      const acceptMessage = await generateNegotiationMessage({
        kind: "seller_response",
        agentName: agent.name,
        vendorName: vendor.name,
        purchaseIntent: params.purchaseIntent,
        counterOfferUsd: agentTarget,
        finalPriceUsd: finalPrice,
        vendorAccepted: true,
        autoApproveLimitUsd: policy.autoApproveLimitUsd,
        targetFeeUsd: env.demoTransactionFeeUsd,
        negotiationRules: policy.negotiationRules,
      });
      await logAudit({
        runId: params.runId,
        agentId: params.agentId,
        step: "negotiation_round",
        message: acceptMessage,
        actor: vendor.name,
        payload: { finalPrice },
        source: params.source,
      });
    }
  }

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "deal_accepted",
    message: `Deal closed at ${formatUsdc(finalPrice)}`,
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
      await logAudit({
        runId: params.runId,
        agentId: params.agentId,
        step: "payment_failed",
        message: `x402 settlement failed — ${reason}. Fund the agent wallet with USDC + ETH on the Wallets page.`,
        actor: "AgntPymt",
        payload: { agentWallet: agent.walletAddress, protocol: "x402" },
        source: params.source,
      });
      throw err;
    }
  }

  const fulfillment = buildFulfillment(params.vendor, params.purchaseIntent, params.finalPrice);

  const fulfillmentMessage = await generateNegotiationMessage({
    kind: "order_fulfilled",
    agentName: agent?.name ?? "Agent",
    vendorName: params.vendor.name,
    purchaseIntent: params.purchaseIntent,
    finalPriceUsd: params.finalPrice,
    autoApproveLimitUsd: 0,
    targetFeeUsd: env.demoTransactionFeeUsd,
    fulfillmentSummary:
      fulfillment.type === "data_delivery"
        ? `Dataset ${fulfillment.dataset} is ready.`
        : `Receipt ${(fulfillment as { orderId?: string }).orderId ?? "issued"}.`,
  });

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
  await db.insert(schema.transactions).values({
    id: txId,
    orgId: agent.orgId,
    agentId: params.agentId,
    runId: params.runId,
    approvalId: params.approvalId ?? null,
    vendorName: params.vendor.name,
    description: `${agent?.name ?? "Agent"} → ${params.vendor.name}`,
    amountUsd: params.finalPrice,
    status: env.simulatePayments ? "simulated" : "completed",
    txHash,
    createdAt: new Date().toISOString(),
  });

  if (agent?.walletAddress && !env.simulatePayments) {
    const { fetchWalletBalances } = await import("../chain/wallet.js");
    const onChain = await fetchWalletBalances(agent.walletAddress);
    await db
      .update(schema.agents)
      .set({ balanceUsd: onChain.usdc })
      .where(eq(schema.agents.id, params.agentId));
  } else if (agent && env.simulatePayments) {
    await db
      .update(schema.agents)
      .set({ balanceUsd: Math.max(0, agent.balanceUsd - params.finalPrice) })
      .where(eq(schema.agents.id, params.agentId));
  }

  await logAudit({
    runId: params.runId,
    agentId: params.agentId,
    step: "order_fulfilled",
    message: fulfillmentMessage,
    actor: params.vendor.name,
    payload: { ...fulfillment, txHash: txHash ?? undefined } as Record<string, unknown>,
    source: params.source,
  });

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
