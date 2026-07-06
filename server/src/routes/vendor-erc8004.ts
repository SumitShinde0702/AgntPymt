import { Router } from "express";
import { z } from "zod";
import { isAddress, type Hash } from "viem";
import { getOrgId } from "../middleware/auth.js";
import { ERC8004_IDENTITY_REGISTRY } from "../chain/erc8004/index.js";
import {
  confirmVendorRegistration,
  confirmVendorUriUpdate,
  confirmVendorWalletLink,
  getVendorErc8004Status,
  prepareVendorRegistrationUri,
  prepareVendorWalletLink,
} from "../services/vendor-erc8004.js";
import { eq, getDb, schema } from "@agntpymt/db";

export const vendorErc8004Router = Router({ mergeParams: true });

type VendorParams = { id: string };

function vendorIdFrom(req: { params: unknown }): string {
  return (req.params as VendorParams).id;
}

async function loadVendor(vendorId: string) {
  const db = getDb();
  const [vendor] = await db.select().from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  return vendor ?? null;
}

vendorErc8004Router.get("/", async (req, res) => {
  try {
    const status = await getVendorErc8004Status(vendorIdFrom(req), getOrgId(req));
    if (!status) return res.status(404).json({ error: "Seller agent not found" });
    res.json(status);
  } catch (err) {
    console.error("vendor erc8004 status:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load identity status" });
  }
});

vendorErc8004Router.get("/registration-uri", async (req, res) => {
  const vendor = await loadVendor(vendorIdFrom(req));
  if (!vendor) return res.status(404).json({ error: "Seller agent not found" });

  const agentIdParam = req.query.agentId;
  const chainAgentId =
    agentIdParam != null && String(agentIdParam).length > 0
      ? BigInt(String(agentIdParam))
      : vendor.erc8004AgentId
        ? BigInt(vendor.erc8004AgentId)
        : null;

  res.json({ agentUri: prepareVendorRegistrationUri(vendor, chainAgentId) });
});

const txBody = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  treasuryAddress: z.string().refine((v) => isAddress(v), "Invalid treasury address").optional(),
});

vendorErc8004Router.post("/register/confirm", async (req, res) => {
  const parsed = txBody
    .extend({ treasuryAddress: z.string().refine((v) => isAddress(v)) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const status = await confirmVendorRegistration(
      vendorIdFrom(req),
      getOrgId(req),
      parsed.data.txHash as Hash,
      parsed.data.treasuryAddress
    );
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Registration failed" });
  }
});

vendorErc8004Router.post("/uri/confirm", async (req, res) => {
  const parsed = txBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const status = await confirmVendorUriUpdate(
      vendorIdFrom(req),
      getOrgId(req),
      parsed.data.txHash as Hash
    );
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "URI update failed" });
  }
});

const walletPrepareBody = z.object({
  treasuryAddress: z.string().refine((v) => isAddress(v), "Invalid treasury address"),
});

vendorErc8004Router.post("/wallet-link/prepare", async (req, res) => {
  const parsed = walletPrepareBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const prepared = await prepareVendorWalletLink(
      vendorIdFrom(req),
      getOrgId(req),
      parsed.data.treasuryAddress
    );
    res.json(prepared);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Prepare failed" });
  }
});

vendorErc8004Router.post("/wallet-link/confirm", async (req, res) => {
  const parsed = txBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  try {
    const status = await confirmVendorWalletLink(
      vendorIdFrom(req),
      getOrgId(req),
      parsed.data.txHash as Hash
    );
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Wallet link failed" });
  }
});

vendorErc8004Router.get("/registry", (_req, res) => {
  res.json({ identityRegistry: ERC8004_IDENTITY_REGISTRY });
});
