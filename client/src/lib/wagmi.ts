import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "viem/chains";

export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const wagmiConfig = getDefaultConfig({
  appName: import.meta.env.VITE_APP_NAME ?? "AgntPymt",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [baseSepolia],
  ssr: false,
});

export const TARGET_CHAIN = baseSepolia;
