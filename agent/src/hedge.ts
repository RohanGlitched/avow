// HashKey Global spot client for the hedge leg of a spread trade (dormant until the owner supplies trade-only API keys).
// Spec: hashkeyglobal-apidoc.readme.io — header X-HK-APIKEY; HMAC-SHA256 (secret as key) over the exact parameter string sent,
// hex, passed as `signature`; `timestamp` in ms; POST form-urlencoded. Never mixes query and body parameters.
import { createHmac } from "node:crypto";

const BASE = process.env.HK_BASE ?? "https://api-glb.hashkey.com";

export interface HkKeys { apiKey: string; secret: string }

export function keysFromEnv(): HkKeys | null {
  const apiKey = process.env.HK_API_KEY, secret = process.env.HK_API_SECRET;
  return apiKey && secret ? { apiKey, secret } : null;
}

async function signed(k: HkKeys, method: "GET" | "POST", path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([a, b]) => [a, String(b)])), recvWindow: "5000", timestamp: String(Date.now()) }).toString();
  const signature = createHmac("sha256", k.secret).update(qs).digest("hex");
  const full = `${qs}&signature=${signature}`;
  const r = await fetch(method === "GET" ? `${BASE}${path}?${full}` : `${BASE}${path}`, {
    method,
    headers: { "X-HK-APIKEY": k.apiKey, ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" } : {}) },
    body: method === "POST" ? full : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json()) as Record<string, unknown>;
  if (!r.ok || (j.code !== undefined && j.code !== 0 && j.code !== "0" && j.code !== 200)) throw new Error(`HashKey Global ${path}: ${j.code ?? r.status} ${j.msg ?? ""}`);
  return j;
}

export async function balances(k: HkKeys) {
  const j = (await signed(k, "GET", "/api/v1/account", {})) as { balances?: { asset: string; free: string; locked: string }[] };
  return Object.fromEntries((j.balances ?? []).map((b) => [b.asset, { free: Number(b.free), locked: Number(b.locked) }]));
}

/** Public symbol rules: step size, minimum quantity and notional. */
export async function symbolRules(symbol: string) {
  const r = await fetch(`${BASE}/api/v1/exchangeInfo?symbol=${symbol}`, { signal: AbortSignal.timeout(10_000) });
  const j = (await r.json()) as { symbols?: { symbol: string; status: string; filters: Record<string, string>[] }[] };
  const s = j.symbols?.find((x) => x.symbol === symbol);
  if (!s) throw new Error(`no symbol ${symbol}`);
  const f = (type: string) => s.filters.find((x) => x.filterType === type) ?? {};
  return { status: s.status, stepSize: Number(f("LOT_SIZE").stepSize ?? 0), minQty: Number(f("LOT_SIZE").minQty ?? 0), minNotional: Number(f("MIN_NOTIONAL").minNotional ?? 0) };
}

/** A market order for `quantity` base units (v1.1). Returns the order id; read the fill with order(). */
export async function marketOrder(k: HkKeys, symbol: string, side: "BUY" | "SELL", quantity: number, clientId: string) {
  const j = await signed(k, "POST", "/api/v1.1/spot/order", { symbol, side, type: "MARKET", quantity, newClientOrderId: clientId });
  return { orderId: String(j.orderId), status: String(j.status) };
}

export async function order(k: HkKeys, orderId: string) {
  const j = await signed(k, "GET", "/api/v1/spot/order", { orderId });
  const quote = Number(j.cumulativeQuoteQty ?? j.cummulativeQuoteQty ?? 0);
  return { status: String(j.status), executedQty: Number(j.executedQty ?? 0), quoteQty: quote, avgPrice: Number(j.avgPrice ?? 0) };
}
