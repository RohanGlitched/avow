# Catch-up convergence study (HSKSwap vs Gate.io)

Question from the judges: when an HSKSwap pool is more than the 0.30% fee away from the exchange price, how often does the gap close within the note's 12 h horizon, how fast, and who closes it?

Window: 30 days, 2026-09-30 20:35 UTC to 2026-10-30 20:35 UTC (8,641 five-minute samples per pool). No shortening was needed: archive `eth_call` and `eth_getLogs` worked for the whole window (854 RPC calls, 0 rate-limit retries). Reproduce with `node convergence.mjs` (raw data in `cache/`, results in `study.json` and `study-supplement.json`).

## Headline table (episodes bucketed by the gap at first crossing)

Only episodes with a full 12 h of observation after entry are counted (26 episodes starting in the last 12 h of the window are excluded).

| Asset | Gap at first crossing | Episodes | Converged <=12h | Converged <=2h | Pool moved >=50% of gap <=12h | Median h to converge | Pool-side share of convergences |
|---|---|---|---|---|---|---|---|
| WETH | 40–60 bps | 170 | 163 (96%) | 146 (86%) | 90 (53%) | 0.42 | 9% |
| WETH | 60–100 bps | 23 | 20 (87%) | 15 (65%) | 12 (52%) | 0.63 | 10% |
| WETH | 100–200 bps | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0.25 | 0% |
| WETH | >200 bps | 0 | 0 (-) | 0 (-) | 0 (-) | - | - |
| WBTC | 40–60 bps | 134 | 125 (93%) | 101 (75%) | 74 (55%) | 0.58 | 10% |
| WBTC | 60–100 bps | 10 | 7 (70%) | 6 (60%) | 3 (30%) | 0.33 | 0% |
| WBTC | 100–200 bps | 0 | 0 (-) | 0 (-) | 0 (-) | - | - |
| WBTC | >200 bps | 0 | 0 (-) | 0 (-) | 0 (-) | - | - |
| WHSK | 40–60 bps | 276 | 271 (98%) | 236 (86%) | 98 (36%) | 0.25 | 0% |
| WHSK | 60–100 bps | 57 | 55 (96%) | 45 (79%) | 20 (35%) | 0.25 | 0% |
| WHSK | 100–200 bps | 11 | 11 (100%) | 11 (100%) | 1 (9%) | 0.17 | 0% |
| WHSK | >200 bps | 1 | 1 (100%) | 0 (0%) | 0 (0%) | 8.08 | 0% |

Swaps per day in the window: WETH 4.6 (138 swaps), WBTC 2.8 (85), WHSK 64.1 (1,924). Median time between swaps: WETH 52 min, WBTC 77 min, WHSK 6 s (the WHSK mean hides bursts; there are days with 0 and days with 275 swaps).

Sample sizes: 40-100 bps buckets have 23 to 276 episodes per asset and are usable; every cell at 100 bps and above has 0 to 11 episodes and is anecdotal. WBTC 60-100 bps (n = 10) is also too small to read.

## What the numbers say

1. Small gaps (40-100 bps at first crossing) close fast: 92-98% within 12 h and 74-84% within 2 h, median 0.25-0.6 h.
2. They are almost never closed by the pool. The closing move was on the exchange side in 90-100% of cases. The pools are thin and quote stale prices between trades, so a measured gap is mostly pool staleness against short-lived exchange noise.
3. What a catch-up note needs is different: the pool itself moving at least half the gap. On 40-100 bps entries that happened about 53% (WETH), 53% (WBTC) and 35% (WHSK) of the time. Split by pool activity at entry (supplement file): with a swap in the prior 12 h it was 63%, 82% and 36%; with no swap in the prior 12 h it was 26%, 16% and 5%.
4. Gaps that persist are the dangerous case. All three pools had zero swaps from 2026-10-10 to 2026-10-15 (confirmed against `slot0` at historical blocks, see `check-gap.mjs`) while the exchange moved; median gaps of 100-500 bps lasted days. Sampling every 5-minute point rather than first crossings, a gap of 100-200 bps converged within 12 h only 50-64% of the time (WETH, WBTC, WHSK 64%) and a gap above 200 bps only 20% (WETH) and 24% (WHSK); WBTC had only 89 samples above 200 bps (91% converged), too few to read. These samples overlap heavily and stand for a handful of regimes, not thousands of independent trials.
5. Implication: a note should size for a coin flip on the pool side (roughly 35-55% on typical gaps, higher right after pool activity, near zero if the pool is dormant) and treat the exchange reverting as the more common way to be flat, not as a win for the catch-up thesis.

## Method

- Pool price: Swap event `sqrtPriceX96` for every swap in the window (5,000-block `eth_getLogs` pages), starting price from `slot0` at the first block of the window. Price is a step function, constant between swaps. USDT per whole asset, orientation set by `token0()`.
- Block timestamps by linear interpolation between anchor blocks every 20,000 blocks (max error on 8 random check blocks: 0 s).
- Exchange price: Gate.io 5-minute candle close (`ETH_USDT`, `BTC_USDT`, `HSK_USDT`); at sample time t the close of the candle ending at t. No zero-volume gaps in the series.
- Gap = (pool - exchange) / exchange in bps, sampled every 5 minutes.
- Episode: starts at the first sample with |gap| >= 40 bps after a sample below 30 bps; bucket is the gap at that sample (40-60, 60-100, 100-200, >200). Converged at the first later sample with |gap| < 30 bps.
- Side attribution at the converging sample: compare the pool's log-price move and the exchange's log-price move over the last 5 minutes, each signed by how much it narrowed the gap; the larger contributor gets the credit. A swap-free interval is therefore always exchange-side.
- Pool moved half: after entry, some swap within 12 h leaves the pool price at least halfway from its entry price towards the entry exchange price (fixed target, as a catch-up note has).
- Median hours to converge is taken over episodes converged within 12 h; pool-side share likewise.

## Limitations

- One 30-day window with a six-day dormant stretch in the middle. Activity regimes change; a different month could look quite different.
- Buckets at 100 bps and above are tiny. Because episodes are bucketed at first crossing, a gap that starts at 50 bps and widens to 300 bps is filed under 40-60; the sample-level numbers in point 4 cover that case.
- The exchange reference is Gate.io only (not HashKey Global or any pool-specific arbitrage venue). Gate.io 5-minute closes can lag or lead the true price by a few bps.
- Gap measured on 5-minute samples; faster moves inside a sample are not seen.
- No gas, slippage, pool depth, fee tier path or note payoff modelled. The pool price from the last swap is not the executable price for a trade of any size.
- Pool-side attribution is approximate when both prices move in the same interval.

## Files

- `convergence.mjs` the script; `notes.txt` text copied into `study.json` notes.
- `study.json` required result; `study-supplement.json` per-day gaps, pool activity split, any-entry sample-level stats, data quality.
- `check-gap.mjs` audit that logs agree with on-chain `slot0` over the dormant days.
- `cache/` raw swaps, candles, block timestamps, sampled series; ignored by `.gitignore`.
