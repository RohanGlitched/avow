import type { AssetSym, Note, NoteStatus } from "./types";

export const ASSET_LABEL: Record<AssetSym, string> = { WETH: "ETH", WBTC: "BTC", WHSK: "HSK" };
export const ASSET_NAME: Record<AssetSym, string> = { WETH: "Ether", WBTC: "Bitcoin", WHSK: "HashKey token" };
const DP: Record<AssetSym, number> = { WETH: 2, WBTC: 2, WHSK: 5 };

const nf = (min: number, max = min) => new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

export function px(asset: AssetSym, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return nf(DP[asset]).format(v);
}

/** Compact price for axes and chips (BTC without cents). */
export function pxShort(asset: AssetSym, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (asset === "WBTC") return nf(0).format(v);
  return nf(DP[asset]).format(v);
}

export function usd(v: number | null | undefined, opts: { sign?: boolean; dp?: number } = {}): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const dp = opts.dp ?? 2;
  const s = nf(dp).format(Math.abs(v));
  if (opts.sign) return `${v > 0 ? "+" : v < 0 ? "−" : ""}$${s}`;
  return `${v < 0 ? "−" : ""}$${s}`;
}

export function num(v: number | null | undefined, dp = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return nf(dp).format(v);
}

export function signed(v: number | null | undefined, dp = 2, unit = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(dp).format(Math.abs(v))}${unit}`;
}

export function bps(v: number | null | undefined, sign = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return sign ? `${signed(v, 0)} bps` : `${nf(0).format(v)} bps`;
}

export function pct(v: number, dp = 0): string {
  return `${nf(dp).format(v * 100)}%`;
}

const TZ = "Asia/Kolkata";
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(key: string, o: Intl.DateTimeFormatOptions) {
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...o });
    fmtCache.set(key, f);
  }
  return f;
}

/** "09:36" */
export const time = (t: number) => dtf("t", { hour: "2-digit", minute: "2-digit", hour12: false }).format(t * 1000);
/** "1 Nov" */
export const day = (t: number) => dtf("d", { day: "numeric", month: "short" }).format(t * 1000);
/** "Sat 31 Oct" */
export const weekday = (t: number) => dtf("w", { weekday: "short", day: "numeric", month: "short" }).format(t * 1000);
/** "09:36 IST, 1 Nov" */
export const when = (t: number) => `${time(t)} IST, ${day(t)}`;
/** "31 OCT 2026" for stamps */
export const stampDate = (t: number) =>
  dtf("s", { day: "2-digit", month: "short", year: "numeric" }).format(t * 1000).toUpperCase();
export const dayKey = (t: number) => dtf("k", { year: "numeric", month: "2-digit", day: "2-digit" }).format(t * 1000);

export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 48) return rm ? `${h} h ${rm} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}

export function ago(sec: number): string {
  if (sec < 0) return "just now";
  if (sec < 15) return "just now";
  return `${duration(sec)} ago`;
}

export const short = (h: string | null | undefined, head = 6, tail = 4) =>
  !h ? "—" : h.length <= head + tail + 2 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`;

/** Keep "09:36 IST" and "1 Nov" together when a statement wraps. */
export function tidy(statement: string): string {
  return statement
    .replace(/(\d{1,2}:\d{2}) IST/g, "$1 IST")
    .replace(/(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, "$1 $2");
}

/** The sworn sentence (target, time, void level) and what follows it on chain (odds, the agent's one-line reason). */
export function splitStatement(statement: string): { oath: string; rest: string } {
  const t = tidy(statement);
  const m = t.match(/^([\s\S]*?void at [\d,]+(?:\.\d+)?\.)\s*([\s\S]*)$/);
  return m ? { oath: m[1], rest: m[2] } : { oath: t, rest: "" };
}

export const STATUS_WORD: Record<NoteStatus, string> = {
  outstanding: "Outstanding",
  honoured: "Honoured",
  void: "Void",
  lapsed: "Lapsed",
  retracted: "Retracted",
  revoked: "Revoked",
};

export const STATUS_EXPLAIN: Record<NoteStatus, string> = {
  outstanding: "Open. Anyone may settle it once both the 5-minute TWAP and the live price are past a level, or once it expires.",
  honoured: "Both the HSKSwap 5-minute TWAP and the live price reached the target before the void level and the expiry. Graded 1.",
  void: "Both the 5-minute TWAP and the live price crossed the void level first. The stop closed the position. Graded 0.",
  lapsed: "Neither level was reached before the expiry. Closed at the expiry price. Graded 0.",
  retracted: "Avow closed the note early. Retreating is graded as a miss, so it never improves the record.",
  revoked: "The owner closed the note. Owner actions are not graded.",
};

/** Position of a price on the void → target scale, 0 = void, 1 = target (unclamped). */
export function scalePos(n: Pick<Note, "voidPx" | "targetPx">, p: number): number {
  return (p - n.voidPx) / (n.targetPx - n.voidPx);
}

export function rewardRisk(n: Pick<Note, "entryPx" | "targetPx" | "voidPx">): number {
  return Math.abs(n.targetPx - n.entryPx) / Math.abs(n.entryPx - n.voidPx);
}

export function stopBps(n: Pick<Note, "entryPx" | "voidPx">): number {
  return (Math.abs(n.entryPx - n.voidPx) / n.entryPx) * 1e4;
}

export const outcomeOf = (n: Note): 0 | 1 | null =>
  n.status === "honoured" ? 1 : n.status === "void" || n.status === "lapsed" || n.status === "retracted" ? 0 : null;

/** Split a USD amount for a banknote denomination: { whole: "19", cents: "40" } */
export function denom(v: number) {
  const whole = Math.floor(v + 1e-9);
  const cents = Math.round((v - whole) * 100);
  return { whole: String(whole), cents: String(cents).padStart(2, "0") };
}

/**
 * Note URLs use the printed serial number, not the on-chain id: AVW·000001 is id 0 and lives at /notes/1.
 * Every link to a note goes through here.
 */
export const noteHref = (id: number) => `/notes/${id + 1}`;
/** The on-chain id for a /notes/[n] path segment, or null if it is not a serial number. */
export function idFromSerialParam(p: string): number | null {
  if (!/^\d{1,9}$/.test(p)) return null;
  const n = Number(p);
  return n >= 1 ? n - 1 : null;
}
/** The printed serial for an on-chain id, preferring the serial the agent sent with the note. */
export function serialFor(id: number, notes?: Pick<Note, "id" | "serial">[]): string {
  return notes?.find((n) => n.id === id)?.serial ?? `AVW·${String(id + 1).padStart(6, "0")}`;
}
