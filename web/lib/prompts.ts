// Suggested questions for the desk, built from the vault's state so they always point at something real.
import type { State } from "./types";

export function deskPrompts(s: Pick<State, "notes" | "journal" | "asOf">, now: number = s.asOf): string[] {
  const out: string[] = [];
  const latest = s.notes[0]; // newest first
  if (latest) out.push(`Why did you swear ${latest.serial}?`);
  const lastPass = s.journal.find((e) => e.kind === "considered" || e.kind === "declined");
  const lastSworn = s.journal.find((e) => e.kind === "sworn");
  if (lastPass && now - lastPass.t < 15 * 60 && (!lastSworn || now - lastSworn.t > 10 * 60)) out.push("Why no trade in the last 10 minutes?");
  out.push("How are we doing?", "Be more careful today", "Only trade ETH", "Trade bigger", "Are these trades real?");
  return out;
}
