import { randomUUID } from "node:crypto";
import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../config.js";
import { createAgnTpymtMcpServer } from "./create-server.js";

type McpSession = {
  transport: StreamableHTTPServerTransport;
  server: Server;
};

/** One transport+server per MCP session (Hermes opens a new session per gateway connection). */
const sessions = new Map<string, McpSession>();

function mcpKeyOk(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  return token === env.mcpServiceKey;
}

function isInitBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  if (Array.isArray(body)) return body.some((m) => isInitializeRequest(m));
  return isInitializeRequest(body);
}

async function createSession(): Promise<McpSession> {
  const sessionId = randomUUID();
  let entry!: McpSession;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
    onsessioninitialized: (id) => {
      sessions.set(id, entry);
    },
  });
  const server = createAgnTpymtMcpServer();
  entry = { transport, server };
  await server.connect(transport);
  sessions.set(sessionId, entry);
  return entry;
}

async function resolveSession(req: Request): Promise<McpSession | null> {
  const headerId = req.headers["mcp-session-id"];
  const sessionId = typeof headerId === "string" ? headerId : undefined;

  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  if (isInitBody(req.body)) {
    return createSession();
  }

  return null;
}

export function mcpHttpRouter(): Router {
  const router = createRouter();

  router.use((req, res, next) => {
    if (!mcpKeyOk(req.headers.authorization)) {
      return res.status(401).json({ error: "Invalid MCP service key" });
    }
    next();
  });

  const handle = async (req: Request, res: Response) => {
    try {
      const session = await resolveSession(req);
      if (!session) {
        return res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: Mcp-Session-Id header is required" },
          id: null,
        });
      }
      await session.transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP HTTP request failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "MCP request failed" });
      }
    }
  };

  router.get("/", handle);
  router.post("/", handle);
  router.delete("/", handle);

  return router;
}
