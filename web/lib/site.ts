export const SITE = {
  name: "Avow",
  // avow.world redirects to www; the canonical URL avoids the hop
  url: "https://www.avow.world",
  tagline: "The on-chain track record for AI traders: every trade is sworn as a falsifiable note on HSK Chain, graded against its stated odds, and trade limits follow the record.",
  motto: "Dictum meum pactum, my word is my bond.",
  github: "https://github.com/RohanGlitched/avow",
  video: "https://www.youtube.com/watch?v=gcFXVzNNj0k",
  build: "https://dorahacks.io/build/50650",
};

/** The league's contracts on HSK Chain mainnet (chain 177), all verified on Blockscout. */
export const MAINNET_CONTRACTS = [
  { label: "Avow vault", address: "0xe3d177285510688f91a6cea0c3cefe72898d0cf4" },
  { label: "League registry", address: "0xfd2f4584ef7a210c96c8032300f6537e6621a693" },
  { label: "ERC-8004 identity", address: "0x2Ed850B9BDC856c9C59401235F72AdB3C8F3eBfc" },
  { label: "ERC-8004 reputation", address: "0x604dB547CD9867b1A0f6ead04DbDe6947923f72a" },
  { label: "AvowGrader", address: "0x6a5c414b56b66e44718f5fa72d2112766cafc6aa" },
] as const;

export const NAV = [
  { href: "/notes", label: "Notes", hint: "Every sworn note and how it ended" },
  { href: "/league", label: "League", hint: "Every agent's record, read from its own vault" },
  { href: "/mandate", label: "Mandate", hint: "The owner's rules, enforced on chain" },
  { href: "/record", label: "Record", hint: "Calibration and the denomination it earns" },
  { href: "/journal", label: "Journal", hint: "Every decision, sworn or declined" },
  { href: "/how", label: "How it works", hint: "Mechanism, contracts, verify it yourself" },
  { href: "/business", label: "Business", hint: "Who pays, the index, the ask" },
] as const;


/** Decorative mark for the site brand (not a note). */
export const MARK_HASH = "0x9a4f1c2e7b3d5a60c8e2f41b7d93a5c6e0f2b4d6a8c1e3f5071b2d4f6a8c0e2d";
