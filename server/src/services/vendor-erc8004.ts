import { eq, getDb, schema, type Vendor } from "@agntpymt/db";
import type { Address, Hash, Hex } from "viem";
import { getAddress, isAddress } from "viem";
import { env } from "../config.js";
import {
  buildVendorRegistrationFile,
  fetchRegistrationTxAgentId,
  hasPublishedRegistrationUri,
  prepareAgentWalletLinkSignature,
  readOnChainIdentity,
  readReputationSummary,
  registrationToDataUri,
  vendorKeyMatchesPayTo,
  ERC8004_IDENTITY_REGISTRY,
  type Erc8004RegistrationFile,
  type OnChainAgentIdentity,
  type ReputationSummary,
} from "../chain/erc8004/index.js";

export type VendorErc8004Status = {
  lifecycle: "none" | "registered" | "complete";
  agentId: string | null;
  registerTx: string | null;
  uriTx: string | null;
  walletTx: string | null;
  registeredAt: string | null;
  treasuryAddress: string | null;
  sellerWallet: string | null;
  identityRegistry: typeof ERC8004_IDENTITY_REGISTRY;
  onChain: OnChainAgentIdentity | null;
  registration: Erc8004RegistrationFile | null;
  registrationUri: string | null;
  reputation: ReputationSummary | null;
  nextStep: "connect_treasury" | "register" | "set_uri" | "link_wallet" | "done";
};

function sellerWallet(vendor: Vendor): string | null {
  return vendor.walletAddress ?? env.evmPayToAddress ?? null;
}

async function loadTreasury(orgId: string): Promise<string | null> {
  const db = getDb();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
  return org?.treasuryWalletAddress ?? null;
}

async function loadVendor(vendorId: string): Promise<Vendor | null> {
  const db = getDb();
  const [vendor] = await db.select().from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  return vendor ?? null;
}

function canLinkSellerWallet(wallet: string | null): boolean {
  return Boolean(
    wallet &&
      env.vendorWalletPrivateKey &&
      vendorKeyMatchesPayTo(env.vendorWalletPrivateKey, wallet)
  );
}

function deriveLifecycle(vendor: Vendor, onChain: OnChainAgentIdentity | null): VendorErc8004Status["lifecycle"] {
  if (onChain?.walletMatches && hasPublishedRegistrationUri(onChain.tokenUri)) return "complete";
  if (vendor.erc8004AgentId || onChain?.owner) return "registered";
  return "none";
}

function deriveNextStep(
  treasury: string | null,
  lifecycle: VendorErc8004Status["lifecycle"],
  onChain: OnChainAgentIdentity | null,
  vendor: Vendor
): VendorErc8004Status["nextStep"] {
  if (!treasury) return "connect_treasury";
  if (lifecycle === "none") return "register";
  if (!hasPublishedRegistrationUri(onChain?.tokenUri)) {
    return "set_uri";
  }
  const wallet = sellerWallet(vendor);
  if (!onChain?.walletMatches && canLinkSellerWallet(wallet)) return "link_wallet";
  return "done";
}

export async function getVendorErc8004Status(
  vendorId: string,
  orgId: string
): Promise<VendorErc8004Status | null> {
  const vendor = await loadVendor(vendorId);
  if (!vendor) return null;

  const treasury = await loadTreasury(orgId);
  const payWallet = sellerWallet(vendor);
  const chainAgentId = vendor.erc8004AgentId ? BigInt(vendor.erc8004AgentId) : null;
  const onChain = chainAgentId ? await readOnChainIdentity(chainAgentId, payWallet) : null;
  const lifecycle = deriveLifecycle(vendor, onChain);

  const registration =
    chainAgentId != null
      ? buildVendorRegistrationFile(vendor, { agentId: chainAgentId })
      : buildVendorRegistrationFile(vendor);

  let reputation: ReputationSummary | null = null;
  if (chainAgentId) {
    reputation = await readReputationSummary(chainAgentId, null);
  }

  if (lifecycle === "complete" && vendor.erc8004Status !== "complete") {
    const db = getDb();
    await db
      .update(schema.vendors)
      .set({ erc8004Status: "complete" })
      .where(eq(schema.vendors.id, vendorId));
  }

  return {
    lifecycle,
    agentId: vendor.erc8004AgentId,
    registerTx: vendor.erc8004RegisterTx,
    uriTx: vendor.erc8004UriTx,
    walletTx: vendor.erc8004WalletTx,
    registeredAt: vendor.erc8004RegisteredAt,
    treasuryAddress: treasury,
    sellerWallet: payWallet,
    identityRegistry: ERC8004_IDENTITY_REGISTRY,
    onChain,
    registration,
    registrationUri: registrationToDataUri(registration),
    reputation,
    nextStep: deriveNextStep(treasury, lifecycle, onChain, vendor),
  };
}

