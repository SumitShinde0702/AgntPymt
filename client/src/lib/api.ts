export const apiBase = import.meta.env.VITE_API_URL ?? "";

export function apiUrl(path: string): string {
  return new URL(path, apiBase || window.location.origin).toString();
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export type DashboardData = {
  kpis: {
    totalBalanceUsd: number;
    activeAgents: string;
    pendingApprovals: number;
    spend30DaysUsd: number;
  };
  agents: Agent[];
  pendingApprovals: Approval[];
  recentTransactions: Transaction[];
  activeWallets: number;
};

export type AgentPolicy = {
  agentId: string;
  autoApproveLimitUsd: number;
  requireWalletConfirmation: boolean;
  autoSettlementEnabled: boolean;
  negotiationRules: string | null;
};

export type Agent = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  status: string;
  iconColor: string;
  walletAddress: string | null;
  balanceUsd: number;
};

export type Approval = {
  id: string;
  agentId: string;
  vendorName: string;
  amountUsd: number;
  reason: string;
  status: string;
  requestedAt: string;
};

export type Transaction = {
  id: string;
  agentId: string;
  vendorName: string;
  description: string;
  amountUsd: number;
  status: string;
  txHash: string | null;
  createdAt: string;
};

export type RunEvent = {
  runId: string;
  step: string;
  message: string;
  actor?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export type HealthData = {
  status: string;
  daemon: string;
  simulatePayments: boolean;
  paymentMode?: string;
  facilitatorUrl?: string;
  demoTransactionFeeUsd?: number;
  aiNegotiation?: boolean;
  network: string;
};

export type AgentWalletRow = {
  id: string;
  name: string;
  category: string;
  iconColor: string;
  status: string;
  walletAddress: string | null;
  walletProvisioned: boolean;
  ledgerBalanceUsd: number;
  onChain: { eth: number; usdc: number };
};

export type WalletsOverview = {
  network: string;
  treasury: { address: string; balances: { eth: number; usdc: number } | null } | null;
  agents: AgentWalletRow[];
};
