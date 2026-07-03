import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const mcpEntry = path.join(root, "server", "src", "mcp", "index.ts");

const child = spawn(node, [path.join(root, "server", "dist", "mcp", "index.js")], {
  cwd: root,
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
    AGENT_ID: process.env.AGENT_ID ?? "agent_1782747879372",
    AGNTPYMT_MCP_KEY: "dev-mcp-key",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let out = "";
child.stdout.on("data", (d) => {
  out += d.toString();
  console.log("STDOUT:", d.toString().slice(0, 500));
});
child.stderr.on("data", (d) => console.error("STDERR:", d.toString()));

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
child.stdin.write(JSON.stringify(init) + "\n");

setTimeout(() => {
  const tools = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
  child.stdin.write(JSON.stringify(tools) + "\n");
}, 3000);

setTimeout(() => {
  const call = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "agntpymt_get_agent_policy",
      arguments: { agentId: "agent_1782747879372" },
    },
  };
  child.stdin.write(JSON.stringify(call) + "\n");
}, 8000);

setTimeout(() => {
  child.kill();
  console.log("--- done ---");
  process.exit(out.includes("agent") ? 0 : 1);
}, 20000);
