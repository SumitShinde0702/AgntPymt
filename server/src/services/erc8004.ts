import { eq } from "@agntpymt/db";
import { getDb, schema, type Agent } from "@agntpymt/db";
import type { Address, Hash, Hex } from "viem";
import { getAddress } from "viem";
import {
  buildRegistrationFile,
  fetchRegistrationTxAgentId,
  hasPublishedRegistrationUri,
  prepareAgentWalletLinkSignature,
  readOnChainIdentity,
  readReputationSummary,
  registrationToDataUri,
  submitBuyerRatesSeller,
  ERC8004_IDENTITY_REGISTRY,
  type Erc8004RegistrationFile,
  type OnChainAgentIdentity,
  type ReputationSummary,
} from "../chain/erc8004/index.js";

export type Erc8004LifecycleStatus = "none" | "registered" | "complete";

export type Erc8004AgentStatus = {
  lifecycle: Erc8004LifecycleStatus;
  agentId: string | null;
  registerTx: string | null;
  uriTx: string | null;
  walletTx: string | null;
  registeredAt: string | null;
  treasuryAddress: string | null;
  identityRegistry: typeof ERC8004_IDENTITY_REGISTRY;
  onChain: OnChainAgentIdentity | null;
  registration: Erc8004RegistrationFile | null;
  registrationUri: string | null;
  reputation: ReputationSummary | null;
  nextStep: "connect_treasury" | "register" | "set_uri" | "link_wallet" | "done";
};

async function loadAgent(agentId: string, orgId: string): Promise<Agent | null> {
  const db = getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId));
  if (!agent || agent.orgId !== orgId) return null;
  return agent;
}

async function loadTreasury(orgId: string): Promise<string | null> {
  const db = getDb();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
  return org?.treasuryWalletAddress ?? null;
}

function deriveLifecycle(agent: Agent, onChain: OnChainAgentIdentity | null): Erc8004LifecycleStatus {
  if (onChain?.walletMatches && hasPublishedRegistrationUri(onChain.tokenUri)) return "complete";
  if (agent.erc8004AgentId || onChain?.owner) return "registered";
  return "none";
}

function deriveNextStep(
  treasury: string | null,
  lifecycle: Erc8004LifecycleStatus,
  onChain: OnChainAgentIdentity | null
): Erc8004AgentStatus["nextStep"] {
  if (!treasury) return "connect_treasury";
  if (lifecycle === "none") return "register";
  if (!hasPublishedRegistrationUri(onChain?.tokenUri)) {
    return "set_uri";
  }
  if (!onChain?.walletMatches) return "link_wallet";
  return "done";
}

export async function getErc8004Status(agentId: string, orgId: string): Promise<Erc8004AgentStatus | null> {
  const agent = await loadAgent(agentId, orgId);
  if (!agent) return null;

  const treasury = await loadTreasury(orgId);
  const chainAgentId = agent.erc8004AgentId ? BigInt(agent.erc8004AgentId) : null;
  const onChain = chainAgentId ? await readOnChainIdentity(chainAgentId, agent.walletAddress) : null;
  const lifecycle = deriveLifecycle(agent, onChain);

  const registration =
    chainAgentId != null
      ? buildRegistrationFile(agent, { agentId: chainAgentId, includeWallet: true })
      : buildRegistrationFile(agent, { includeWallet: true });

  const registrationUri = registrationToDataUri(registration);

  let reputation: ReputationSummary | null = null;
  if (chainAgentId) {
    reputation = await readReputationSummary(chainAgentId, null);
  }

  return {
    lifecycle,
    agentId: agent.erc8004AgentId,
    registerTx: agent.erc8004RegisterTx,
    uriTx: agent.erc8004UriTx,
    walletTx: agent.erc8004WalletTx,
    registeredAt: agent.erc8004RegisteredAt,
    treasuryAddress: treasury,
    identityRegistry: ERC8004_IDENTITY_REGISTRY,
    onChain,
    registration,
    registrationUri,
    reputation,
    nextStep: deriveNextStep(treasury, lifecycle, onChain),
  };
}

export function prepareRegistrationUri(agent: Agent, agentId?: bigint | null): string {
  const file = buildRegistrationFile(agent, {
    agentId: agentId ?? null,
    includeWallet: true,
  });
  return registrationToDataUri(file);
}

