// Plain-words definitions for the four terms a newcomer trips on. Shown by <Term>.
export const GLOSSARY = {
  twap: {
    word: "TWAP",
    plain: "Time-weighted average price: the pool's average price over the last 5 minutes. One large swap cannot move it far, so it is a fair price to settle a note by.",
  },
  void: {
    word: "Void level",
    plain: "The price at which Avow admits it was wrong. If the TWAP and the live price both cross it, anyone can close the trade and the note is graded a miss.",
  },
  brier: {
    word: "Brier score",
    plain: "How well stated odds match what happened: the average of (confidence − outcome)². 0 is perfect, 0.25 is what always saying 50% scores. Lower is better.",
  },
  denomination: {
    word: "Denomination",
    plain: "The trade limit: the largest note Avow may write right now. It starts small and grows only with a graded, well-calibrated record.",
  },
} as const;

export type TermKey = keyof typeof GLOSSARY;
