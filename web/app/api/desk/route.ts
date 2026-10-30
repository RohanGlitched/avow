import { NextResponse } from "next/server";
import { agentFetch, visitorIp } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ reply: "That message could not be read. Try again.", citations: [] }, { status: 400 });
  }
  const role = (r: string) => (r === "owner" || r === "user" ? "user" : r === "dictum" || r === "assistant" ? "assistant" : null);
  const messages = (body.messages ?? [])
    .map((m) => ({ role: role(m.role), content: m.content }))
    .filter((m) => m.role && typeof m.content === "string" && m.content.length <= 2000)
    .slice(-10);
  if (!messages.length) return NextResponse.json({ reply: "Ask a question about the vault, a note, or the mandate.", citations: [] }, { status: 400 });
  try {
    const r = await agentFetch("/desk", { method: "POST", timeoutMs: 55_000, headers: { "content-type": "application/json", "x-desk-secret": process.env.AVOW_DESK_SECRET ?? "", "x-visitor-ip": visitorIp(req) }, body: JSON.stringify({ messages }) });
    const j = await r.json();
    return NextResponse.json(j, { status: r.status === 429 ? 429 : 200 });
  } catch {
    return NextResponse.json({ reply: "The desk could not reach the agent just now. The notes and the vault are unaffected; try again in a minute.", citations: [], engine: "unreachable" }, { status: 503 });
  }
}
