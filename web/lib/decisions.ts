// One definition of a "decision", used by every count on the site: the journal tabs, the home page and the stats.
// A decision is a cycle that ended in a choice: a note sworn, a candidate declined, an attempt blocked by a clause,
// a review of an open note, or a pass where nothing was worth swearing. Heartbeats, settlements, mandate changes and
// errors are logged but are not decisions.
import type { JournalEntry, JournalKind } from "./types";

export const DECISION_KINDS: JournalKind[] = ["sworn", "declined", "blocked", "reviewed", "considered"];
const SET = new Set<JournalKind>(DECISION_KINDS);

export const isDecision = (e: Pick<JournalEntry, "kind">) => SET.has(e.kind);

export function decisionCounts(journal: Pick<JournalEntry, "kind">[]) {
  const c = (k: JournalKind) => journal.filter((e) => e.kind === k).length;
  const sworn = c("sworn");
  const declined = c("declined");
  const blocked = c("blocked");
  const reviewed = c("reviewed");
  const passes = c("considered");
  return { total: sworn + declined + blocked + reviewed + passes, sworn, declined, blocked, reviewed, passes };
}

/** Why the journal looks short: the agent cycles every 30 s but writes only when something changes. */
export const LOGGED_WHEN = "logged only when something changes";
