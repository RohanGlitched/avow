# Calibration: does the model add anything over the rules?

The judges said: "REPLAY says the model is ignored. Run the model over the historical candidates and publish its swear/abstain rate, stated odds vs outcomes, Brier, and P&L vs 'swear everything' and 'swear nothing'."

We did that. We took the 200 historical candidates from the replay and asked Gemini what the live agent would ask, using only what was known at each moment. Then we scored the answers against what the pool actually did.

**Short answer: the model is badly overconfident, and it never makes money.**

- **Stated odds.** When it swears, it states 68–74% odds. Those notes were honoured 10–20% of the time. On the notes it swore, its Brier score (0.43–0.47) is worse than a coin flip's (0.25).
- **Forecasts.** When it may say any probability, it averages 31–40% against a realized 12%. A constant base rate learned on the first 20 days beats it: Brier 0.104 against 0.151 (Flash) and 0.193 (Flash-Lite), and the gap holds out of sample.
- **P&L.** Swearing nothing ($0) beats every policy we tested:
  - Swearing everything lost $40.57 on 200 notes.
  - The live agent's decide() lost $7.93 on 29 notes with Flash-Lite and $1.55 on 30 notes with Flash.
- **Where the model helps.** With Flash, the agent cuts the loss of "swear everything" by about 96%. Most of that comes from abstaining on about 85% of candidates. There is also some real selection: the candidates Flash swore lost $0.06 per note at the rule's shape, against $0.23 for the ones it passed. A random pick of 30 does that well 1.4% of the time over the whole window, and about 7% within each half. Flash-Lite shows no selection (p = 0.87).

