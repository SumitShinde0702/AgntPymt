import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const API_URL = process.env.AGNTPYMT_API_URL ?? "http://localhost:3001";

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`);
  return res.json();
}

const server = new Server({ name: "agntpymt", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "agntpymt_initiate_purchase",
      description: "Initiate a purchase with vendor negotiation and policy enforcement",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          purchaseIntent: { type: "string" },
          runId: { type: "string" },
          category: { type: "string" },
          maxBudget: { type: "number" },
        },
        required: ["agentId", "purchaseIntent"],
      },
    },
    {
      name: "agntpymt_request_paid_resource",
      description: "Shortcut alias for catalog resources (premium-data, premium-compute)",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          resourceId: { type: "string" },
          runId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["agentId", "resourceId"],
      },
    },
    {
      name: "agntpymt_list_pending_approvals",
      description: "List pending payment approvals",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "agntpymt_list_agents",
      description: "List all agents",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  if (name === "agntpymt_initiate_purchase") {
    const result = await apiPost("/api/agent/execute", {
      agentId: a.agentId,
      purchaseIntent: a.purchaseIntent,
      runId: a.runId,
      category: a.category,
      maxBudget: a.maxBudget,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "agntpymt_request_paid_resource") {
    const result = await apiPost("/api/agent/execute", {
      agentId: a.agentId,
      resourceId: a.resourceId,
      purchaseIntent: a.reason ?? `Request resource ${a.resourceId}`,
      runId: a.runId,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "agntpymt_list_pending_approvals") {
    const result = await apiGet("/api/approvals");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "agntpymt_list_agents") {
    const result = await apiGet("/api/agents");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
