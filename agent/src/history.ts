import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, type Sym } from "./config.js";
import type { Snap } from "./market.js";

type Row = { t: number; dex: number | null; cex: number | null; spot: number | null };
const FILE = join(DATA_DIR, "history.json");
const series: Record<string, Row[]> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
let lastSave = 0;

export const history = {
  push(snaps: Snap[]) {
    for (const s of snaps) {
      const rows = (series[s.sym] ??= []);
      const last = rows[rows.length - 1];
      if (last && s.t - last.t < 55) continue; // one sample a minute
      rows.push({ t: s.t, dex: s.twapPx, cex: s.fairPx, spot: s.spotPx });
      const cut = s.t - 3 * 86_400;
      while (rows.length && rows[0].t < cut) rows.shift();
    }
    if (Date.now() - lastSave > 5 * 60_000) { lastSave = Date.now(); writeFileSync(FILE, JSON.stringify(series)); }
  },
  of(sym: Sym, sinceSec = 86_400) {
    const rows = series[sym] ?? [];
    const cut = Math.floor(Date.now() / 1000) - sinceSec;
    const out = rows.filter((r) => r.t >= cut);
    // thin to ≤ 360 points
    const step = Math.max(1, Math.ceil(out.length / 360));
    return out.filter((_, i) => i % step === 0 || i === out.length - 1);
  },
};
