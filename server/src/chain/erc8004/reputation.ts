import {
  type Address,
  type Hash,
  type Hex,
  createWalletClient,
  getAddress,
  http,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../wallet.js";
import { reputationRegistryAbi } from "./abis.js";
import {
  ERC8004_CHAIN,
  ERC8004_FEEDBACK_TAG_PAYMENT,
  ERC8004_FEEDBACK_TAG_X402,
  ERC8004_PAYMENT_SUCCESS_VALUE,
  ERC8004_REPUTATION_REGISTRY,
} from "./constants.js";

export type ReputationSummary = {
  count: number;
  summaryValue: number;
  valueDecimals: number;
};

export async function readReputationSummary(
  agentId: bigint,
  clientAddress?: Address | null
): Promise<ReputationSummary> {
  const empty: ReputationSummary = { count: 0, summaryValue: 0, valueDecimals: 0 };
  if (!clientAddress) return empty;

  const [count, summaryValue, valueDecimals] = await publicClient.readContract({
    address: ERC8004_REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [agentId, [clientAddress], ERC8004_FEEDBACK_TAG_PAYMENT, ERC8004_FEEDBACK_TAG_X402],
  });

  return {
    count: Number(count),
    summaryValue: Number(summaryValue),
    valueDecimals: Number(valueDecimals),
  };
}

export async function submitBuyerRatesSeller(params: {
  sellerAgentId: bigint;
  buyerPrivateKey: Hex;
}): Promise<Hash> {
  const account = privateKeyToAccount(params.buyerPrivateKey);
  const walletClient = createWalletClient({
    account,
    chain: ERC8004_CHAIN,
    transport: http(undefined, { timeout: 30_000 }),
  });

  const hash = await walletClient.writeContract({
    address: ERC8004_REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [
      params.sellerAgentId,
      BigInt(ERC8004_PAYMENT_SUCCESS_VALUE),
      0,
      ERC8004_FEEDBACK_TAG_PAYMENT,
      ERC8004_FEEDBACK_TAG_X402,
      "",
      "",
      zeroHash,
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** @deprecated Use submitBuyerRatesSeller — vendor no longer rates buyer */
export async function submitPaymentFeedback(params: {
  agentId: bigint;
  vendorPrivateKey: Hex;
  txHash?: Hash;
}): Promise<Hash> {
  return submitBuyerRatesSeller({
    sellerAgentId: params.agentId,
    buyerPrivateKey: params.vendorPrivateKey,
  });
}

export function vendorKeyMatchesPayTo(vendorPrivateKey: Hex, payToAddress: string): boolean {
  const account = privateKeyToAccount(vendorPrivateKey);
  return account.address.toLowerCase() === getAddress(payToAddress as Address).toLowerCase();
}