Model, date, tokens and cost: `gemini-3.5-flash-lite` (primary) and `gemini-3.5-flash` (the live agent's first choice), on Vertex AI, run on 2026-10-31 (IST). There were 808 calls in all, including 4 test calls: 1,137,610 input and 245,859 output tokens (thinking counted as output). The cost was $0.742 at the list prices in `agent/src/llm.ts`, against a $2 cap.

## What was run

### Candidates

These are the replay's notes of the live rules (`REPLAY.md` §1: 111 catch-up and 90 momentum, $50 each, 2026-09-30 20:40 to 2026-10-30 20:40 UTC).

- `node replay.mjs --calib` rebuilds each note and records what the live prompt shows at the moment it opened.
- It then re-simulates every note **alone**, with the replay's own pool, fee, guard, gas and settlement code (reset impact model). It does this at:
  - the rule's shape;
  - every reshape the model may ask for (targetScale 0.70–1.30 in 0.05 steps × horizon 2, 4, 8 or 12 h);
  - and the mirror-image note (what Fade would swear).
- One note (#146, WBTC catch-up) is dropped. Alone, its opening swap fails the guards; in the book it opened only because the pool was still displaced by our previous trade. That leaves **200 candidates**: 113 in-sample, 83 out-of-sample and 4 that straddle the split (these count in "all" only).
- The one-note simulation agrees with the book on the status of all 200 notes. Total net P&L is −$40.57 alone against −$39.18 in the book: in the book a note often opens into a pool our previous exit has moved.
- All P&L below uses the one-note numbers, so every policy is scored on the same footing.

### Arm 1, `decide()` exactly as live

- `agent/src/calibrate.ts` imports `decide()` from `agent/src/brain.ts` unchanged, at repo commit `95a505b`: the same system prompt, schema and `generate()` call. Settings: temperature 0.3, thinking budget 512, one sample per prompt.
- Then it applies what `agent.ts` does with the answer:
  1. the candidate key must match;
  2. `reshape()` applies the model's targetScale and horizon;
  3. `swearNote()` clamps the odds to 0.50–0.99 and declines unless they exceed pMin + 0.01.
- A sworn note is scored on the outcome of the shape actually sworn. Reshapes are snapped to the 0.05 grid that was simulated.

### Arm 2, forecast only

`decide()` only states odds when it swears, and its system prompt floors them at 0.50. So we added a second prompt:

- The user message is identical.
- The system prompt is the same, except that the decision paragraph is replaced by: give the probability (0.00–1.00) that this candidate, exactly as given, is honoured; values below 0.50 are allowed.
- It asks for no decision and no reshape. The text is in `agent/src/calibrate.ts` (`SYSTEM_FORECAST`).
- This arm exists to measure calibration. It is not what the live agent runs.

### Baselines, all scored on the same 200 outcomes

| Baseline | What it states |
|---|---|
| Bold | 0.80 on every candidate |
| Fade | 0.65 on the mirror-image note, scored on that note's own outcome |
| Coin | 0.50 |
| pMin | the vault's break-even at the rule's levels |
| In-sample base rate | the hit rate per kind on days 1–20 (catch-up 15.9%, momentum 10.0%), applied everywhere |
| Hindsight base rate | the same rate over the full window (look-ahead, for reference) |
| Study prior | the "measured over N days" share the prompt itself shows |

### Prompt reconstruction (no look-ahead)

| Live prompt field | Here |
|---|---|
| Now, denomination | Candidate open time; $50 (the replay's size) |
| Record, Brier, realised P&L, recent outcomes | Rebuilt from the model's own sworn notes in this run that had closed before "now" (arm 1 and arm 2 see the same record) |
| TWAP, spot | The replay's pool at that second (300 s mean tick, as the vault computes it) |
| Exchange mid, HashKey Global, Gate | 5-minute closes of the candle ending at "now" |
| 1 h / 4 h / 24 h returns, 1 h volatility | Gate hourly closes up to "now", as `market.ts` computes them |
| Last pool swap, swaps in ~3 h, net flow, largest swap | Swap events with timestamp ≤ "now" (10,000 s window ≈ the live 5,000 blocks) |
| Measured prior ("of N past gaps … moved half-way") | Rebuilt from `cache/episodes.json`, using only episodes whose 12 h follow-up ended before "now". The live `study.json` covers the full window, which would be look-ahead. |
| Round-trip line, pMin, costBps | Today's `signals.ts` wording: costBps = 60 (the vault's two pool fees), pMin = the vault break-even, gas shown separately (~$0.045, ~9 bps of $50) |
| "No candidate for" | Other assets: outstanding note, seatbelt or spike, or the no-edge reason of the replayed rule set |

**Omitted, not reconstructable:**

- the Chainlink price and age line (no Chainlink history in the cache; as in the replay, the exchange mid stands in for the seatbelt);
- the pool-depth line;
- for WBTC before its first swap in the window (about the first 12 h), "last pool swap", shown as "?". Our swap cache starts at the window.

**Other differences from live:**

- **One candidate per prompt.** Each candidate is asked alone. The live agent sees every asset's candidates in one prompt and picks at most one. In the replay, catch-up and momentum ran as separate books.
- **Older rules.** The candidates come from the rule set that `REPLAY.md` replayed. Since then, `signals.ts` (commit `810a32e`, Oct 31) has moved to looser, market-sized levels, which were **not** re-replayed here.
- **Own swaps.** The live "last swap" and swap counts would include the agent's own swaps; here they count external swaps only.
- **Model knowledge.** The prompts carry real dates and prices. We cannot rule out that a model's training data covers October 2026. The outcomes are small pool-level events, which are unlikely to be memorized.

## Results

### Arm 1: what the live agent would have done

| Model | Split | Candidates | Model said "swear" | Sworn after the break-even check | Mean stated odds (sworn) | Mean pMin (sworn) | Honoured | Hit rate (sworn) | Brier (sworn) |
|---|---|---|---|---|---|---|---|---|---|
| flash-lite | all | 200 | 29 (14.5%) | 29 (14.5%) | 0.68 | 0.61 | 3 | 10% | 0.434 |
| flash-lite | in-sample | 113 | 23 (20.4%) | 23 | 0.69 | 0.61 | 3 | 13% | 0.435 |
| flash-lite | out-of-sample | 83 | 6 (7.2%) | 6 | 0.65 | 0.59 | 0 | 0% | 0.429 |
| flash | all | 200 | 44 (22.0%) | 30 (15.0%) | 0.74 | 0.68 | 6 | 20% | 0.465 |
| flash | in-sample | 113 | 27 (23.9%) | 17 | 0.77 | 0.72 | 4 | 24% | 0.472 |
| flash | out-of-sample | 83 | 17 (20.5%) | 13 | 0.71 | 0.64 | 2 | 15% | 0.455 |

- **Flash-Lite never reshapes.** Every swear uses targetScale 1 and the rule's horizon.
- **Flash reshapes almost every note.** Of its 44 swears, 42 pull the target in (0.7 ×: 13, 0.8 ×: 22, 0.9 ×: 7). Its horizons are 12 h on 27, 8 h on 14 and 4 h on 3.
  - A closer target raises pMin. For 14 of those swears, the agent's own break-even check then declined the note, because the stated odds no longer cleared pMin + 0.01.
  - Reshaping improved the 30 sworn notes from −$1.90 (their rule shape) to −$1.55.
- **Reliability of sworn odds** (shaped outcome):

| Stated odds | flash-lite: n, realized | flash: n, realized |
|---|---|---|
| 0.50–0.60 | 6, 0% | 1, 100% |
| 0.60–0.70 | 11, 18% | 5, 20% |
| 0.70–0.80 | 7, 0% | 21, 19% |
| 0.80–0.99 | 5, 20% | 3, 0% |

No bin comes within 40 points of its stated odds. Realized rates do not rise with stated odds. The prompt's 0.50 floor alone guarantees a Brier score well above the base rate's on these notes.

### Arm 2: forecast quality on all 200 candidates

The outcome is honoured at the rule's own shape. The realized base rate is 12.0% overall, 13.3% in-sample and 10.8% out-of-sample. Lower Brier is better; AUC is how well the forecast ranks hits above misses (0.5 means no ranking).

| Forecaster | Brier, all | Brier, in-sample | Brier, out-of-sample | Mean stated | AUC, all |
|---|---|---|---|---|---|
| **gemini-3.5-flash** (forecast prompt) | 0.151 | 0.156 | 0.149 | 0.31 | 0.63 |
| **gemini-3.5-flash-lite** (forecast prompt) | 0.193 | 0.200 | 0.184 | 0.40 | 0.67 |
| In-sample base rate per kind | **0.104** | 0.114 | **0.094** | 0.13 | 0.61 |
| Hindsight base rate per kind (look-ahead) | 0.103 | 0.115 | 0.092 | 0.12 | 0.61 |
| Coin, 0.50 | 0.250 | 0.250 | 0.250 | 0.50 | 0.50 |
| pMin (vault break-even) | 0.379 | 0.370 | 0.393 | 0.65 | 0.69 |
| Bold, 0.80 | 0.568 | 0.560 | 0.575 | 0.80 | 0.50 |
| Fade, 0.65 on the mirror note (1% honoured) | 0.420 | 0.420 | 0.419 | 0.65 | – |

**Model minus the in-sample base rate.** This is the Brier difference with a paired bootstrap 95% interval. The candidates overlap in time, so the true uncertainty is larger.

| Model | All | In-sample | Out-of-sample |
|---|---|---|---|
| flash | +0.046 [0.022, 0.069] | +0.042 [−0.001, 0.085] | +0.054 [0.025, 0.084] |
| flash-lite | +0.085 [0.052, 0.123] | +0.085 [0.022, 0.144] | +0.089 [0.045, 0.128] |

Both models beat coin and pMin, with paired-bootstrap intervals clear of zero in every split (in `calibration.json`), and beat Bold and Fade by wide margins. Both lose to the trivial base rate.

**Reliability of the forecast arm:**

| Stated | flash: n, realized | flash-lite: n, realized |
|---|---|---|
| 0.0–0.1 | 6, 0% | 4, 0% |
| 0.1–0.2 | 48, 4% | 16, 6% |
| 0.2–0.3 | 39, 13% | 28, 0% |
| 0.3–0.4 | 55, 16% | 35, 9% |
| 0.4–0.5 | 36, 14% | 76, 14% |
| 0.5–0.6 | 10, 30% | 20, 30% |
| 0.6–1.0 | 6, 0% | 21, 14% |

Free to say any probability, the models go below 50% most of the time (92% of Flash's forecasts, 80% of Flash-Lite's). But in every populated bin above 0.1 they still state roughly twice the realized rate or more.

**By kind:**

| Kind | Realized | flash: Brier, AUC | flash-lite: Brier, AUC | In-sample rate: Brier |
|---|---|---|---|---|
| Catch-up (110) | 16.4% | 0.173, 0.60 | 0.207, 0.67 | 0.137 |
| Momentum (90) | 6.7% | 0.125, 0.72 | 0.176, 0.60 | 0.063 |

**The prior shown in the prompt** (103 candidates that carry one):

- The "pool moved half-way" share averages 49% against 13.6% realized.
- Used as a forecast, it scores Brier 0.324, and the full-window `study.json` version scores 0.249.
- That prior answers a different question: half the gap with no void level, rather than the full target before the void. Both models discount it (Flash 0.165, Flash-Lite 0.219), but not far enough.

### P&L: every policy on the same candidates

Net of gas, $50 notes, the replay's cost model, each note simulated alone. Values are total P&L, then n notes and per-note P&L ± one standard error.

| Policy | All | In-sample | Out-of-sample |
|---|---|---|---|
| **Swear nothing** | **$0.00** | **$0.00** | **$0.00** |
| Swear everything (rule shape) | −$40.57 (200; −0.203 ± 0.026) | −$24.49 (113; −0.217 ± 0.033) | −$15.31 (83; −0.184 ± 0.044) |
| decide(), gemini-3.5-flash | −$1.55 (30; −0.052 ± 0.099) | −$1.40 (17; −0.082 ± 0.135) | −$0.15 (13; −0.011 ± 0.152) |
| decide(), gemini-3.5-flash-lite | −$7.93 (29; −0.273 ± 0.065) | −$6.67 (23; −0.290 ± 0.077) | −$1.26 (6; −0.210 ± 0.118) |
| Bold (swears when 0.80 > pMin + 0.01) | −$33.91 (167; −0.203) | −$22.44 (98) | −$10.71 (65) |
| Fade (0.65 > pMin + 0.01, mirror note) | −$56.58 (108; −0.524) | −$30.46 (62) | −$24.10 (43) |
| Forecast arm > pMin + 0.01 (derived), flash | −$1.47 (5) | −$1.23 (4) | −$0.25 (1) |
| Forecast arm > pMin + 0.01 (derived), flash-lite | −$4.25 (18) | −$4.35 (13) | +$0.10 (5; ± 0.41) |

**Before gas, in the vault's own P&L:**

- Flash's sworn notes come to −$0.27 overall and +$0.37 out of sample (13 notes, ± $0.15 per note).
- Swear everything comes to −$32.17.
- That out-of-sample figure is a small sample within one standard error of zero. It is not evidence of an edge.

**Does the model pick better candidates than chance?** We compared the candidates it swore with the rest, scored at the rule's own shape:

| Model | Sworn: hit rate, net per note | Not sworn: hit rate, net per note | Random pick of the same size doing as well (all / IS / OOS) |
|---|---|---|---|
| flash | 16.7%, −$0.063 | 11.2%, −$0.228 | p = 0.014 / 0.069 / 0.064 |
| flash-lite | 10.3%, −$0.273 | 12.3%, −$0.191 | p = 0.87 / 0.87 / 0.50 |

## Conclusion

- **Calibration.** Neither model is calibrated on this venue.
  - The live prompt can only state 50–99%, so every sworn note overstates its odds by 50 points or more.
  - Freed of that floor, Flash is the better forecaster of the two. It is still worse than a constant base rate learned in-sample, in both halves.
  - On these candidates, "the model's stated odds" carry less information than "about 13%".
- **Value over the rules.** The model adds value only as a brake.
  - With Flash, the live decide() loop would have lost $1.55 instead of $40.57. It swears about 1 candidate in 7, and its picks were somewhat better than random.
  - With Flash-Lite, it loses $7.93 and picks no better than chance.
  - Neither reaches positive expectancy. Swearing nothing is still the best policy, as `REPLAY.md` concluded from the costs alone.
- **What this supports saying.** The model's role in Avow today is to abstain, and to state odds that the vault grades in public. These results show that grading would punish it, with Brier 0.43–0.47 on the notes it swore, as designed. They do not show a trading edge.
- **Fixes this suggests**, not run here:
  - let the model state odds below 0.50, or abstain with a number;
  - start it from the realized hit rate of its own notes rather than the half-way prior;
  - and re-run this study on the current market-sized rules.

## Reproduce

1. `node research/replay.mjs --calib` writes `research/calib-candidates.json`. This needs `research/cache/`, which is gitignored. The file is 2 MB.
2. In `agent/`, bundle the study script and run it once per model. Set `DICTUM_DATA_DIR` to a scratch directory, so `llm.ts` writes its usage log there and not into the agent's data.

   ```
   npx esbuild src/calibrate.ts --bundle --platform=node --format=esm --target=node22 --outfile=<dir>/calibrate.mjs --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"
   DICTUM_DATA_DIR=<dir>/data DICTUM_MODELS=gemini-3.5-flash-lite,gemini-3.5-flash node <dir>/calibrate.mjs research/calib-candidates.json lite.jsonl
   DICTUM_DATA_DIR=<dir>/data2 DICTUM_MODELS=gemini-3.5-flash,gemini-3.5-flash-lite node <dir>/calibrate.mjs research/calib-candidates.json flash.jsonl
   ```

   It resumes from the JSONL file, prints a cost estimate first, and stops at `CALIB_MAX_USD` (default $1.90). On the VM the token comes from the metadata server. Here it came from `gcloud auth print-access-token`, the same `llm.ts` fallback.
3. `node research/calibrate-analyze.mjs gemini-3.5-flash-lite=lite.jsonl gemini-3.5-flash=flash.jsonl` writes `research/calibration.json`:
   - the summary per model and split;
   - one row per candidate: levels, outcome, both arms' answers and rationales;
   - one example prompt.

### Run details

| Run | Calls | Input tokens | Output tokens | Cost | Notes |
|---|---|---|---|---|---|
| flash-lite | 402 | 566,132 | 45,402 | $0.0748 | — |
| flash | 402 | 566,216 | 199,932 | $0.6669 | 5 of these calls fell back to flash-lite after a Flash failure |
| Test calls | 4 | 5,262 | 525 | $0.0007 | — |

Every candidate got an answer from both arms; no errors were recorded. The model's answers are single samples at temperature 0.3, so a second run would move individual decisions.
