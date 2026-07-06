import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  mcpExecutePurchase,
  mcpGetAgentPolicy,
  mcpListApprovals,
  mcpListTransactions,
  resolveAgentId,
  resolveRunId,
} from "./tools.js";

export function createAgnTpymtMcpServer(): Server {
  const server = new Server({ name: "agntpymt", version: "0.3.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "agntpymt_get_agent_policy",
        description: "Returns agent identity, wallet, and auto-approve spend limit",
        inputSchema: {
          type: "object",
          properties: { agentId: { type: "string" }, runId: { type: "string" } },
        },
      },
      {
        name: "agntpymt_initiate_purchase",
        description: "Initiate a purchase with vendor matching, policy enforcement, and settlement",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            runId: { type: "string" },
            purchaseIntent: { type: "string" },
            task: { type: "string" },
            category: { type: "string" },
            maxBudget: { type: "number" },
          },
          required: ["purchaseIntent"],
        },
      },
      {
        name: "agntpymt_request_paid_resource",
        description: "Request premium-data or premium-compute through AgntPymt payment governance",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            runId: { type: "string" },
            resourceId: { type: "string" },
            resource_id: { type: "string", enum: ["premium-data", "premium-compute"] },
            task: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      {
        name: "agntpymt_list_pending_approvals",
        description: "List pending payment approvals",
        inputSchema: { type: "object", properties: { agentId: { type: "string" } } },
      },
      {
        name: "agntpymt_list_transactions",
        description: "Audit ledger of agent payment activity",
        inputSchema: { type: "object", properties: { agentId: { type: "string" } } },
      },
      {
        name: "agntpymt_list_agents",
        description: "List agents in the org (uses MCP agent scope)",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    try {
      if (name === "agntpymt_get_agent_policy") {
        const agentId = await resolveAgentId(a);
        const result = await mcpGetAgentPolicy(agentId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      if (name === "agntpymt_initiate_purchase") {
        const agentId = await resolveAgentId(a);
        const purchaseIntent = String(a.purchaseIntent ?? a.task ?? "");
        const runId = await resolveRunId(agentId, a);
        const result = await mcpExecutePurchase({
          agentId,
          purchaseIntent,
          runId,
          category: typeof a.category === "string" ? a.category : undefined,
          maxBudget: typeof a.maxBudget === "number" ? a.maxBudget : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      if (name === "agntpymt_request_paid_resource") {
        const agentId = await resolveAgentId(a);
        const resourceId = String(a.resourceId ?? a.resource_id ?? "premium-data");
        const runId = await resolveRunId(agentId, a);
        const result = await mcpExecutePurchase({
          agentId,
          resourceId,
          runId,
          purchaseIntent: String(a.task ?? a.reason ?? `Request resource ${resourceId}`),
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      if (name === "agntpymt_list_pending_approvals") {
        const agentId = await resolveAgentId(a);
        const result = await mcpListApprovals(agentId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      if (name === "agntpymt_list_transactions") {
        const agentId = await resolveAgentId(a);
        const result = await mcpListTransactions(agentId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      if (name === "agntpymt_list_agents") {
        const agentId = await resolveAgentId(a);
        const result = await mcpGetAgentPolicy(agentId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "MCP tool failed";
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
        isError: true,
      };
    }
  });

  return server;
}
