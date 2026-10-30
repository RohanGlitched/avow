# Dictum — design document

> *Dictum meum pactum* — "my word is my bond", the motto of the old London stock exchange floor, where a trader's spoken word was binding.
> Dictum is an AI trader on HSK Chain whose every word is binding: before it trades, it must swear a falsifiable note on-chain.

Hackathon: HSK Chain Horizon Hackathon · India (DoraHacks), Track 1 **AI Agent Trading** (HSKSwap).
Deadline Nov 1 2026 21:30 IST. Demo day Nov 4 (Mumbai/online). Winners must be on HSK Chain **mainnet** (chain 177).

## 1. The idea in one paragraph

Every AI trading bot asks to be trusted. Dictum asks for nothing: it can only trade through a vault contract that
(1) enforces the owner's written **mandate** on-chain (assets, size, slippage, stop distance, horizon, daily loss, drawdown),
(2) makes the agent publish each trade as a **note** — a sworn, falsifiable statement with an entry, a target, a void level
(the stop) and an expiry, plus the agent's stated confidence — in the same transaction as the swap,
(3) lets **anyone** settle a note the moment the HSKSwap TWAP crosses its target or void level or the note expires
(permissionless stop-loss; the agent can tighten a stop but never widen it), and
(4) grades every settled note and computes the agent's **calibration** (Brier score) on-chain. The agent's
**denomination** — the largest note it may write — grows only as its graded record earns it, and shrinks when it is wrong
or overconfident. Autonomy is earned on-chain, not granted by a prompt.

The owner talks to Dictum in plain language ("how are we doing?", "be more careful", "only trade ETH", "trade bigger").
Anything that makes the mandate stricter the agent applies at once (the contract checks it is stricter); anything that
loosens it becomes an **amendment** the owner signs with their wallet.

## 2. Market facts measured on Oct 31 2026 (mainnet, chain 177)

- HSKSwap = Uniswap v3 fork. Factory `0x972cA9D1662F5e029cD18327D29026532E84c742`, SwapRouter02 `0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3`,
  QuoterV2 `0x603f70466fDdbE3F238220B9a74FFF419a2BbFDD`, NPM `0xDF0A9b833Db0E4CeEa103A4408f3B68e7FC0cad5`, UniversalRouter `0x76D86a6E224B19270c2cdA31477a4c79B2d56918`.
- Tokens: USDT `0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029` (6 dec), WETH `0xefd4bC9afD210517803f293ABABd701CaeeCdfd0` (18),
  WBTC `0x6119CA49a79f5825C8B345F8d7aC36B272565b14` (8), WHSK `0xB210D2120d57b758EE163cFfb43e73728c471Cf1` (18), USDC.e `0x054ed45810DbBAb8B27668922D110669c9D88D0a` (6).
- Pools (fee 3000): USDT/WHSK `0x4ff515761864e7838B0AdB8b5b2B8B7A068905dC` (~$436k USDT + 5.0M WHSK), USDT/WETH `0xb92b79ed6b370D5cFee2E14B1D0983C258304C16` (~$48k + 21.4 WETH),
  USDT/WBTC `0xd9EA2cE468957Ba49cCC38C4758Ed6ecD561449A` (~$50k + 0.66 WBTC). Observation cardinality 16/16/1 (WBTC must be raised).
- Activity is thin: ~1 swap per few hours on the HSK pool. HSKSwap prices drift from the exchange: at 00:30 IST HSKSwap was
  +0.48% (ETH), +0.35% (BTC), +0.51% (HSK) above HashKey Global. Pool fee 0.30%. → real, recurring spreads.
- Chainlink Data Feeds on HSK mainnet: ETH/USD `0xbB091f3b515059b7A887eDcC73dC2a2Fa65E0242`, BTC/USD `0x204ED500ab56A2E19B051561258E3A45c850360F`,
  HSK/USD `0x86CE42c1b714149Dc3A7b17169EF67b5F78A224b`, USDT/USD `0x823d7f90f7A3498DB6595886b6B5dC95E6B0B7f3`, USDC/USD `0x244Ce344df8837c9d938867E2Ffbf0E4B0169B56`.
  Updated on deviation/heartbeat (ages of 3–14 h seen) → used as a coarse seatbelt, not for grading.
