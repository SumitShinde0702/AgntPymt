import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(rootDir, ".env") });

export const env = {
  port: Number(process.env.PORT ?? 3001),
  simulatePayments: process.env.SIMULATE_PAYMENTS !== "false",
  demoTransactionFeeUsd: Number(process.env.DEMO_TRANSACTION_FEE_USD ?? 0.01),
  evmPayToAddress: process.env.EVM_PAY_TO_ADDRESS ?? "",
  facilitatorUrl: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator",
  hermesApiUrl: process.env.HERMES_API_URL ?? "http://localhost:8642",
  hermesApiKey: process.env.HERMES_API_KEY ?? "",
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  orgId: "org_demo",
};

export { rootDir };
