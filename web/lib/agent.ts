// Server-only access to the Avow agent (GCE VM). The desk secret never reaches the browser.
export const AGENT_URL = process.env.AVOW_AGENT_URL ?? "http://35.200.225.158:8787";

export function visitorIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function agentFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15_000, ...rest } = init;
  return fetch(`${AGENT_URL}${path}`, { ...rest, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
}
