import { env } from "../config.js";

export type AgentProfileSuggestion = {
  name: string;
  category: string;
  description: string;
  iconColor: "violet" | "blue" | "green" | "orange";
  negotiationRules: string;
  autoApproveLimitUsd: number;
};

const VALID_COLORS = new Set(["violet", "blue", "green", "orange"]);

function keywordFallback(prompt: string): AgentProfileSuggestion {
  const lower = prompt.toLowerCase();

  if (/travel|flight|hotel|booking/.test(lower)) {
    return {
      name: "Travel Agent",
      category: "travel",
      description: prompt.trim(),
      iconColor: "green",
      negotiationRules:
        "You book travel. Negotiate politely — aim for the lowest fare but accept vendor floor prices when reasonable.",
      autoApproveLimitUsd: 0.05,
    };
  }
  if (/procure|office|supplies|vendor|order/.test(lower)) {
    return {
      name: "Procurement Agent",
      category: "procurement",
      description: prompt.trim(),
      iconColor: "blue",
      negotiationRules:
        "You procure supplies and services. Prefer instant buys at list price when under $0.02. Be concise and cost-conscious.",
      autoApproveLimitUsd: 0.05,
    };
  }
  if (/cloud|aws|azure|gcp|infrastructure|invoice/.test(lower)) {
    return {
      name: "Cloud Ops Agent",
      category: "cloud",
      description: prompt.trim(),
      iconColor: "orange",
      negotiationRules:
        "You pay cloud invoices. Negotiate firmly on large quotes. Anything above the auto-approve limit must escalate to a human.",
      autoApproveLimitUsd: 0.05,
    };
  }
  if (/research|market|data|report|intelligence/.test(lower)) {
    return {
      name: "Research Agent",
      category: "research",
      description: prompt.trim(),
      iconColor: "violet",
      negotiationRules:
        "You buy sector research and market data. Counter at the micro-payment target ($0.01) when quotes are above that. Stay under the auto-approve limit unless the data is critical.",
      autoApproveLimitUsd: 0.05,
    };
  }

  const words = prompt.trim().split(/\s+/).slice(0, 3);
  const name = words.length ? `${words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ")} Agent` : "Custom Agent";

  return {
    name,
    category: "custom",
    description: prompt.trim(),
    iconColor: "violet",
    negotiationRules:
      "Follow the user's spending policy. Prefer micro-payments when possible. Escalate purchases above the auto-approve limit.",
    autoApproveLimitUsd: 0.05,
  };
}

function parseSuggestion(raw: string, prompt: string): AgentProfileSuggestion {
  const fallback = keywordFallback(prompt);
  try {
    const parsed = JSON.parse(raw) as Partial<AgentProfileSuggestion>;
    const iconColor = VALID_COLORS.has(parsed.iconColor ?? "")
      ? (parsed.iconColor as AgentProfileSuggestion["iconColor"])
      : fallback.iconColor;

    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : fallback.name,
      category:
        typeof parsed.category === "string" && parsed.category.trim()
          ? parsed.category.trim().toLowerCase().replace(/\s+/g, "_")
          : fallback.category,
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : fallback.description,
      iconColor,
      negotiationRules:
        typeof parsed.negotiationRules === "string" && parsed.negotiationRules.trim()
          ? parsed.negotiationRules.trim()
          : fallback.negotiationRules,
      autoApproveLimitUsd:
        typeof parsed.autoApproveLimitUsd === "number" && parsed.autoApproveLimitUsd > 0
          ? parsed.autoApproveLimitUsd
          : fallback.autoApproveLimitUsd,
    };
  } catch {
    return fallback;
  }
}

export async function suggestAgentProfile(prompt: string): Promise<AgentProfileSuggestion> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Describe what you want the agent to do.");
  }

  const fallback = keywordFallback(trimmed);
  if (!env.openaiApiKey) {
    return fallback;
  }

  const system = `You help users configure autonomous payment agents for a USDC commerce demo on Base Sepolia.
Given a short description of what the agent should do, return ONLY valid JSON (no markdown) with these fields:
- name: string — display name like "Research Agent"
- category: string — lowercase slug like research, procurement, travel, cloud, or a custom slug
- description: string — one sentence summary of the agent's role
- iconColor: one of "violet", "blue", "green", "orange"
- negotiationRules: string — 1-2 sentences instructing how the agent should negotiate purchases and when to escalate
- autoApproveLimitUsd: number — typical 0.02 to 0.10 for micro-payments`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: env.openaiModel,
        temperature: 0.5,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `User wants an agent that: ${trimmed}` },
        ],
      }),
    });

    if (!res.ok) {
      console.warn("OpenAI agent profile failed:", await res.text());
      return fallback;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return fallback;

    return parseSuggestion(text, trimmed);
  } catch (err) {
    console.warn("OpenAI agent profile error:", err);
    return fallback;
  }
}
