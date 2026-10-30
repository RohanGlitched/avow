import { NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent";

export const dynamic = "force-dynamic";

/** The owner's signed request ("Avow: tighten\n<json>\nuntil <unix>") is checked by the agent against the vault's owner on chain. */
export async function POST(req: Request) {
  try {
    const b = await req.text();
    if (b.length > 8000) return NextResponse.json({ error: "too large" }, { status: 413 });
    const r = await agentFetch("/tighten", { method: "POST", timeoutMs: 90_000, headers: { "content-type": "application/json" }, body: b });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch {
    return NextResponse.json({ error: "The agent could not be reached; nothing was changed." }, { status: 503 });
  }
}
