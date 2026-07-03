import "./bootstrap.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAgnTpymtMcpServer } from "./create-server.js";

const server = createAgnTpymtMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
