"use client";
// Small live readouts that follow the polled state and the UI clock.
import { useEffect, useState } from "react";
import { useLiveState, useNow } from "@/lib/live";
import { ago, duration, px, scalePos, usd } from "@/lib/format";
import type { Note } from "@/lib/types";

/** "4 min ago", relative to the UI clock. */
export function Ago({ t, prefix = "", suffix = "" }: { t: number; prefix?: string; suffix?: string }) {
  const now = useNow();
  return (
    <time dateTime={new Date(t * 1000).toISOString()} suppressHydrationWarning>
      {prefix}
      {ago(now - t)}
      {suffix}
    </time>
  );
}

/** "in 21 h 36 min" or "expired 2 h ago" */
export function Until({ t }: { t: number }) {
  const now = useNow();
  const d = t - now;
  return <time dateTime={new Date(t * 1000).toISOString()} suppressHydrationWarning>{d > 0 ? `in ${duration(d)}` : `expired ${duration(-d)} ago`}</time>;
}

function livePxOf(note: Note, notes: Note[]) {
  const n = notes.find((x) => x.id === note.id);
  return n?.livePx ?? note.livePx;
}

/** What closed a settled note, for the scale: the level that triggered settlement (if any) and plain words. */
function settlement(note: Note): { at: "target" | "void" | null; words: string } {
  const fill = note.exitPx != null ? px(note.asset, note.exitPx) : null;
  switch (note.status) {
    case "honoured":
      return {
        at: "target",
        words: `Honoured. Both the 5-minute TWAP and the live price reached the target, and that triggered settlement (the crossed tick).${fill ? ` The closing swap then filled at ${fill}; a fill a little short of the target is normal, because the swap itself pays the pool fee and moves a thin pool.` : ""}`,
      };
    case "void":
      return { at: "void", words: `Void. Both the 5-minute TWAP and the live price crossed the void level, and that triggered the stop (the crossed tick).${fill ? ` The closing swap filled at ${fill}.` : ""}` };
    case "lapsed":
      return { at: null, words: `Lapsed. Neither level was reached before the expiry.${fill ? ` The closing swap filled at ${fill}.` : ""}` };
    case "retracted":
      return { at: null, words: `Retracted. Avow closed the note early, which is graded as a miss.${fill ? ` The closing swap filled at ${fill}.` : ""}` };
    case "revoked":
      return { at: null, words: `Revoked. The owner closed the note; it is graded as a miss.${fill ? ` The closing swap filled at ${fill}.` : ""}` };
    default:
      return { at: null, words: "" };
  }
}

/**
 * The engraved void → target scale. Outstanding: a needle at the live TWAP. Settled: the level that triggered
 * settlement drawn as a crossed tick, and a separate "filled at" marker for the closing swap.
 * Left is always the void level, right the target.
 */
