import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "@agntpymt/db";
import { getDb, schema, type Agent } from "@agntpymt/db";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { env, rootDir } from "../config.js";

const AGNTPYMT_MCP_NAME = "agntpymt";

export type HermesSkill = {
  id: string;
  name: string;
  description: string;
  content: string;
};

export type HermesMcpServer = {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  enabled?: boolean;
  protected?: boolean;
};

export type HermesCapabilities = {
  skills: HermesSkill[];
  mcpServers: HermesMcpServer[];
};

export type HermesProfileStatus = {
  profileName: string;
  profilePath: string;
  provisioned: boolean;
  soul: string;
  capabilities: HermesCapabilities;
};

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Legacy path used before Windows-native Hermes home was implemented. */
function legacyHermesHomeDir(): string {
  return path.join(os.homedir(), ".hermes");
}

/** Match Hermes: %LOCALAPPDATA%\\hermes on Windows, ~/.hermes elsewhere. */
export function getHermesHomeDir(): string {
  const explicit = process.env.HERMES_HOME?.trim();
  if (explicit) return expandHome(explicit);
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    if (local) return path.join(local, "hermes");
    return path.join(os.homedir(), "AppData", "Local", "hermes");
  }
  return path.join(os.homedir(), ".hermes");
}

export function getProfilesDir(): string {
  const explicit = process.env.HERMES_PROFILES_DIR?.trim();
  if (explicit) return expandHome(explicit);
  return path.join(getHermesHomeDir(), "profiles");
}

/** Copy agent profiles from ~/.hermes/profiles when upgrading Windows paths. */
export async function migrateLegacyHermesProfiles(): Promise<void> {
  const legacy = path.join(legacyHermesHomeDir(), "profiles");
  const target = getProfilesDir();
  if (legacy === target) return;

  let entries: string[];
  try {
    entries = await fs.readdir(legacy);
  } catch {
    return;
  }

  await fs.mkdir(target, { recursive: true });
  for (const entry of entries) {
    const src = path.join(legacy, entry);
    const dest = path.join(target, entry);
    try {
      await fs.access(dest);
      continue;
    } catch {
      await fs.cp(src, dest, { recursive: true });
      console.log(`Migrated Hermes profile ${entry} → ${target}`);
    }
  }
}

export function profileNameForAgent(orgId: string, agentId: string): string {
  return `${orgId}__${agentId}`;
}

export function profileDirForAgent(agent: Pick<Agent, "orgId" | "id" | "hermesProfileName">): string {
  const name = agent.hermesProfileName ?? profileNameForAgent(agent.orgId, agent.id);
  return path.join(getProfilesDir(), name);
}

function agntpymtApiUrl(): string {
  const raw = process.env.AGNTPYMT_API_URL ?? `http://127.0.0.1:${env.port}`;
  return raw.replace(/^http:\/\/localhost\b/i, "http://127.0.0.1");
}

async function defaultGatewayAgentId(): Promise<string> {
  const db = getDb();
  const [agent] = await db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.orgId, env.orgId))
    .limit(1);
  return agent?.id ?? "";
}

function mcpHttpUrl(): string {
  return `${agntpymtApiUrl()}/mcp`;
}

function mcpAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.AGNTPYMT_MCP_KEY ?? "dev-mcp-key"}`,
  };
}

function buildPaymentSkillMd(agentId: string): string {
  return `---
name: agntpymt-payments
description: Use AgntPymt MCP tools for governed purchases (policy, settlement, approvals).
---

# AgntPymt payment tools

When spending money, always pass **agentId** (\`${agentId}\`) and **runId** (from runtime instructions) on every MCP call.

## Buy / pay workflow (follow in order)

1. \`agntpymt_get_agent_policy\` — wallet balance and auto-approve limit only.
2. **Always call** \`agntpymt_initiate_purchase\` with \`purchaseIntent\` + \`runId\` (or \`agntpymt_request_paid_resource\` with resourceId \`premium-data\`).
3. Read the JSON result: \`completed\`, \`pending_approval\`, or \`error\`.
4. If \`pending_approval\`, tell the user — they approve in the AgntPymt dashboard.

## Rules

- **Never skip step 2.** Do not end a purchase task after policy/transactions/session_search only.
- Never skip AgntPymt for paid resources.
- Always include \`runId\` so payment steps appear in the dashboard run.
- **There is no $1.50 list price.** Demo vendor price is ~$0.01–$0.02 USDC from the purchase tool. Do not invent amounts.
- **402 is not "limit too low".** x402 is the on-chain USDC payment protocol. Low auto-approve → \`pending_approval\` from the tool.
- Do not use \`session_search\` to reuse old purchases or skip payment.
- If MCP tools fail, say so plainly — do not invent transaction IDs or offer "Option 1: reuse prior data".
- Seller negotiation appears in the dashboard run feed after you call the purchase tool.
`;
}