export function prepareVendorRegistrationUri(vendor: Vendor, agentId?: bigint | null): string {
  return registrationToDataUri(buildVendorRegistrationFile(vendor, { agentId: agentId ?? null }));
}

export async function confirmVendorRegistration(
  vendorId: string,
  orgId: string,
  txHash: Hash,
  treasuryAddress: string
): Promise<VendorErc8004Status> {
  const vendor = await loadVendor(vendorId);
  if (!vendor) throw new Error("Seller agent not found");

  const treasury = await loadTreasury(orgId);
  if (!treasury || getAddress(treasury) !== getAddress(treasuryAddress as Address)) {
    throw new Error("Connected wallet does not match org treasury");
  }

  const registeredId = await fetchRegistrationTxAgentId(txHash);
  if (registeredId == null) throw new Error("Register transaction did not emit Registered event");

  const db = getDb();
  await db
    .update(schema.vendors)
    .set({
      erc8004AgentId: registeredId.toString(),
      erc8004Status: "registered",
      erc8004RegisterTx: txHash,
      erc8004RegisteredAt: new Date().toISOString(),
      walletAddress: vendor.walletAddress ?? env.evmPayToAddress ?? null,
    })
    .where(eq(schema.vendors.id, vendorId));

  const status = await getVendorErc8004Status(vendorId, orgId);
  if (!status) throw new Error("Seller agent not found");
  return status;
}

export async function confirmVendorUriUpdate(
  vendorId: string,
  orgId: string,
  txHash: Hash
): Promise<VendorErc8004Status> {
  const vendor = await loadVendor(vendorId);
  if (!vendor?.erc8004AgentId) throw new Error("Seller is not registered on ERC-8004");

  const db = getDb();
  await db.update(schema.vendors).set({ erc8004UriTx: txHash }).where(eq(schema.vendors.id, vendorId));

  const status = await getVendorErc8004Status(vendorId, orgId);
  if (!status) throw new Error("Seller agent not found");
  if (status.nextStep === "done" && vendor.erc8004Status !== "complete") {
    await db
      .update(schema.vendors)
      .set({ erc8004Status: "complete" })
      .where(eq(schema.vendors.id, vendorId));
    const refreshed = await getVendorErc8004Status(vendorId, orgId);
    if (!refreshed) throw new Error("Seller agent not found");
    return refreshed;
  }
  return status;
}

export async function prepareVendorWalletLink(
  vendorId: string,
  orgId: string,
  treasuryAddress: string
): Promise<{
  agentId: string;
  newWallet: Address;
  owner: Address;
  deadline: string;
  signature: Hex;
}> {
  const vendor = await loadVendor(vendorId);
  if (!vendor?.erc8004AgentId) throw new Error("Seller is not registered on ERC-8004");

  const payWallet = sellerWallet(vendor);
  if (!payWallet || !isAddress(payWallet)) {
    throw new Error("Seller payment wallet is not configured");
  }
  if (!env.vendorWalletPrivateKey || !vendorKeyMatchesPayTo(env.vendorWalletPrivateKey, payWallet)) {
    throw new Error("Seller wallet private key is not configured for wallet link");
  }

  const treasury = await loadTreasury(orgId);
  if (!treasury || getAddress(treasury) !== getAddress(treasuryAddress as Address)) {
    throw new Error("Connected wallet does not match org treasury");
  }

  const { deadline, signature } = await prepareAgentWalletLinkSignature({
    agentId: BigInt(vendor.erc8004AgentId),
    newWallet: getAddress(payWallet as Address),
    owner: getAddress(treasuryAddress as Address),
    agentPrivateKey: env.vendorWalletPrivateKey,
  });

  return {
    agentId: vendor.erc8004AgentId,
    newWallet: getAddress(payWallet as Address),
    owner: getAddress(treasuryAddress as Address),
    deadline: deadline.toString(),
    signature,
  };
}

export async function confirmVendorWalletLink(
  vendorId: string,
  orgId: string,
  txHash: Hash
): Promise<VendorErc8004Status> {
  const vendor = await loadVendor(vendorId);
  if (!vendor?.erc8004AgentId) throw new Error("Seller is not registered on ERC-8004");

  const payWallet = sellerWallet(vendor);
  const onChain = await readOnChainIdentity(BigInt(vendor.erc8004AgentId), payWallet);
  if (!onChain.walletMatches) {
    throw new Error("On-chain verified wallet does not match seller payment wallet yet");
  }

  const db = getDb();
  await db
    .update(schema.vendors)
    .set({ erc8004Status: "complete", erc8004WalletTx: txHash })
    .where(eq(schema.vendors.id, vendorId));

  const status = await getVendorErc8004Status(vendorId, orgId);
  if (!status) throw new Error("Seller agent not found");
  return status;
}
