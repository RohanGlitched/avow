// The league's house agents. Each runs this same program against its own vault, with one of these strategies.
// "avow" asks the model and states the odds it believes; the two rule agents state fixed odds so the league shows what
// grading does to a forecaster that is not calibrated. All of them pass through the same vault rules.
import type { Candidate } from "./signals.js";

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
    strategy: "A rule, no model: swears every candidate the vault allows and always states 80%. A baseline for overconfidence.",
  },
  fade: {
    id: "fade",
    name: "Fade",
    kind: "rule",
    strategy: "A rule, no model: bets against each candidate (the pool drifts away from the exchanges) and always states 65%. A contrarian baseline.",
  },
};

export const PERSONA: Persona = PERSONAS[(process.env.DICTUM_PERSONA as PersonaId) ?? "avow"] ?? PERSONAS.avow;

/** The mirror image of a candidate: same distances, opposite side. Null when the flipped levels would not clear the fees. */
export function flip(c: Candidate): Candidate | null {
  const side = c.side === "long" ? "short" : "long";
  const dir = side === "long" ? 1 : -1;
  if (c.rewardBps <= c.costBps) return null;
  return {
    ...c,
    key: `${c.sym}:${side}:fade`,
    side,
    target: c.entry * (1 + (dir * c.rewardBps) / 1e4),
    void: c.entry * (1 - (dir * c.riskBps) / 1e4),
    why: `fading the ${c.kind} signal: betting the HSKSwap pool moves away from the exchanges`,
  };
}

/** A rule agent's decision, in the shape the model's decision takes. */
export function ruleDecision(fresh: Candidate[]) {
  const c0 = fresh[0];
  const c = PERSONA.id === "fade" ? fresh.map(flip).find(Boolean) ?? null : c0;
  const confidence = PERSONA.id === "fade" ? 0.65 : 0.8;
  const rationale = `${PERSONA.name} is a rule agent: ${PERSONA.strategy}`;
  return { c, confidence, rationale, because: c ? c.why[0].toUpperCase() + c.why.slice(1) + "." : "", model: "rule", tokens: 0 };
}