async function ensurePaymentSkill(profilePath: string, agentId: string): Promise<void> {
  const skillDir = path.join(profilePath, "skills", "agntpymt-payments");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), buildPaymentSkillMd(agentId), "utf8");
}

function buildSoulSeed(
  agent: Pick<Agent, "name" | "description" | "category">,
  negotiationRules?: string | null
): string {
  const lines = [
    `# ${agent.name}`,
    "",
    `You are **${agent.name}**, an autonomous agent in the AgntPymt fleet.`,
    "",
    `**Category:** ${agent.category}`,
  ];
  if (agent.description?.trim()) {
    lines.push("", agent.description.trim());
  }
  lines.push(
    "",
    "## Payment governance",
    "",
    "When a task requires spending money, use the `agntpymt_initiate_purchase` MCP tool.",
    "Respect auto-approve limits and negotiation rules. Never bypass human approval when required.",
    ""
  );
  if (negotiationRules?.trim()) {
    lines.push("## Negotiation rules", "", negotiationRules.trim(), "");
  }
  return lines.join("\n");
}

function mcpEnvForAgent(agentId: string): Record<string, string> {
  const block: Record<string, string> = {
    AGNTPYMT_API_URL: agntpymtApiUrl(),
    AGENT_ID: agentId,
    AGNTPYMT_MCP_KEY: process.env.AGNTPYMT_MCP_KEY ?? "dev-mcp-key",
  };
  if (process.env.DATABASE_URL) block.DATABASE_URL = process.env.DATABASE_URL;
  return block;
}

function agntpymtMcpBlock(agentId: string): Record<string, unknown> {
  // HTTP MCP on the already-running API — no stdio subprocess cold start.
  return {
    url: mcpHttpUrl(),
    headers: mcpAuthHeaders(),
    env: mcpEnvForAgent(agentId),
    enabled: true,
    timeout: 300,
    connect_timeout: 30,
  };
}

/** Gateway loads MCP from the platform Hermes home — keep it in sync with AgntPymt-1. */
export async function syncHermesGatewayMcpConfig(agentId = ""): Promise<void> {
  const hermesHome = getHermesHomeDir();
  const configPath = path.join(hermesHome, "config.yaml");
  let config: Record<string, unknown>;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    config = (parseYaml(raw) as Record<string, unknown>) ?? {};
  } catch {
    config = {};
  }

  const mcp = (config.mcp_servers ?? {}) as Record<string, Record<string, unknown>>;
  const existingAgentId =
    typeof mcp[AGNTPYMT_MCP_NAME]?.env === "object" &&
    mcp[AGNTPYMT_MCP_NAME].env !== null &&
    "AGENT_ID" in (mcp[AGNTPYMT_MCP_NAME].env as Record<string, string>)
      ? String((mcp[AGNTPYMT_MCP_NAME].env as Record<string, string>).AGENT_ID)
      : "";

  const resolvedAgentId =
    agentId.trim() || (await defaultGatewayAgentId()) || existingAgentId.trim();
  if (!resolvedAgentId) {
    console.warn("Hermes MCP sync skipped: no agents in DB to set AGENT_ID");
    return;
  }
  mcp[AGNTPYMT_MCP_NAME] = agntpymtMcpBlock(resolvedAgentId);
  config.mcp_servers = mcp;
  config.mcp_discovery_timeout = 30;
  const nextYaml = stringifyYaml(config);
  let prevYaml = "";
  try {
    prevYaml = await fs.readFile(configPath, "utf8");
  } catch {
    /* new file */
  }
  if (prevYaml === nextYaml) return;

  await fs.mkdir(hermesHome, { recursive: true });
  await fs.writeFile(configPath, nextYaml, "utf8");
  console.log(`Synced agntpymt MCP → ${configPath}`);
}

