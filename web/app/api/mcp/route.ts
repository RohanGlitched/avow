import { NextResponse } from "next/server";
import { agentFetch, visitorIp } from "@/lib/agent";

export const dynamic = "force-dynamic";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization" };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { ...CORS, allow: "POST" } });
}
export async function POST(req: Request) {
  try {
    const r = await agentFetch("/mcp", { method: "POST", timeoutMs: 20_000, headers: { "content-type": "application/json", "x-visitor-ip": visitorIp(req) }, body: await req.text() });
    if (r.status === 202) return new NextResponse(null, { status: 202, headers: CORS });
    return new NextResponse(await r.text(), { status: r.status, headers: { ...CORS, "content-type": "application/json" } });
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Avow's agent is unreachable right now" } }, { status: 503, headers: CORS });
  }
}
