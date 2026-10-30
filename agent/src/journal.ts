import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, type Sym } from "./config.js";

export type Kind = "heartbeat" | "considered" | "declined" | "sworn" | "settled" | "blocked" | "amended" | "tightened" | "error";
export interface Entry { t: number; kind: Kind; asset?: Sym; title: string; detail?: string; noteId?: number; tx?: `0x${string}`; model?: string; tokens?: number }

mkdirSync(DATA_DIR, { recursive: true });
const FILE = join(DATA_DIR, "journal.jsonl");
const RAT = join(DATA_DIR, "rationales.json");

function load(): Entry[] {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as Entry]; } catch { return []; } });
}

const entries: Entry[] = load();
const rationales: Record<string, unknown> = existsSync(RAT) ? JSON.parse(readFileSync(RAT, "utf8")) : {};
let lastBeat = 0;

export const journal = {
  add(e: Omit<Entry, "t">) {
    const full = { t: Math.floor(Date.now() / 1000), ...e } as Entry;
    entries.push(full);
    appendFileSync(FILE, JSON.stringify(full) + "\n");
    console.log(new Date().toISOString(), full.kind, full.title, full.detail ? "— " + full.detail.slice(0, 200) : "");
  },
  beat() { lastBeat = Math.floor(Date.now() / 1000); },
  lastBeat: () => lastBeat,
  recent(n = 200) { return entries.slice(-n).reverse(); },
  all: () => entries,
  rationale(id: number, r: unknown) { rationales[String(id)] = JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v))); writeFileSync(RAT, JSON.stringify(rationales)); },
  rationaleOf: (id: number) => rationales[String(id)] as { rationale: string; candidate: unknown; snaps: unknown } | undefined,
};
