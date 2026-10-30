import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, GCP_PROJECT, MODELS } from "./config.js";

const exec = promisify(execFile);
let tok: { v: string; exp: number } | null = null;

/** On the GCE VM the service account token comes from the metadata server (no keys anywhere); locally, from gcloud. */
async function token(): Promise<string> {
  if (tok && Date.now() < tok.exp - 60_000) return tok.v;
  try {
    const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const j = (await r.json()) as { access_token: string; expires_in: number };
      tok = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
      return tok.v;
    }
  } catch {}
  const { stdout } = await exec(process.platform === "win32" ? "gcloud.cmd" : "gcloud", ["auth", "print-access-token"], { shell: process.platform === "win32" });
  tok = { v: stdout.trim(), exp: Date.now() + 30 * 60_000 };
  return tok.v;
}

export interface Usage { model: string; inTokens: number; outTokens: number; usd: number; ms: number }
mkdirSync(DATA_DIR, { recursive: true });
const NL = String.fromCharCode(10);
const USAGE = join(DATA_DIR, "usage.jsonl");
export const usageLog: (Usage & { t: number; purpose: string })[] = existsSync(USAGE)
  ? readFileSync(USAGE, "utf8").split(NL).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).slice(-5000)
  : [];

// list prices per 1M tokens (USD); flash-lite is the budget fallback
const PRICE: Record<string, [number, number]> = { "gemini-3.5-flash": [0.3, 2.5], "gemini-3.5-flash-lite": [0.1, 0.4], "gemini-3.1-flash-lite": [0.1, 0.4] };

export interface GenOpts {
  system: string;
  contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[];
  schema?: Record<string, unknown>;
  tools?: Record<string, unknown>[];
  maxTokens?: number;
  purpose: string;
  temperature?: number;
}

export interface GenResult { text: string; parts: Record<string, unknown>[]; usage: Usage }

/** Gemini on Vertex AI. Tries each model in MODELS in order; the first answer wins. */
export async function generate(o: GenOpts): Promise<GenResult> {
  const errors: string[] = [];
  for (const model of MODELS) {
    const t0 = Date.now();
    try {
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: o.system }] },
        contents: o.contents,
        generationConfig: {
          maxOutputTokens: o.maxTokens ?? 2048,
          temperature: o.temperature ?? 0.3,
          ...(o.schema ? { responseMimeType: "application/json", responseSchema: o.schema } : {}),
          thinkingConfig: { thinkingBudget: o.schema ? 512 : 256 },
        },
        ...(o.tools ? { tools: o.tools } : {}),
      };
      const url = `https://aiplatform.googleapis.com/v1/projects/${GCP_PROJECT}/locations/global/publishers/google/models/${model}:generateContent`;
      const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
      const j = (await r.json()) as {
        error?: { message: string; code: number };
        candidates?: { content?: { parts?: Record<string, unknown>[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      };
      if (j.error) throw new Error(`${j.error.code} ${j.error.message.slice(0, 200)}`);
      const parts = j.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text as string).join("");
      const inT = j.usageMetadata?.promptTokenCount ?? 0;
      const outT = (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0);
      const [pi, po] = PRICE[model] ?? [0.3, 2.5];
      const usage = { model, inTokens: inT, outTokens: outT, usd: (inT * pi + outT * po) / 1e6, ms: Date.now() - t0 };
      const row = { ...usage, t: Math.floor(Date.now() / 1000), purpose: o.purpose };
      usageLog.push(row);
      appendFileSync(USAGE, JSON.stringify(row) + NL);
      if (usageLog.length > 5000) usageLog.splice(0, 1000);
      if (!text && !parts.some((p) => p.functionCall)) throw new Error(`empty answer (${j.candidates?.[0]?.finishReason ?? "?"})`);
      if (o.schema) {
        try { JSON.parse(text); } catch { throw new Error(`unparseable JSON (${j.candidates?.[0]?.finishReason ?? "?"})`); }
      }
      return { text, parts, usage };
    } catch (e) {
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

export function spendAll() {
  return { calls: usageLog.length, usd: usageLog.reduce((s, u) => s + u.usd, 0) };
}

export function spend24h() {
  const since = Math.floor(Date.now() / 1000) - 86_400;
  const rows = usageLog.filter((u) => u.t >= since);
  return { calls: rows.length, usd: rows.reduce((s, u) => s + u.usd, 0), tokens: rows.reduce((s, u) => s + u.inTokens + u.outTokens, 0) };
}
