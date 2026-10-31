// The league's house agents. Each runs this same program against its own vault, with one of these strategies.
// "avow" asks the model and states the odds it believes; the two rule agents state fixed odds so the league shows what
// grading does to a forecaster that is not calibrated. All of them pass through the same vault rules.
import type { Candidate } from "./signals.js";
import type { VaultView } from "./vault.js";

export type PersonaId = "avow" | "bold" | "fade";

export interface Persona {
  id: PersonaId;
  name: string;
  kind: "model" | "rule";
  strategy: string;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  avow: {
    id: "avow",
    name: "Avow",
    kind: "model",
    strategy: "Gemini reads the pools, the exchanges and its own record, and states the odds it believes. Swears only when those odds clear the fees.",
  },
  bold: {
    id: "bold",
    name: "Bold",
    kind: "rule",
    strategy: "A rule, no model: trades every visible gap or trend, even ones smaller than the fees, and always states 80%. A baseline for overconfidence.",
  },
  fade: {
    id: "fade",
    name: "Fade",
    kind: "rule",
    strategy: "A rule, no model: takes the same signals as Bold and bets the other way, always stating 65%. A contrarian baseline.",
  },
};

export const PERSONA: Persona = PERSONAS[(process.env.DICTUM_PERSONA as PersonaId) ?? "avow"] ?? PERSONAS.avow;

/** The mirror image of a candidate: same distances, opposite side. Null when it would not clear the fees or the vault lacks inventory. */
export function flip(c: Candidate, v: VaultView): Candidate | null {
  const side = c.side === "long" ? "short" : "long";
  const dir = side === "long" ? 1 : -1;
  if (c.rewardBps <= c.costBps) return null;
  // a short sells free inventory, so it is sized to what the vault holds (as the rules size Avow's shorts)
  const bal = v.balances.find((b) => b.sym === c.sym);
  const notionalUsd = side === "short" ? Math.min(c.notionalUsd, Math.floor((bal ? (bal.amount - bal.locked) * c.entry * 0.98 : 0) * 100) / 100) : c.notionalUsd;
  if (notionalUsd < 1) return null;
  return {
    ...c,
    notionalUsd,
    key: `${c.sym}:${side}:fade`,
    side,
    target: c.entry * (1 + (dir * c.rewardBps) / 1e4),
    void: c.entry * (1 - (dir * c.riskBps) / 1e4),
    why: `fading the ${c.kind} signal: betting the HSKSwap pool moves away from the exchanges`,
  };
}

/** A rule agent's decision, in the shape the model's decision takes. */
export function ruleDecision(fresh: Candidate[], v: VaultView) {
  const c0 = fresh[0];
  const c = PERSONA.id === "fade" ? fresh.map((x) => flip(x, v)).find(Boolean) ?? null : c0;
  const confidence = PERSONA.id === "fade" ? 0.65 : 0.8;
  const rationale = `${PERSONA.name} is a rule agent: ${PERSONA.strategy}`;
  return { c, confidence, rationale, because: c ? c.why[0].toUpperCase() + c.why.slice(1) + "." : "", model: "rule", tokens: 0 };
}
