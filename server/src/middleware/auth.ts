import type { NextFunction, Request, Response } from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { env } from "../config.js";
import { getOrCreateTenant } from "../services/tenant.js";

export const authEnabled = Boolean(env.clerkSecretKey && env.clerkPublishableKey);

export type AuthedRequest = Request & {
  orgId: string;
  clerkUserId?: string;
};

export function getOrgId(req: Request): string {
  return (req as AuthedRequest).orgId ?? env.orgId;
}

function isPublicApiPath(path: string): boolean {
  return path === "/health" || path.startsWith("/x402/") || path === "/agent/execute";
}

/** Accept Bearer token via query for legacy EventSource clients (no custom headers). */
function applySseToken(req: Request) {
  const q = req.query.__clerk_token;
  if (typeof q === "string" && q && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${q}`;
  }
}

function wantsEventStream(req: Request): boolean {
  const accept = req.headers.accept ?? "";
  return accept.includes("text/event-stream") || req.path.includes("/events");
}

function unauthorized(req: Request, res: Response) {
  if (wantsEventStream(req)) {
    res.status(401).setHeader("Content-Type", "text/plain").end("Unauthorized");
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}

export function installClerkMiddleware() {
  if (!authEnabled) return (_req: Request, _res: Response, next: NextFunction) => next();
  return clerkMiddleware({
    secretKey: env.clerkSecretKey,
    publishableKey: env.clerkPublishableKey,
  });
}

export async function apiAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isPublicApiPath(req.path)) return next();

  if (!authEnabled) {
    (req as AuthedRequest).orgId = env.orgId;
    return next();
  }

  applySseToken(req);

  const { userId } = getAuth(req);
  if (!userId) {
    unauthorized(req, res);
    return;
  }

  try {
    await resolveTenant(req, res, next);
  } catch (err) {
    next(err);
  }
}

async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const tenant = await getOrCreateTenant(userId);
  (req as AuthedRequest).orgId = tenant.orgId;
  (req as AuthedRequest).clerkUserId = userId;
  next();
}
