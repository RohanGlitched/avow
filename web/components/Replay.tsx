// "Replay on real HSKSwap history": the agent's exact rules, and a small pre-declared family of alternatives,
// replayed over 30 days of real mainnet swaps, fitted on the first part and tested once on the rest.
import Link from "next/link";
import { day, num, pct, usd, when } from "@/lib/format";
import type { Replay, ReplayCandidate, ReplayStats } from "@/lib/types";

const ASSET: Record<string, string> = { WETH: "ETH", WBTC: "BTC", WHSK: "HSK" };
const days = (sec: number) => Math.max(1, Math.round(sec / 86_400));

const LABEL: Record<string, string> = {
  notes: "notes",
  honoured: "honoured",
  void: "void",
  lapsed: "lapsed",
  hitRate: "hit rate",
  meanPMin: "break-even",
  pnlUsd: "P&L",
  pnlPerNoteUsd: "per $50 note",
};
const ORDER = ["notes", "hitRate", "meanPMin", "pnlPerNoteUsd", "pnlUsd"];

function words(k: string) {
  return LABEL[k] ?? k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Usd$/i, " (USD)").toLowerCase();
}

/** Fractions as percentages, dollars with a sign, counts as integers. */
export function fmtStat(k: string, v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (/rate|pmin|share|prob|odds|hit/i.test(k)) return pct(v > 1 ? v / 100 : v, 1);
  if (/usd|pnl/i.test(k)) return usd(v, { sign: true, dp: Math.abs(v) < 1 && v !== 0 ? 3 : 2 });
  if (Number.isInteger(v)) return num(v);
  return v.toFixed(3);
}

function Stats({ s }: { s?: ReplayStats }) {
  if (!s || !Object.keys(s).length) return <span className="muted">—</span>;
  const known = ORDER.filter((k) => k in s && (k !== "pnlUsd" || !("pnlPerNoteUsd" in s)));
  const keys = known.length ? known : Object.keys(s).filter((k) => typeof s[k] === "number" || s[k] == null);
  return (
    <span className="rstats">
      {keys.map((k) => (
        <span key={k}>
          <b className={/usd|pnl/i.test(k) && typeof s[k] === "number" ? ((s[k] as number) >= 0 ? "pos" : "neg") : undefined}>{fmtStat(k, s[k])}</b>
          {k === "pnlPerNoteUsd" && typeof s.seUsd === "number" ? ` ± ${usd(s.seUsd as number, { dp: 3 })}` : ""} {words(k)}
        </span>
      ))}
    </span>
  );
}

function params(p: { [k: string]: unknown }) {
  const e = Object.entries(p);
  if (!e.length) return "—";
  return e.map(([k, v]) => `${words(k)} ${typeof v === "number" ? (Number.isInteger(v) ? num(v) : String(+v.toFixed(4))) : String(v)}`).join(", ");
}

/** Totals over the current rules, for the one-paragraph summary. */
export function replayTotals(r: Replay) {
  const notes = r.current.reduce((a, c) => a + c.notes, 0);
  const honoured = r.current.reduce((a, c) => a + c.honoured, 0);
  const pnl = r.current.reduce((a, c) => a + c.pnlUsd, 0);
  const pw = r.current.filter((c) => c.meanPMin != null && c.notes > 0);
  const pmNotes = pw.reduce((a, c) => a + c.notes, 0);
  const breakEven = pmNotes ? pw.reduce((a, c) => a + (c.meanPMin as number) * c.notes, 0) / pmNotes : null;
  return {
    notes,
    honoured,
    hitRate: notes ? honoured / notes : null,
    breakEven,
    perNote: notes ? pnl / notes : null,
    pnl,
    windowDays: days(r.window.to - r.window.from),
    fitDays: days(r.window.splitAt - r.window.from),
    testDays: days(r.window.to - r.window.splitAt),
  };
}

/** Two lines for the home page and /how: what the replay found, and what it means for how often Avow trades. */
export function ReplaySummary({ replay, title = "Why Avow trades so rarely" }: { replay: Replay; title?: string }) {
  const t = replayTotals(replay);
  return (
    <div className="replay-sum">
      <h3>{title}</h3>
      <p>
        Replayed over {t.windowDays} days of real HSKSwap swaps, Avow&apos;s exact rules would have sworn <b>{num(t.notes)}</b> {t.notes === 1 ? "note" : "notes"}
        {t.notes ? (
          <>
            , honoured <b>{fmtStat("hitRate", t.hitRate)}</b> of the time against a break-even of {fmtStat("meanPMin", t.breakEven)}, for{" "}
            <b className={(t.perNote ?? 0) >= 0 ? "pos" : "neg"}>{fmtStat("pnlPerNoteUsd", t.perNote)}</b> per $50 note after fees, price impact and gas.
          </>
        ) : (
          ": no gap cleared its costs at its own odds."
        )}{" "}
        {replay.chosen
          ? `Of ${num(replay.configsTried)} configurations tried, ${replay.chosen.name} held up on the last ${t.testDays} days it had never seen.`
          : `None of the ${num(replay.configsTried)} alternatives tried beat costs by enough to trust on the ${t.testDays} days held back, so Avow keeps its rules and waits.`}{" "}
        <Link href="/record#replay">The full replay</Link>
      </p>
    </div>
  );
}

