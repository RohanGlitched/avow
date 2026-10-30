"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { State } from "./types";

const POLL_MS = 20_000;

type LiveStatus = "live" | "stale" | "error";
interface Live {
  state: State;
  status: LiveStatus;
  /** ms epoch of the last successful poll (or of the server render). */
  updatedAt: number;
}

const Ctx = createContext<Live | null>(null);

export function LiveProvider({ initial, children }: { initial: State; children: ReactNode }) {
  const [live, setLive] = useState<Live>({ state: initial, status: "live", updatedAt: initial.asOf * 1000 });
  const failures = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const ctl = { abort: null as AbortController | null };

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") return; // resumed on visibilitychange
      ctl.abort?.abort();
      const ac = new AbortController();
      ctl.abort = ac;
      const to = setTimeout(() => ac.abort(), 10_000);
      try {
        const r = await fetch("/api/state", { cache: "no-store", signal: ac.signal });
        if (!r.ok) throw new Error(`state ${r.status}`);
        const s = (await r.json()) as State;
        failures.current = 0;
        setLive({ state: s, status: "live", updatedAt: Date.now() });
      } catch {
        if (ac.signal.aborted && stopped) return;
        failures.current += 1;
        setLive((p) => ({ ...p, status: failures.current > 2 ? "error" : "stale" }));
      } finally {
        clearTimeout(to);
        if (!stopped) timer = setTimeout(tick, POLL_MS);
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        tick();
      } else clearTimeout(timer);
    };
    timer = setTimeout(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      clearTimeout(timer);
      ctl.abort?.abort();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <Ctx.Provider value={live}>{children}</Ctx.Provider>;
}

/** Live state (polled every 20 s, paused while the tab is hidden). Falls back to `fallback` outside the provider. */
export function useLiveState(fallback?: State): Live {
  const v = useContext(Ctx);
  if (v) return v;
  if (!fallback) throw new Error("useLiveState needs <LiveProvider> or a fallback state");
  return { state: fallback, status: "live", updatedAt: fallback.asOf * 1000 };
}

/**
 * The UI clock in unix seconds. A fixture is a frozen snapshot, so its clock stays at
 * `asOf`. Live data runs in real time. The first render always uses `asOf` so the
 * server and client markup match.
 */
export function useNow(): number {
  const v = useContext(Ctx);
  const asOf = v?.state.asOf ?? 0;
  const frozen = v?.state.source === "fixture";
  const [now, setNow] = useState(asOf);
  useEffect(() => {
    if (frozen) {
      setNow(asOf);
      return;
    }
    setNow(Math.max(asOf, Date.now() / 1000));
    const id = setInterval(() => setNow(Math.max(asOf, Date.now() / 1000)), 15_000);
    return () => clearInterval(id);
  }, [asOf, frozen]);
  return now;
}

export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
