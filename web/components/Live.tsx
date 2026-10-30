"use client";
// Small live readouts that follow the polled state and the UI clock.
import { useLiveState, useNow } from "@/lib/live";
import { ago, duration, px, scalePos } from "@/lib/format";
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
  return <time dateTime={new Date(t * 1000).toISOString()}>{d > 0 ? `in ${duration(d)}` : `expired ${duration(-d)} ago`}</time>;
}

function livePxOf(note: Note, notes: Note[]) {
  const n = notes.find((x) => x.id === note.id);
  return n?.livePx ?? note.livePx;
}

/**
 * The engraved void → target scale with a needle at the live TWAP (outstanding)
 * or at the exit price (settled). Left is always the void level, right the target.
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
  const label = settled ? "exit" : "now";
  const desc =
    p == null
      ? "No live price"
      : `${label} ${px(note.asset, p)}, ${Math.round((clamped ?? 0) * 100)}% of the way from the void level ${px(note.asset, note.voidPx)} to the target ${px(note.asset, note.targetPx)}`;
  return (
    <div className="scale" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((clamped ?? 0) * 100)} aria-label="Distance from void level to target" aria-valuetext={desc}>
      <div className="scale__ends">
        <span className="scale__end scale__end--void">
          <span className="cap">Void</span> <b className="tnum">{px(note.asset, note.voidPx)}</b>
        </span>
        <span className="scale__end scale__end--target">
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
        <div className="scale__entry" style={{ left: `${entry * 100}%` }}>
          <span className="tnum">entry {px(note.asset, note.entryPx)}</span>
        </div>
        {clamped != null && (
          <div
            className={`needle${print ? " needle--print" : ""}${pos! < 0 || pos! > 1 ? " needle--beyond" : ""}`}
            style={{ left: `${clamped * 100}%`, ["--from" as string]: `${entry * 100}%`, ["--lx" as string]: clamped > 0.82 ? "-100%" : clamped < 0.18 ? "0%" : "-50%" }}
          >
            <span className="needle__label tnum">
              {label} {px(note.asset, p!)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** How fresh the numbers on screen are. */
export function Freshness() {
  const { state, status, updatedAt } = useLiveState();
  const now = useNow();
  if (state.source === "fixture") return <span>Sample snapshot taken {new Date(state.asOf * 1000).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", hour12: false })} IST</span>;
  if (status === "error") return <span className="neg">Live reads failing; showing the last good numbers</span>;
  return <span>Read {ago(now - updatedAt / 1000)}{status === "stale" ? ", retrying" : ""}</span>;
}