export function Needle({ note, print }: { note: Note; print?: boolean }) {
  const { state } = useLiveState();
  const settled = note.status !== "outstanding";
  const p = settled ? note.exitPx : livePxOf(note, state.notes);
  const entry = scalePos(note, note.entryPx);
  const pos = p != null ? scalePos(note, p) : null;
  const clamped = pos == null ? null : Math.max(0, Math.min(1, pos));
  const ticks = [];
  for (let i = 0; i <= 40; i++) ticks.push(i);
  const st = settled ? settlement(note) : null;
  const label = settled ? "filled at" : "now";
  const desc =
    p == null
      ? "No live price"
      : `${label} ${px(note.asset, p)}, ${Math.round((clamped ?? 0) * 100)}% of the way from the void level ${px(note.asset, note.voidPx)} to the target ${px(note.asset, note.targetPx)}${st?.at ? `; settlement was triggered at the ${st.at === "target" ? "target" : "void level"}` : ""}`;
  return (
    <div className={`scale${settled ? " scale--settled" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((clamped ?? 0) * 100)} aria-label="Distance from void level to target" aria-valuetext={desc}>
      <div className="scale__ends">
        <span className="scale__end scale__end--void">
          <span className="cap">Void level</span>
          {st?.at === "void" ? <span className="scale__hit">× crossed: stop triggered</span> : null} <b className="tnum">{px(note.asset, note.voidPx)}</b>
        </span>
        <span className="scale__end scale__end--target">
          {st?.at === "target" ? <span className="scale__hit">reached: settled here ×</span> : null}
          <span className="cap">Target</span> <b className="tnum">{px(note.asset, note.targetPx)}</b>
        </span>
      </div>
      <div className="scale__rail">
        <div className="scale__zone scale__zone--risk" style={{ width: `${entry * 100}%` }} />
        <div className="scale__zone scale__zone--reward" style={{ left: `${entry * 100}%`, width: `${(1 - entry) * 100}%` }} />
        <svg className="scale__ticks" viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden="true">
          {ticks.map((i) => (
            <line key={i} x1={i * 10} x2={i * 10} y1={i % 10 === 0 ? 0 : i % 5 === 0 ? 4 : 8} y2={14} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {st?.at ? <span className={`scale__trigger scale__trigger--${st.at}`} style={{ left: st.at === "target" ? "100%" : "0%" }} aria-hidden="true" /> : null}
        <div className="scale__entry" style={{ left: `${entry * 100}%` }}>
          <span className="tnum">entry {px(note.asset, note.entryPx)}</span>
        </div>
        {clamped != null && (
          <div
            className={`needle${print ? " needle--print" : ""}${settled ? " needle--fill" : ""}${pos! < 0 || pos! > 1 ? " needle--beyond" : ""}`}
            style={{ left: `${clamped * 100}%`, ["--from" as string]: `${entry * 100}%`, ["--lx" as string]: clamped > 0.82 ? "-100%" : clamped < 0.18 ? "0%" : "-50%" }}
          >
            <span className="needle__label tnum">
              {label} {px(note.asset, p!)}
            </span>
          </div>
        )}
      </div>
      {st?.words ? <p className="scale__words">{st.words}</p> : null}
    </div>
  );
}

/** Unrealised P&L of an outstanding note, following the polled state. */
export function Unrealised({ note }: { note: Note }) {
  const { state } = useLiveState();
  const v = state.notes.find((x) => x.id === note.id)?.unrealisedPnlUsd ?? note.unrealisedPnlUsd;
  if (v == null) return null;
  return (
    <div>
      <dt>Unrealised, if closed now</dt>
      <dd className={`tnum ${v >= 0 ? "pos" : "neg"}`}>{usd(v, { sign: true })}</dd>
    </div>
  );
}

/** How fresh the numbers on screen are. */
export function Freshness() {
  const { state, status, updatedAt } = useLiveState();
  const now = useNow();
  if (state.source === "fixture") return <span suppressHydrationWarning>Sample snapshot taken {new Date(state.asOf * 1000).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", hour12: false })} IST</span>;
  if (status === "error") return <span className="neg">Live reads failing; showing the last good numbers</span>;
  return <span suppressHydrationWarning>Read {ago(now - updatedAt / 1000)}{status === "stale" ? ", retrying" : ""}</span>;
}

/** "last cycle 12 s ago", from the agent's heartbeat, ticking every second (frozen on the sample snapshot). */
export function LastCycle({ prefix = "last cycle " }: { prefix?: string }) {
  const { state } = useLiveState();
  const base = useNow();
  const frozen = state.source === "fixture";
  const [now, setNow] = useState(base);
  useEffect(() => {
    setNow(frozen ? base : Math.max(base, Date.now() / 1000));
    if (frozen) return;
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [base, frozen]);
  const hb = state.lastHeartbeat;
  if (hb == null) return <span>no cycle reported yet</span>;
  const s = Math.max(0, Math.round(now - hb));
  return (
    <time dateTime={new Date(hb * 1000).toISOString()} suppressHydrationWarning>
      {prefix}
      {s < 120 ? `${s} s ago` : `${duration(s)} ago`}
    </time>
  );
}