- Gas: 500 gwei on mainnet; a note (swap + storage + statement) ≈ 350k gas ≈ 0.18 HSK ≈ $0.015. HSK ≈ $0.087.
- RPC `https://mainnet.hsk.xyz`: eth_getLogs range < 10,000 blocks (use 5,000). Block time 2 s.
- CEX reference: HashKey Global public API `https://api-glb.hashkey.com/quote/v1/ticker/price?symbol=ETHUSDT` (works from India); Gate.io as second source.

## 3. Architecture

```
HashKey Global + Gate (fair value) ─┐
HSKSwap pools (slot0, TWAP, swaps) ─┼─> agent/ (GCE VM asia-south1, static IP 35.200.225.158)
Chainlink feeds ────────────────────┘     signals → Gemini 3.5 Flash (Vertex AI) chooses + swears → deterministic guards
                                           → DictumVault.swear() on HSK Chain → keeper settles notes → journal → web
web/ (Next.js on Vercel): reads the vault directly over RPC + the agent's journal; chat (/desk) on Gemini with read tools;
    amendments are signed by the owner's wallet in the browser.
```

## 4. Contract (contracts/src/DictumVault.sol)

Roles: `owner` (human, holds funds), `agent` (server key, can only swear/retract/tighten/settle), anyone (settle, deposit).
Quote token USDT. Assets indexed 0=WETH, 1=WBTC, 2=WHSK, each with pool, fee, Chainlink feed.

Note (thesis) fields: id, asset, side (Long = buy asset with USDT; Short = sell inventory asset for USDT and buy back),
entryPx, targetPx, voidPx (all USD per whole asset ×1e8, from the pool TWAP), openedAt, expiry, confidenceBps (5000–9900),
amountIn, amountOut, statementHash, status (Outstanding, Honoured, Void, Lapsed, Retracted, Revoked), exitPx, pnlUsd6, settledAt.

Rules enforced by `swear()`: not paused/frozen; asset allowed; cooldown elapsed; one outstanding note per asset; horizon ≤ max;
long: target > entry > void (short mirrored); stop distance ≤ maxStopBps; reward/risk ≥ minRewardRisk; notional ≤ denomination
(tier cap) and ≤ maxNotional; open exposure ≤ maxExposure; daily realised loss < limit; swap price within maxSlippage of TWAP
and within maxOracleDev of Chainlink (Chainlink not stale). The full statement text is emitted in `NoteSworn`.

`settle(id)` (anyone): Honoured if TWAP ≥ target (long), Void if TWAP ≤ void, Lapsed if now ≥ expiry. Closing swap with
exit slippage bound. Grades the note: outcome 1 if Honoured else 0; squared error (p−o)² added to a rolling window of the
last 32 graded notes. Denomination tiers from the window: Probation (<5 graded) 20% of maxNotional; Apprentice (≥5, Brier ≤ .25) 40%;
Journeyman (≥12, Brier ≤ .22, PnL ≥ 0) 70%; Fiduciary (≥25, Brier ≤ .20, PnL > 0) 100%. Three consecutive Voids drop one tier.

`retract(id)` (agent): close early; graded as a miss (o = 0) so retreating never improves the record.
`tightenStop(id, newVoid)` (agent): only toward entry.
`tighten(Mandate)` (agent): every field must be equal or stricter; assets a subset. `amend(Mandate)` (owner): anything.
`revoke(id)` (owner): close any note (not graded). Drawdown: if NAV < HWM×(1−maxDD) the vault freezes until `unfreeze()` (owner).

## 5. Agent loop (agent/)

Every 30 s: read pools (slot0 + 300 s TWAP), Chainlink, HashKey Global + Gate mids, recent swaps. Every 60 s keeper: settle
any note whose condition is met (simulate first). Candidate builder (deterministic): fair-value spread (DEX vs CEX beyond fee +
gas + edge), momentum (CEX 1 h/4 h returns), volatility regime → candidates with computed levels and size limits.
Gemini 3.5 Flash (fallback 3.5 Flash-Lite) receives market + candidates + mandate + record and must answer strict JSON:
`{decision: "swear"|"abstain", candidate, confidence, statement, rationale}`. Guards: levels must be the computed ones (±0.1%),
confidence 0.50–0.99, statement must contain the asset, side, target, void and expiry; else abstain. Every decision (sworn or
declined, with reasons) goes to the journal. Journal → GCS / site.

