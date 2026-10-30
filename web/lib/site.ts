export const SITE = {
  name: "Avow",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://avow.world",
  tagline: "An AI trader on HSK Chain that must swear a falsifiable note before every trade.",
  motto: "Dictum meum pactum, my word is my bond.",
};

export const NAV = [
  { href: "/notes", label: "Notes", hint: "Every sworn note and how it ended" },
  { href: "/mandate", label: "Mandate", hint: "The owner's rules, enforced on chain" },
  { href: "/record", label: "Record", hint: "Calibration and the denomination it earns" },
  { href: "/journal", label: "Journal", hint: "Every decision, sworn or declined" },
  { href: "/how", label: "How it works", hint: "Mechanism, contracts, verify it yourself" },
  { href: "/business", label: "Business", hint: "Who pays, the index, the ask" },
] as const;

export const CHANGELOG = [
  { date: "2026-10-31", text: "Vault rules no longer read Chainlink: a spike clause, no self-fulfilling notes, no negative-expectancy notes." },
  { date: "2026-10-31", text: "Desk: talk to Avow. Stricter changes apply at once; looser ones become amendments the owner signs." },
  { date: "2026-10-30", text: "Fork rehearsal on HSK mainnet state: notes, settlement by anyone, calibration grading. 27 fork tests pass." },
  { date: "2026-10-29", text: "Measured HSKSwap against HashKey Global: recurring 35–50 bps premiums on thin pools." },
];

/** Decorative mark for the site brand (not a note). */
export const MARK_HASH = "0x9a4f1c2e7b3d5a60c8e2f41b7d93a5c6e0f2b4d6a8c1e3f5071b2d4f6a8c0e2d";
