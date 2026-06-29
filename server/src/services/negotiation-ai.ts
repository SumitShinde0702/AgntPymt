import { env } from "../config.js";
import { formatUsdc } from "../simulation/pricing.js";

export type NegotiationContext = {
  kind:
    | "purchase_intent"
    | "seller_greeting"
    | "seller_quote"
    | "buyer_counter"
    | "seller_response"
    | "order_fulfilled";
  agentName: string;
  agentDescription?: string | null;
  vendorName: string;
  vendorDescription?: string | null;
  purchaseIntent: string;
  quotedPriceUsd?: number;
  counterOfferUsd?: number;
  finalPriceUsd?: number;
  vendorAccepted?: boolean;
  autoApproveLimitUsd: number;
  targetFeeUsd: number;
  negotiationRules?: string | null;
  fulfillmentSummary?: string;
};

const FALLBACKS: Record<NegotiationContext["kind"], (ctx: NegotiationContext) => string> = {
  purchase_intent: (ctx) =>
    `I need ${ctx.purchaseIntent.toLowerCase().replace(/^buy |^order /i, "")} — please share pricing and availability.`,
  seller_greeting: (ctx) =>
    `Thanks for reaching out. I can help with ${ctx.purchaseIntent.toLowerCase()}. Let me pull together a quote.`,
  seller_quote: (ctx) =>
    `For this request, our list price is ${formatUsdc(ctx.quotedPriceUsd ?? 0)}.`,
  buyer_counter: (ctx) =>
    `Given our procurement policy, I'd like to counter at ${formatUsdc(ctx.counterOfferUsd ?? ctx.targetFeeUsd)}.`,
  seller_response: (ctx) =>
    ctx.vendorAccepted
      ? `That works for us — we can proceed at ${formatUsdc(ctx.finalPriceUsd ?? ctx.counterOfferUsd ?? 0)}.`
      : `I can't go as low as that. Best I can do is ${formatUsdc(ctx.finalPriceUsd ?? 0)}.`,
  order_fulfilled: (ctx) =>
    `Done — your order is fulfilled. ${ctx.fulfillmentSummary ?? "Delivery details are in the receipt."}`,
};

function buildPrompt(ctx: NegotiationContext): { system: string; user: string } {
  const rules =
    ctx.negotiationRules?.trim() ||
    `Prefer micro-payments near ${formatUsdc(ctx.targetFeeUsd)}. Auto-approve limit is ${formatUsdc(ctx.autoApproveLimitUsd)}.`;

  const system = `You write short chat messages (1-2 sentences) for an AI agent commerce demo.
Payments are in USDC on Base Sepolia. Be natural, professional, first person. No quotes around the message, no markdown, no role labels.

Buyer agent rules (must follow when writing as buyer):
${rules}

When writing as vendor, be commercial but concise. State prices clearly when relevant.`;

  const facts: Record<string, unknown> = {
    kind: ctx.kind,
    agent: ctx.agentName,
    vendor: ctx.vendorName,
    request: ctx.purchaseIntent,
    targetFeeUsd: ctx.targetFeeUsd,
    autoApproveLimitUsd: ctx.autoApproveLimitUsd,
  };

  if (ctx.quotedPriceUsd != null) facts.quotedPriceUsd = ctx.quotedPriceUsd;
  if (ctx.counterOfferUsd != null) facts.counterOfferUsd = ctx.counterOfferUsd;
  if (ctx.finalPriceUsd != null) facts.finalPriceUsd = ctx.finalPriceUsd;
  if (ctx.vendorAccepted != null) facts.vendorAccepted = ctx.vendorAccepted;
  if (ctx.fulfillmentSummary) facts.fulfillmentSummary = ctx.fulfillmentSummary;

  const roleHint =
    ctx.kind === "purchase_intent" || ctx.kind === "buyer_counter"
      ? "Write as the BUYER agent."
      : ctx.kind === "seller_greeting" || ctx.kind === "seller_quote" || ctx.kind === "seller_response" || ctx.kind === "order_fulfilled"
        ? "Write as the VENDOR."
        : "Write as the appropriate party.";

  return {
    system,
    user: `${roleHint}\n\nContext JSON:\n${JSON.stringify(facts, null, 2)}\n\nReply with only the chat message text.`,
  };
}

export async function generateNegotiationMessage(ctx: NegotiationContext): Promise<string> {
  const fallback = FALLBACKS[ctx.kind](ctx);

  if (!env.openaiApiKey) {
    return fallback;
  }

  try {
    const { system, user } = buildPrompt(ctx);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: env.openaiModel,
        temperature: 0.65,
        max_tokens: 120,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      console.warn("OpenAI negotiation failed:", await res.text());
      return fallback;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return fallback;

    return text.replace(/^["']|["']$/g, "");
  } catch (err) {
    console.warn("OpenAI negotiation error:", err);
    return fallback;
  }
}