/** Hermes runs use per-agent profile config — must match gateway MCP launch spec. */
export async function syncProfileMcpConfig(profilePath: string, agentId: string): Promise<void> {
  const config = await readConfig(profilePath);
  const mcp = (config.mcp_servers ?? {}) as Record<string, Record<string, unknown>>;
  mcp[AGNTPYMT_MCP_NAME] = agntpymtMcpBlock(agentId);
  config.mcp_servers = mcp;
  await writeConfig(profilePath, config);
}

export async function syncAllProvisionedProfileMcp(): Promise<number> {
  const db = getDb();
  const agents = await db.select().from(schema.agents);
  let count = 0;
  for (const agent of agents) {
    if (!agent.hermesProvisioned) continue;
    const profilePath = profileDirForAgent(agent);
    await syncProfileMcpConfig(profilePath, agent.id);
    count += 1;
  }
  return count;
}

async function readConfig(profilePath: string): Promise<Record<string, unknown>> {
  const configPath = path.join(profilePath, "config.yaml");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = parseYaml(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function writeConfig(profilePath: string, config: Record<string, unknown>): Promise<void> {
  const configPath = path.join(profilePath, "config.yaml");
  await fs.writeFile(configPath, stringifyYaml(config), "utf8");
}

function parseSkillFrontmatter(content: string): { name: string; description: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) {
    return { name: "", description: "", body: content };
  }
  const fm = parseYaml(match[1]) as Record<string, unknown>;
  return {
    name: String(fm.name ?? ""),
    description: String(fm.description ?? ""),
    body: match[2],
  };
}

function buildSkillMd(name: string, description: string, body: string): string {
  const fm = stringifyYaml({ name, description }).trim();
  return `---\n${fm}\n---\n\n${body.trimStart()}`;
}

export async function scanSkills(profilePath: string): Promise<HermesSkill[]> {
  const skillsDir = path.join(profilePath, "skills");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    return [];
  }

  const skills: HermesSkill[] = [];
  for (const entry of entries) {
    const skillPath = path.join(skillsDir, entry, "SKILL.md");
    try {
      const content = await fs.readFile(skillPath, "utf8");
      const parsed = parseSkillFrontmatter(content);
      skills.push({
        id: entry,
        name: parsed.name || entry,
        description: parsed.description,
        content,
      });
    } catch {
      // skip invalid skill folders
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseMcpServers(config: Record<string, unknown>): HermesMcpServer[] {
  const block = config.mcp_servers;
  if (!block || typeof block !== "object") return [];

  return Object.entries(block as Record<string, Record<string, unknown>>).map(([name, spec]) => ({
    name,
    command: spec.command as string | undefined,
    args: spec.args as string[] | undefined,
    url: spec.url as string | undefined,
    env: spec.env as Record<string, string> | undefined,
    headers: spec.headers as Record<string, string> | undefined,
    enabled: spec.enabled as boolean | undefined,
    protected: name === AGNTPYMT_MCP_NAME,
  }));
}

export async function getCapabilities(profilePath: string): Promise<HermesCapabilities> {
  const config = await readConfig(profilePath);
  const skills = await scanSkills(profilePath);
  return { skills, mcpServers: parseMcpServers(config) };
}

export async function readSoul(profilePath: string): Promise<string> {
  try {
    return await fs.readFile(path.join(profilePath, "SOUL.md"), "utf8");
  } catch {
    return "";
  }
}

export async function writeSoul(profilePath: string, soul: string): Promise<void> {
  await fs.writeFile(path.join(profilePath, "SOUL.md"), soul, "utf8");
}

export async function provisionProfile(
  agent: Agent,
  policy?: { negotiationRules?: string | null }
): Promise<HermesProfileStatus> {
  const profileName = profileNameForAgent(agent.orgId, agent.id);
  const profilePath = path.join(getProfilesDir(), profileName);

  await fs.mkdir(path.join(profilePath, "skills"), { recursive: true });

  const soulPath = path.join(profilePath, "SOUL.md");
  try {
    await fs.access(soulPath);
  } catch {
    await fs.writeFile(soulPath, buildSoulSeed(agent, policy?.negotiationRules), "utf8");
  }

  await syncProfileMcpConfig(profilePath, agent.id);
  await ensurePaymentSkill(profilePath, agent.id);
  await syncHermesGatewayMcpConfig(agent.id);

  const db = getDb();
  await db
    .update(schema.agents)
    .set({ hermesProfileName: profileName, hermesProvisioned: true })
    .where(eq(schema.agents.id, agent.id));

  const soul = await readSoul(profilePath);
  const capabilities = await getCapabilities(profilePath);

  return {
    profileName,
    profilePath,
    provisioned: true,
    soul,
    capabilities,
  };
}

export async function ensureHermesProfile(agentId: string): Promise<HermesProfileStatus | null> {
  const db = getDb();
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId));
  if (!agent) return null;

  const [policy] = await db
    .select()
    .from(schema.agentPolicies)
    .where(eq(schema.agentPolicies.agentId, agentId));

  if (!agent.hermesProvisioned) {
    return provisionProfile(agent, policy);
  }

  const profilePath = profileDirForAgent(agent);
  await syncProfileMcpConfig(profilePath, agent.id);
  await ensurePaymentSkill(profilePath, agent.id);
  await syncHermesGatewayMcpConfig(agent.id);
  return {
    profileName: agent.hermesProfileName ?? profileNameForAgent(agent.orgId, agent.id),
    profilePath,
    provisioned: true,
    soul: await readSoul(profilePath),
    capabilities: await getCapabilities(profilePath),
  };
}

export async function ensureAllHermesProfiles(orgId: string): Promise<number> {
  const db = getDb();
  const agents = await db.select().from(schema.agents).where(eq(schema.agents.orgId, orgId));
  let count = 0;
  for (const agent of agents) {
    if (!agent.hermesProvisioned) {
      await ensureHermesProfile(agent.id);
    }
    count += 1;
  }
  return count;
}

export async function getHermesProfileStatus(agent: Agent): Promise<HermesProfileStatus> {
  const status = await ensureHermesProfile(agent.id);
  if (!status) throw new Error("Agent not found");
  return status;
}

export async function createSkill(
  profilePath: string,
  id: string,
  name: string,
  description: string,
  body: string
): Promise<HermesSkill> {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const skillDir = path.join(profilePath, "skills", safeId);
  await fs.mkdir(skillDir, { recursive: true });
  const content = buildSkillMd(name, description, body);
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
  return { id: safeId, name, description, content };
}

export async function updateSkill(
  profilePath: string,
  skillId: string,
  name: string,
  description: string,
  body: string
): Promise<HermesSkill> {
  const skillDir = path.join(profilePath, "skills", skillId);
  const content = buildSkillMd(name, description, body);
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
  return { id: skillId, name, description, content };
}

export async function deleteSkill(profilePath: string, skillId: string): Promise<void> {
  await fs.rm(path.join(profilePath, "skills", skillId), { recursive: true, force: true });
}

export async function upsertMcpServer(
  profilePath: string,
  server: Omit<HermesMcpServer, "protected">
): Promise<HermesMcpServer[]> {
  const config = await readConfig(profilePath);
  const mcp = (config.mcp_servers ?? {}) as Record<string, Record<string, unknown>>;

  if (server.name === AGNTPYMT_MCP_NAME) {
    const existing = mcp[AGNTPYMT_MCP_NAME] ?? {};
    mcp[AGNTPYMT_MCP_NAME] = {
      ...existing,
      ...server,
      env: { ...(existing.env as Record<string, string>), ...(server.env ?? {}) },
    };
  } else {
    mcp[server.name] = {
      command: server.command,
      args: server.args,
      url: server.url,
      env: server.env,
      headers: server.headers,
      enabled: server.enabled ?? true,
    };
  }

  config.mcp_servers = mcp;
  await writeConfig(profilePath, config);
  return parseMcpServers(config);
}

export async function deleteMcpServer(profilePath: string, name: string): Promise<HermesMcpServer[]> {
  if (name === AGNTPYMT_MCP_NAME) {
    throw new Error("Cannot delete protected agntpymt MCP server");
  }
  const config = await readConfig(profilePath);
  const mcp = (config.mcp_servers ?? {}) as Record<string, unknown>;
  delete mcp[name];
  config.mcp_servers = mcp;
  await writeConfig(profilePath, config);
  return parseMcpServers(config);
}
