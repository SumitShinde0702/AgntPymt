import { Router } from "express";
import { z } from "zod";
import { isAddress, type Hash } from "viem";
import { getOrgId } from "../middleware/auth.js";
import {
  confirmRegistration,
  confirmUriUpdate,
  confirmWalletLink,
  getErc8004Status,
  prepareRegistrationUri,
  prepareWalletLink,
  recordBuyerRatesSeller,
} from "../services/erc8004.js";
import { eq, getDb, schema } from "@agntpymt/db";
export const erc8004Router = Router({ mergeParams: true });

type AgentParams = { id: string };

function agentIdFrom(req: { params: unknown }): string {
  return (req.params as AgentParams).id;
}

async function loadOrgAgent(agentId: string, orgId: string) {  const db = getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId));
  if (!agent || agent.orgId !== orgId) return null;
  return agent;
}

erc8004Router.get("/", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const status = await getErc8004Status(agentIdFrom(req), orgId);
    if (!status) return res.status(404).json({ error: "Agent not found" });
    res.json(status);
  } catch (err) {
    console.error("erc8004 status:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load identity status" });
  }
});

erc8004Router.get("/registration-uri", async (req, res) => {
  const orgId = getOrgId(req);
  const agent = await loadOrgAgent(agentIdFrom(req), orgId);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const agentIdParam = req.query.agentId;
  const chainAgentId =
    agentIdParam != null && String(agentIdParam).length > 0
      ? BigInt(String(agentIdParam))
      : agent.erc8004AgentId
        ? BigInt(agent.erc8004AgentId)
        : null;

  res.json({
    agentUri: prepareRegistrationUri(agent, chainAgentId),
  });
});

const rateSellerBody = z.object({
  vendorId: z.string().min(1),
});

erc8004Router.post("/rate-seller", async (req, res) => {
  const parsed = rateSellerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const orgId = getOrgId(req);
  const agent = await loadOrgAgent(agentIdFrom(req), orgId);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const result = await recordBuyerRatesSeller({
    buyerAgentId: agent.id,
    vendorId: parsed.data.vendorId,
  });

  if (!result.submitted) {
    return res.status(400).json({ error: result.reason ?? "Could not submit rating" });
  }
  res.json(result);
});

const txBody = z.object({  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  treasuryAddress: z.string().refine((v) => isAddress(v), "Invalid treasury address").optional(),
});

erc8004Router.post("/register/confirm", async (req, res) => {
  const parsed = txBody
    .extend({ treasuryAddress: z.string().refine((v) => isAddress(v)) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const status = await confirmRegistration(
      agentIdFrom(req),
      getOrgId(req),
      parsed.data.txHash as Hash,
      parsed.data.treasuryAddress
    );
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Registration failed" });
  }
});

erc8004Router.post("/uri/confirm", async (req, res) => {
  const parsed = txBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const status = await confirmUriUpdate(agentIdFrom(req), getOrgId(req), parsed.data.txHash as Hash);
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "URI update failed" });
  }
});

const walletPrepareBody = z.object({
  treasuryAddress: z.string().refine((v) => isAddress(v), "Invalid treasury address"),
});

erc8004Router.post("/wallet-link/prepare", async (req, res) => {
  const parsed = walletPrepareBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const prepared = await prepareWalletLink(
      agentIdFrom(req),
      getOrgId(req),
      parsed.data.treasuryAddress
    );
    res.json(prepared);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Prepare failed" });
  }
});

erc8004Router.post("/wallet-link/confirm", async (req, res) => {
  const parsed = txBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const status = await confirmWalletLink(agentIdFrom(req), getOrgId(req), parsed.data.txHash as Hash);
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Wallet link failed" });
  }
});