const perNote = (s: ReplayStats | undefined) => (s && typeof s.pnlPerNoteUsd === "number" ? (s.pnlPerNoteUsd as number) : -Infinity);
/** The worst plausible result: P&L per note minus one standard error, when the replay reports one. */
const lowerBound = (s: ReplayStats | undefined) => (s && typeof s.seUsd === "number" ? perNote(s) - (s.seUsd as number) : -Infinity);
const notesOf = (s: ReplayStats | undefined) => (s && typeof s.notes === "number" ? (s.notes as number) : 0);

function CandTable({ rows, t, chosen, compact }: { rows: ReplayCandidate[]; t: ReturnType<typeof replayTotals>; chosen?: string; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table className={`tbl tbl--stack${compact ? " tbl--compact" : ""}`}>
        <thead>
          <tr>
            <th>Alternative</th>
            {compact ? null : <th>Parameters</th>}
            <th>First {t.fitDays} days (fitted)</th>
            <th>Last {t.testDays} days (tested once)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name} className={chosen === c.name ? "earn__total" : undefined}>
              <td data-h="Alternative">
                <b className="replay__name">{c.name}</b>
                {compact ? null : <span className="sub">{c.description}</span>}
              </td>
              {compact ? null : (
                <td data-h="Parameters" className="muted" style={{ fontSize: 14 }}>
                  {params(c.params)}
                </td>
              )}
              <td data-h={`First ${t.fitDays} days`}>
                <Stats s={c.inSample} />
              </td>
              <td data-h={`Last ${t.testDays} days`}>
                <Stats s={c.outOfSample} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReplaySection({ replay }: { replay: Replay }) {
  const t = replayTotals(replay);
  // rank as the selection did: by the in-sample lower bound when standard errors are reported, else by the mean
  const withSe = replay.candidates.some((c) => typeof c.inSample?.seUsd === "number");
  const score = (c: ReplayCandidate) => (withSe ? lowerBound(c.inSample) : perNote(c.inSample));
  const ranked = [...replay.candidates].sort((a, b) => score(b) - score(a) || perNote(b.inSample) - perNote(a.inSample));
  const lucky = replay.candidates.filter((c) => perNote(c.outOfSample) > 0);
  const luckyMax = lucky.reduce((m, c) => Math.max(m, notesOf(c.outOfSample)), 0);
  const TOP = 8;
  const top = ranked.slice(0, TOP);
  const rest = ranked.slice(TOP);
  const fam = new Map<string, number>();
  for (const c of replay.candidates) if (c.family) fam.set(c.family, (fam.get(c.family) ?? 0) + 1);
  const families = [...fam.entries()];
  // one paragraph per blank line, and the limits on their own
  const paras = replay.notes
    .split(/\n\s*\n|\s(?=Limits: )/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div>
      <p className="study__takeaway">
        Over {t.windowDays} days of real swaps ({day(replay.window.from)} to {day(replay.window.to)}), Avow&apos;s current rules would have sworn <b>{num(t.notes)}</b>{" "}
        {t.notes === 1 ? "note" : "notes"}
        {t.notes ? (
          <>
            , honoured <b>{fmtStat("hitRate", t.hitRate)}</b> of the time against a mean break-even of <b>{fmtStat("meanPMin", t.breakEven)}</b>: <b>{fmtStat("pnlPerNoteUsd", t.perNote)}</b> per $50 note
            after fees, impact and gas.
          </>
        ) : (
          "."
        )}{" "}
        The alternatives were fitted on the first {t.fitDays} days and tested once on the last {t.testDays}.
      </p>

      <h3 className="replay__h">The current rules, replayed</h3>
      <div className="table-wrap">
        <table className="tbl tbl--stack">
          <thead>
            <tr>
              <th>Asset and kind</th>
              <th className="r">Notes</th>
              <th className="r">Honoured, void, lapsed</th>
              <th className="r">Hit rate vs break-even</th>
              <th className="r">P&amp;L per $50 note</th>
              <th className="r">P&amp;L in all</th>
              <th>First {t.fitDays} days (fitted)</th>
              <th>Last {t.testDays} days (tested once)</th>
            </tr>
          </thead>
          <tbody>
            {replay.current.map((c) => (
              <tr key={`${c.asset}-${c.kind}`}>
                <td data-h="Asset and kind">
                  <span style={{ fontFamily: "var(--serif)", fontSize: 19 }}>{ASSET[c.asset] ?? c.asset}</span>
                  <span className="sub" style={{ whiteSpace: "nowrap" }}>
                    {c.kind}
                  </span>
                </td>
                <td data-h="Notes" className="r">
                  {num(c.notes)}
                </td>
                <td data-h="Honoured, void, lapsed" className="r">
                  {c.honoured} / {c.void} / {c.lapsed}
                </td>
                <td data-h="Hit rate vs break-even" className="r">
                  <b className={c.hitRate != null && c.meanPMin != null ? (c.hitRate >= c.meanPMin ? "pos" : "neg") : undefined}>{fmtStat("hitRate", c.hitRate)}</b>
                  <span className="sub">break-even {fmtStat("meanPMin", c.meanPMin)}</span>
                </td>
                <td data-h="P&L per $50 note" className="r">
                  <b className={(c.pnlPerNoteUsd ?? 0) >= 0 ? "pos" : "neg"}>{fmtStat("pnlPerNoteUsd", c.pnlPerNoteUsd)}</b>
                  {c.feeUsdPerNote != null ? (
                    <span className="sub">
                      {c.grossPnlPerNoteUsd != null ? `gross ${fmtStat("usd", c.grossPnlPerNoteUsd)}; ` : ""}fees {usd(c.feeUsdPerNote, { dp: 2 })}
                      {c.impactUsdPerNote != null ? `, impact ${usd(c.impactUsdPerNote, { dp: 2 })}` : ""}
                      {c.gasUsdPerNote != null ? `, gas ${usd(c.gasUsdPerNote, { dp: 2 })}` : ""}
                    </span>
                  ) : null}
                </td>
                <td data-h="P&L in all" className={`r ${c.pnlUsd >= 0 ? "pos" : "neg"}`}>
                  {fmtStat("pnlUsd", c.pnlUsd)}
                </td>
                <td data-h={`First ${t.fitDays} days`}>
                  <Stats s={c.inSample} />
                </td>
                <td data-h={`Last ${t.testDays} days`}>
                  <Stats s={c.outOfSample} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="plate">After fees, price impact and gas: {replay.costModel}</p>

      <h3 className="replay__h">
        The alternatives: {num(replay.configsTried)} {replay.configsTried === 1 ? "configuration" : "configurations"} tried
      </h3>
      <p className="replay__lede">
        {families.length > 1 ? `In ${families.length} groups (${families.map(([f, n]) => `${f}: ${n}`).join(", ")}). ` : ""}Each was fitted on the first {t.fitDays} days, then run once on the
        last {t.testDays}. Below are the {top.length} that did best on the fitted days
        {withSe ? ", ranked by their worst plausible result there (P&L per note minus one standard error)" : ""}, and what happened next.
      </p>
      {top.length ? <CandTable rows={top} t={t} chosen={replay.chosen?.name} /> : null}
      {rest.length ? (
        <details className="replay__all">
          <summary>All {num(replay.candidates.length)} configurations</summary>
          <CandTable rows={ranked} t={t} chosen={replay.chosen?.name} compact />
        </details>
      ) : null}

      <div className={`replay-chosen${replay.chosen ? "" : " replay-chosen--none"}`}>
        {replay.chosen ? (
          <>
            <span className="replay-chosen__cap">Chosen</span>
            <h3>{replay.chosen.name}</h3>
            <p>{replay.chosen.why}</p>
            <p className="replay-chosen__stats">
              Last {t.testDays} days: <Stats s={replay.chosen.outOfSample} />. Suggested odds {pct(replay.chosen.suggestedOdds)}. Parameters: {params(replay.chosen.params)}.
            </p>
          </>
        ) : (
          <>
            <span className="replay-chosen__cap">Chosen</span>
            <h3>Nothing beat costs out of sample.</h3>
            <p>
              No alternative cleared fees, price impact and gas by enough to trust, so none replaces the current rules. Avow keeps them, and keeps declining most gaps.
              {lucky.length
                ? ` ${lucky.length} of ${num(replay.candidates.length)} show a profit on the last ${t.testDays} days, on ${luckyMax <= 1 ? "a single note" : `at most ${luckyMax} notes`} each: too few to tell an edge from luck.`
                : ""}
            </p>
          </>
        )}
      </div>

      {paras.length ? (
        <div className="study__notes">
          <h3>Method and limits</h3>
          {paras.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="plate">Computed {when(replay.generatedAt)} from HSKSwap swap logs on HSK Chain mainnet. A replay is not a forecast.</p>
        </div>
      ) : null}
    </div>
  );
}
