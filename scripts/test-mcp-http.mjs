/**
 * Simulate Hermes-style MCP HTTP: initialize session, then tools/call.
 */
const base = "http://127.0.0.1:3001/mcp";
const headers = {
  Authorization: "Bearer dev-mcp-key",
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
};

const initRes = await fetch(base, { method: "POST", headers, body: JSON.stringify(init) });
if (!initRes.ok) {
  console.error("init failed", initRes.status, await initRes.text());
  process.exit(1);
}
const sessionId = initRes.headers.get("mcp-session-id");
console.log("session", sessionId);

const callHeaders = { ...headers, "mcp-session-id": sessionId ?? "" };
const call = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "agntpymt_get_agent_policy",
    arguments: { agentId: "agent_1782747879372" },
  },
};

const callRes = await fetch(base, { method: "POST", headers: callHeaders, body: JSON.stringify(call) });
const body = await callRes.text();
console.log("call status", callRes.status);
console.log(body.slice(0, 500));
process.exit(callRes.ok && body.includes("agent") ? 0 : 1);