## 6. Visual identity — security printing

Subject: a note is a promise. Banknotes and bearer bonds are the most elaborate trust technology print ever built — guilloché
rosettes, intaglio line-shading, microtext, serial numbers in red, void pantographs, perforated cancellation stamps,
colour-shifting ink. Every one of those features exists to make a promise verifiable. Dictum's notes use them the same way,
and each feature carries data:

- **Guilloché rosette = the note's hash.** Procedural SVG (sums of epicycles); parameters derived from the note hash, so every
  note's rosette is unique and anyone can recompute it. The **mandate** has its own rosette whose harmonics come from the mandate
  parameters — amend the mandate and the rosette morphs.
- **The promise clause.** The banknote's "I promise to pay the bearer on demand the sum of…" becomes the sworn statement:
  *"Dictum swears that ETH will trade above 2,271.40 on HSKSwap before 18:00 IST on 31 Oct, or this note is void at 2,203.10."*
- **Serial numbers** in red: `DCT·000042` = note id on chain. **Denomination** printed large = the note's notional cap tier.
- **Void pantograph**: when a note is voided, a hidden "VOID" pattern emerges across the note (as on security paper when copied).
- **Perforated HONOURED** stamp (cancelled-cheque perforation) when the target is reached. LAPSED = an inked date stamp.
- **OVI ink** (optically variable, green↔violet shift on hover/scroll) only on things verified on chain (tx links, addresses).
- **Intaglio charts**: price charts drawn as engraved line-shading (hatched fills, no gradients); a note's corridor
  (void → target, open → expiry) drawn over the HSKSwap price line.
- **Microtext** borders carry real data (the statement text, the tx hash) — readable when zoomed.

Tokens (light theme is primary; a dark "night plate" theme via prefers-color-scheme):
- paper `#EDF0E8` (security bond, pale grey-green), paper-2 `#E3E8DF`, iris tint `#E8E3EC` (rainbow-print gradient partner)
- ink `#173C30` (intaglio green), ink-2 `#2B3A57` (steel blue-black), muted `#5E6B63`
- void `#B3341C` (red security ink; serials, VOID), gilt `#9A7426` (HONOURED), OVI `#2F7D5B ↔ #6A3E9E`
- dark: plate `#0F1915`, paper-on-dark `#16231E`, ink-on-dark `#D9E4D9`

Type: **Bodoni Moda** (optical sizes) for denominations, big numerals and the sworn statements; **Archivo** (variable width)
for UI — expanded width for engraved-plate captions, normal width for body. Tabular figures everywhere numbers change.
No all-caps tracked eyebrows over every heading; captions only where a banknote would have one.

Motion: one orchestrated moment — the hero note "prints" (rosette lines drawn by stroke-dashoffset, then the statement
types, then the serial stamps in red). Live: the price needle drifts along the void→target scale. Everything else still.
Respect prefers-reduced-motion.

## 7. Pages

- `/` home: hero = the current outstanding note (or the latest settled one) as a full security note with the live needle;
  the sworn sentence; three live numbers (calibration, denomination, P&L); how a note works (annotated note, real data);
  the ledger of recent notes; what Dictum declined to swear (journal); the mandate rosette; the market it watches (HSKSwap vs
  HashKey Global vs Chainlink, live); architecture; guarantees → tests table; contracts with explorer links; rich footer.
- `/notes` the full ledger (filters by status/asset), `/notes/[id]` one note with its corridor chart, settlement, tx links, recomputed rosette.
- `/mandate` the mandate as a charter: each clause with live usage and blocked attempts; amendment flow (owner wallet signs).
- `/desk` chat with Dictum (positions, P&L, why, change strategy). Read tools + propose amendment + agent-side tighten.
- `/record` calibration: reliability diagram, Brier vs the 0.25 coin-flip line, tier ladder, P&L curve, rehearsal (replay on real HSKSwap history, labelled).
- `/how` how it works + verify (addresses, `cast` commands to reproduce every claim), `/journal` the agent's full deliberation log.