export async function confirmRegistration(
  agentId: string,
  orgId: string,
  txHash: Hash,
  treasuryAddress: string
): Promise<Erc8004AgentStatus> {
  const agent = await loadAgent(agentId, orgId);
  if (!agent) throw new Error("Agent not found");

  const treasury = await loadTreasury(orgId);
  if (!treasury || getAddress(treasury) !== getAddress(treasuryAddress as Address)) {
    throw new Error("Connected wallet does not match org treasury");
  }

  const registeredId = await fetchRegistrationTxAgentId(txHash);
  if (registeredId == null) throw new Error("Register transaction did not emit Registered event");

  const onChain = await readOnChainIdentity(registeredId, agent.walletAddress);
  if (!onChain.owner || getAddress(onChain.owner) !== getAddress(treasuryAddress as Address)) {
    throw new Error("NFT owner is not the org treasury wallet");
  }

  const db = getDb();
  await db
    .update(schema.agents)
    .set({
      erc8004AgentId: registeredId.toString(),
      erc8004Status: "registered",
      erc8004RegisterTx: txHash,
      erc8004RegisteredAt: new Date().toISOString(),
    })
    .where(eq(schema.agents.id, agentId));

  const status = await getErc8004Status(agentId, orgId);
  if (!status) throw new Error("Agent not found");
  return status;
}

export async function confirmUriUpdate(agentId: string, orgId: string, txHash: Hash): Promise<Erc8004AgentStatus> {
  const agent = await loadAgent(agentId, orgId);
  if (!agent?.erc8004AgentId) throw new Error("Agent is not registered on ERC-8004");

  const db = getDb();
  await db
    .update(schema.agents)
    .set({ erc8004UriTx: txHash })
    .where(eq(schema.agents.id, agentId));

  const status = await getErc8004Status(agentId, orgId);
  if (!status) throw new Error("Agent not found");
  return status;
}

export async function prepareWalletLink(
  agentId: string,
  orgId: string,
  treasuryAddress: string
): Promise<{
  agentId: string;
  newWallet: Address;
  owner: Address;
  deadline: string;
  signature: Hex;
}> {
  const agent = await loadAgent(agentId, orgId);
  if (!agent?.erc8004AgentId) throw new Error("Agent is not registered on ERC-8004");
  if (!agent.walletAddress || !agent.walletPrivateKey) {
    throw new Error("Agent operational wallet is not provisioned");
  }

  const treasury = await loadTreasury(orgId);
  if (!treasury || getAddress(treasury) !== getAddress(treasuryAddress as Address)) {
    throw new Error("Connected wallet does not match org treasury");
  }

  const { deadline, signature } = await prepareAgentWalletLinkSignature({
    agentId: BigInt(agent.erc8004AgentId),
    newWallet: getAddress(agent.walletAddress as Address),
    owner: getAddress(treasuryAddress as Address),
    agentPrivateKey: agent.walletPrivateKey as Hex,
  });

  return {
    agentId: agent.erc8004AgentId,
    newWallet: getAddress(agent.walletAddress as Address),
    owner: getAddress(treasuryAddress as Address),
    deadline: deadline.toString(),
    signature,
  };
}

export async function confirmWalletLink(agentId: string, orgId: string, txHash: Hash): Promise<Erc8004AgentStatus> {
  const agent = await loadAgent(agentId, orgId);
  if (!agent?.erc8004AgentId) throw new Error("Agent is not registered on ERC-8004");

  const onChain = await readOnChainIdentity(BigInt(agent.erc8004AgentId), agent.walletAddress);
  if (!onChain.walletMatches) {
    throw new Error("On-chain verified wallet does not match agent operational wallet yet");
  }

  const db = getDb();
  await db
    .update(schema.agents)
    .set({
      erc8004Status: "complete",
      erc8004WalletTx: txHash,
    })
    .where(eq(schema.agents.id, agentId));

  const status = await getErc8004Status(agentId, orgId);
  if (!status) throw new Error("Agent not found");
  return status;
}

export async function recordBuyerRatesSeller(params: {
  buyerAgentId: string;
  vendorId: string;
  paymentTxHash?: Hash;
}): Promise<{ submitted: boolean; txHash?: Hash; reason?: string }> {
  const db = getDb();
  const [buyer] = await db.select().from(schema.agents).where(eq(schema.agents.id, params.buyerAgentId));
  const [vendor] = await db.select().from(schema.vendors).where(eq(schema.vendors.id, params.vendorId));

  if (!buyer?.walletPrivateKey) {
    return { submitted: false, reason: "buyer_wallet_not_ready" };
  }
  if (!vendor?.erc8004AgentId) {
    return { submitted: false, reason: "seller_not_registered" };
  }

  try {
    const txHash = await submitBuyerRatesSeller({
      sellerAgentId: BigInt(vendor.erc8004AgentId),
      buyerPrivateKey: buyer.walletPrivateKey as Hex,
    });
    return { submitted: true, txHash };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "feedback_failed";
    return { submitted: false, reason };
  }
}
