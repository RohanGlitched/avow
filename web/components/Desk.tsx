"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Rosette } from "./Rosette";
import { AmendmentForm } from "./Amendment";
import { useLiveState, useNow } from "@/lib/live";
import { deskPrompts } from "@/lib/prompts";
import { MARK_HASH } from "@/lib/site";
import { noteHref, serialFor, usd } from "@/lib/format";
import type { ProposalRow } from "@/lib/mandate";

type Turn =
  | { role: "owner"; content: string }
  | { role: "dictum"; content: string; citations?: number[]; proposal?: ProposalRow[]; intro?: boolean; engine?: string }
  | { role: "error"; content: string; retry: string };

export function Desk() {
  const { state } = useLiveState();
  const now = useNow();
  const prompts = deskPrompts(state, now);
  const open = state.notes.filter((n) => n.status === "outstanding");
  const intro: Turn = {
    role: "dictum",
    intro: true,
    content: `${open.length ? `${open.length} ${open.length === 1 ? "note is" : "notes are"} outstanding: ${open.map((n) => n.serial).join(" and ")}.` : "No note is outstanding."} My record: ${state.record.graded} graded, Brier ${state.record.brier?.toFixed(3) ?? "none yet"}, realised ${usd(state.record.pnlUsd, { sign: true })}. I am ${state.record.tier.name}, so my largest note is ${usd(state.record.tier.capUsd, { dp: 0 })}.\n\nAsk me why I did anything, or tell me how to trade. Stricter changes I apply with tighten() once the owner signs a free message (no gas); looser ones the owner signs with amend().`,
    citations: open.map((n) => n.id),
  };
  const [turns, setTurns] = useState<Turn[]>([intro]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const send = async (q: string) => {
    const content = q.trim();
    if (!content || busy) return;
    setText("");
    const history = [...turns.filter((t) => t.role !== "error" && !(t.role === "dictum" && t.intro)), { role: "owner" as const, content }];
    setTurns((t) => [...t.filter((x) => x.role !== "error"), { role: "owner", content }]);
    setBusy(true);
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 45_000);
      const r = await fetch("/api/desk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map((t) => ({ role: t.role, content: t.content })) }),
        signal: ac.signal,
      });
      clearTimeout(to);
      const j = (await r.json().catch(() => ({}))) as { reply?: string; citations?: number[]; proposal?: ProposalRow[]; error?: string; engine?: string };
      if (!r.ok || !j.reply) throw new Error(j.error ?? `The desk answered with status ${r.status}.`);
      setTurns((t) => [...t, { role: "dictum", content: j.reply!, citations: j.citations, proposal: j.proposal, engine: j.engine }]);
    } catch (e) {
      const msg = e instanceof Error && e.name === "AbortError" ? "Avow took longer than 45 seconds to answer." : e instanceof Error ? e.message : "The desk could not be reached.";
      setTurns((t) => [...t, { role: "error", content: msg, retry: content }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (turns.length > 1) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns, busy]);

  // the composer only sticks to the bottom once a conversation has started, so on a phone it never covers the chips
  const started_ = turns.length > 1;

  return (
    <div>
      <div className="thread" aria-live="polite" aria-busy={busy}>
        {turns.map((t, i) =>
          t.role === "owner" ? (
            <div key={i} className="msg msg--owner">
              {t.content}
            </div>
          ) : t.role === "error" ? (
            <div key={i} className="msg amend__msg amend__msg--err" role="alert">
              {t.content}{" "}
              <button className="btn btn--ghost" style={{ marginLeft: 8, minHeight: 36 }} onClick={() => send(t.retry)}>
                Ask again
              </button>
            </div>
          ) : (
            <div key={i} className="msg msg--dictum">
              <Rosette hash={MARK_HASH} only={[1, 2, 4]} />
              <div className="msg__body">
                <div className="msg__who">{t.intro ? "Avow, from the vault's current state" : "Avow"}</div>
                {t.content.split(/\n\n+/).map((p, k) => (
                  <p key={k}>{p}</p>
                ))}
                {t.citations?.length ? (
                  <div className="cites">
                    {t.citations.map((id) => (
                      <Link key={id} href={noteHref(id)} className="serial">
                        {serialFor(id, state.notes)}
                      </Link>
                    ))}
                  </div>
                ) : null}
                <div className="msg__engine">{t.intro ? "Computed from the vault's state, no model call" : t.engine ? `Answered by ${t.engine}` : "Answered by the agent"}</div>
                {t.proposal?.length ? (
                  <div style={{ marginTop: 14 }}>
                    <AmendmentForm rows={t.proposal} title="Proposed amendment" />
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}
        {busy ? (
          <div className="msg msg--dictum">
            <Rosette hash={MARK_HASH} only={[1, 2, 4]} />
            <div className="typing" aria-label="Avow is answering">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="prompts" role="group" aria-label="Suggested questions">
        {prompts.map((p) => (
          <button key={p} onClick={() => send(p)} disabled={busy}>
            {p}
          </button>
        ))}
      </div>
      <form
        className={`composer${started_ ? " composer--sticky" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="desk-input" className="sr-only">
          Message Avow
        </label>
        <textarea
          id="desk-input"
          rows={1}
          value={text}
          placeholder="Ask Avow, or tell it how to trade"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          maxLength={800}
        />
        <button className="btn" type="submit" disabled={busy || !text.trim()}>
          {busy ? "Asking…" : "Send"}
        </button>
      </form>
    </div>
  );
}
