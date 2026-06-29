import { env } from "../config.js";

export type HermesHealth = {
  online: boolean;
  status?: string;
};

export async function checkHermesHealth(): Promise<HermesHealth> {
  try {
    const res = await fetch(`${env.hermesApiUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { online: false };
    const data = (await res.json()) as { status?: string };
    return { online: true, status: data.status };
  } catch {
    return { online: false };
  }
}

export async function startHermesRun(prompt: string, agentName: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (env.hermesApiKey) headers.Authorization = `Bearer ${env.hermesApiKey}`;

    const res = await fetch(`${env.hermesApiUrl}/v1/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "hermes-agent",
        input: `[Agent: ${agentName}] ${prompt}\n\nUse agntpymt_initiate_purchase MCP tool for any spending.`,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; run_id?: string };
    return data.id ?? data.run_id ?? null;
  } catch {
    return null;
  }
}
