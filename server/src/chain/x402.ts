import { eq, getDb, schema } from "@agntpymt/db";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { decodePaymentResponseHeader } from "@x402/fetch";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactEvmScheme as ExactEvmServerScheme } from "@x402/evm/exact/server";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../config.js";
import { fetchWalletBalances } from "./wallet.js";

export const X402_NETWORK = "eip155:84532" as const;

const pendingSettlementPrices = new Map<string, number>();

function sessionIdFromPath(path: string): string | null {
  const match = path.match(/\/api\/x402\/vendor\/settle\/([^/]+)$/);
  return match?.[1] ?? null;
}

function usdToX402Price(amountUsd: number): string {
  if (amountUsd < 0.01) return `$${amountUsd.toFixed(4)}`;
  return `$${amountUsd.toFixed(2)}`;
}

export function registerPendingX402Settlement(sessionId: string, amountUsd: number) {
  pendingSettlementPrices.set(sessionId, amountUsd);
}

export function clearPendingX402Settlement(sessionId: string) {
  pendingSettlementPrices.delete(sessionId);
}

async function resolveSettlementPrice(path: string): Promise<string> {
  const sessionId = sessionIdFromPath(path);
  if (!sessionId) {
    throw new Error("Invalid x402 settlement path");
  }

  const pending = pendingSettlementPrices.get(sessionId);
  if (pending != null) {
    return usdToX402Price(pending);
  }

  const db = getDb();
  const [session] = await db
    .select()
    .from(schema.sellerSessions)
    .where(eq(schema.sellerSessions.id, sessionId));

  if (session?.finalPriceUsd == null) {
    throw new Error(`No settlement price for session ${sessionId}`);
  }

  return usdToX402Price(session.finalPriceUsd);
}

const facilitatorClient = new HTTPFacilitatorClient({ url: env.facilitatorUrl });
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  X402_NETWORK,
  new ExactEvmServerScheme()
);

export const x402Middleware = paymentMiddleware(
  {
    "POST /api/x402/vendor/settle/*": {
      accepts: {
        scheme: "exact",
        network: X402_NETWORK,
        payTo: env.evmPayToAddress || "0x0000000000000000000000000000000000000000",
        price: (context) => resolveSettlementPrice(context.path),
      },
      description: "Vendor fulfillment settlement (x402)",
      mimeType: "application/json",
    },
  },
  resourceServer
);

const MIN_GAS_ETH = 0.00005;

export async function settleViaX402(
  privateKey: `0x${string}`,
  sessionId: string,
  amountUsd: number
): Promise<{ txHash: string; from: string }> {
  const account = privateKeyToAccount(privateKey);
  const balances = await fetchWalletBalances(account.address);

  if (balances.eth < MIN_GAS_ETH) {
    throw new Error(
      `Agent wallet ${account.address} needs testnet ETH for gas (has ${balances.eth.toFixed(6)} ETH)`
    );
  }

  if (balances.usdc < amountUsd) {
    throw new Error(
      `Insufficient USDC on agent wallet (has ${balances.usdc.toFixed(2)}, need ${amountUsd.toFixed(2)})`
    );
  }

  registerPendingX402Settlement(sessionId, amountUsd);

  try {
    const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [
        {
          network: "eip155:*",
          client: new ExactEvmScheme(account),
        },
      ],
    });

    const url = `http://127.0.0.1:${env.port}/api/x402/vendor/settle/${sessionId}`;
    const response = await fetchWithPayment(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`x402 settlement failed (${response.status}): ${body}`);
    }

    const paymentResponseHeader = response.headers.get("PAYMENT-RESPONSE");
    if (!paymentResponseHeader) {
      throw new Error("x402 settlement succeeded but PAYMENT-RESPONSE header was missing");
    }

    const settled = decodePaymentResponseHeader(paymentResponseHeader);
    if (!settled.success || !settled.transaction) {
      throw new Error(settled.errorMessage ?? settled.errorReason ?? "x402 facilitator settlement failed");
    }

    return { txHash: settled.transaction, from: account.address };
  } finally {
    clearPendingX402Settlement(sessionId);
  }
}
