import {
  type Address,
  type Hash,
  type Hex,
  decodeEventLog,
  getAddress,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../wallet.js";
import { identityRegistryAbi } from "./abis.js";
import { ERC8004_IDENTITY_REGISTRY } from "./constants.js";

const WALLET_LINK_DEADLINE_SEC = 5 * 60;

const agentWalletSetTypes = {
  AgentWalletSet: [
    { name: "agentId", type: "uint256" },
    { name: "newWallet", type: "address" },
    { name: "owner", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type OnChainAgentIdentity = {
  agentId: string;
  owner: Address | null;
  tokenUri: string | null;
  verifiedWallet: Address | null;
  walletMatches: boolean;
};

export async function readOnChainIdentity(
  agentId: bigint,
  operationalWallet?: string | null
): Promise<OnChainAgentIdentity> {
  try {
    const [owner, tokenUri, verifiedWallet] = await Promise.all([
      publicClient.readContract({
        address: ERC8004_IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "ownerOf",
        args: [agentId],
      }),
      publicClient.readContract({
        address: ERC8004_IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "tokenURI",
        args: [agentId],
      }),
      publicClient.readContract({
        address: ERC8004_IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: "getAgentWallet",
        args: [agentId],
      }),
    ]);

    const wallet =
      verifiedWallet && verifiedWallet !== zeroAddress ? getAddress(verifiedWallet) : null;
    const op = operationalWallet ? getAddress(operationalWallet as Address) : null;

    return {
      agentId: agentId.toString(),
      owner: getAddress(owner),
      tokenUri,
      verifiedWallet: wallet,
      walletMatches: Boolean(wallet && op && wallet.toLowerCase() === op.toLowerCase()),
    };
  } catch {
    return {
      agentId: agentId.toString(),
      owner: null,
      tokenUri: null,
      verifiedWallet: null,
      walletMatches: false,
    };
  }
}

export function parseRegisteredAgentId(
  receipt: { logs: ReadonlyArray<{ address: Address; data: Hex; topics: readonly Hex[] }> }
): bigint | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ERC8004_IDENTITY_REGISTRY.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: identityRegistryAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === "Registered") {
        return decoded.args.agentId as bigint;
      }
    } catch {
      // not a Registered event
    }
  }
  return null;
}

export async function prepareAgentWalletLinkSignature(params: {
  agentId: bigint;
  newWallet: Address;
  owner: Address;
  agentPrivateKey: Hex;
}): Promise<{ deadline: bigint; signature: Hex }> {
  const domain = await publicClient.readContract({
    address: ERC8004_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "eip712Domain",
  });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + WALLET_LINK_DEADLINE_SEC);
  const account = privateKeyToAccount(params.agentPrivateKey);

  const signature = await account.signTypedData({
    domain: {
      name: domain[1],
      version: domain[2],
      chainId: domain[3],
      verifyingContract: domain[4],
    },
    types: agentWalletSetTypes,
    primaryType: "AgentWalletSet",
    message: {
      agentId: params.agentId,
      newWallet: params.newWallet,
      owner: params.owner,
      deadline,
    },
  });

  return { deadline, signature };
}

export async function fetchRegistrationTxAgentId(txHash: Hash): Promise<bigint | null> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return null;
  return parseRegisteredAgentId(receipt);
}
