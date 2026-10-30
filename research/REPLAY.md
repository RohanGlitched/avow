# Replay: do Avow's note rules make money on HSKSwap?

The judges asked us to show that the strategy makes money on real data, with the exact rules. **It doesn't.** We replayed the exact live rules and 88 alternatives the vault can express over 30 days of real HSKSwap swaps. Nothing has positive expectancy after costs:

- The live catch-up rule lost $0.161 per $50 note (111 notes).
- The live momentum rule lost $0.238 per note (90 notes).
- Every asset × kind cell lost money both in-sample and out-of-sample.
- No alternative cleared the pre-declared in-sample bar, so `chosen` is `null` and no `strategy-replayed.ts` was written.

Reproduce: `node fetch-liquidity.mjs` (once), `node replay.mjs --persist`, `node replay.mjs`. The outputs are `replay.json` (the main result), `replay-persist.json` (the impact sensitivity run), `replay-notes.json` (every replayed note of the live rules) and `replay-best-notes.json` (the notes of the best in-sample alternative).

## Window and split

| | UTC | unix |
|---|---|---|
| From | 2026-09-30 20:40 | 1790800800 |
| Split (in-sample ends, out-of-sample begins) | 2026-10-20 20:40 | 1792528800 |
| To | 2026-10-30 20:40 | 1793392800 |

How notes are counted in each half:

- **In-sample** notes are those whose expiry falls before the split.
- **Out-of-sample** notes open after the split and expire before the end.
- A note that straddles the split still runs in the simulation, so it blocks its asset as it would live. It is counted in neither half.

## Method

### Pool

Each pool (USDT/WETH, USDT/WBTC, USDT/WHSK) is rebuilt swap by swap:

- `sqrtPriceX96`, `tick` and in-range `liquidity` come from every Swap event in the window: 139, 85 and 1,924 swaps.
- The convergence cache kept only price and tick, so the liquidity and amounts were read from the same events through the public Blockscout API (`fetch-liquidity.mjs`, about 45 paced requests, no RPC).
- All 2,147 swaps that Blockscout listed match the cache exactly on block, log index and `sqrtPriceX96`. One WHSK swap is missing from Blockscout's listing; it keeps the cache's price and its neighbour's liquidity.
- Between swaps the price is a step function.

### Contract prices

Prices are computed the way `AvowVault.sol` computes them:

- **TWAP:** `floor(Σ tick·dt / 300)` over the last 300 s, priced at that tick.
- **Spot:** the price at the `slot0` tick.

### Exchange mid

The exchange mid is the mean of the Gate.io and HashKey Global 5-minute closes, as the live agent averages the two venues' mids. The momentum rule's hourly statistics come from Gate.io hourly closes, as in `market.ts`: 49 closes, the last one in progress, with fair as "now".

### Opening notes

The agent decides on a 5-minute step. A note is opened whenever the rules give a candidate; the model is ignored and pMin is recorded.

The live pre-checks are replayed:

- one note per asset at a time;
- a vault-wide 10-minute cooldown;
- the $10 daily loss limit;
- spot within 100 bps of the TWAP;
- the 3% seatbelt. Chainlink history isn't cached, so the exchange mid stands in for Chainlink here.

The contract's checks are also replayed:

- `_checkLevels` (stop 25–300 bps, reward/risk ≥ 1.2, reward > the fee cost);
- the 60 bps entry slippage guard against the TWAP;
- `SelfFulfilling`.

The stated-odds check is the model's job, so it is reported separately (see below) instead of being applied.

### Settlement

`settleable()` is checked every 30 s, like the agent loop:

1. **Void** when both the TWAP and spot are at or past the void level. A stop never waits.
2. Otherwise nothing settles unless |spot − TWAP| ≤ 100 bps.
3. **Lapsed** at expiry.
4. **Honoured** when both the TWAP and spot are at or past the target.

The exit swap must pass the 120 bps exit guard; if it would revert, the replay retries on the next check.

### Costs: every leg goes through the pool

- **Pool math:** constant-liquidity, exact-input swaps: `√P' = √P + Δy(1−0.003)/L` and `1/√P' = 1/√P + Δx(1−0.003)/L`. Short notes close with an exact-output buy-back.
- **Fee:** 0.30% each way.
- **Gas:** 920k gas per note round trip at 500 gwei, priced in HSK at the time (about $0.04).
- **Impact is not small:** median in-range liquidity means a $50 trade moves WETH about 16 bps, WBTC about 18 bps and WHSK about 4.5 bps.

### Impact persistence (two models)

- **reset** (main): our price move lasts until the next external swap, which lands where it did historically. This is the conservative model, because a reset destroys our impact.
- **persist** (sensitivity): later swaps replay their exact input amounts on the pool as we left it.

The results are close either way; see the sensitivity section.

### P&L

P&L is the contract's `pnl`: USDT out minus USDT in for the actual round trip, minus gas.

## 1. The exact live rules

These are the candidate rules in `agent/src/signals.ts`:

- **Catch-up:** |gap| > cost + 20 bps; reward = min(|gap|, 600); risk = max(30, min(300, reward/1.3)); 12 h.
- **Momentum:** Gate 4 h trend > max(1.2%, 2.2 × hourly vol), 1 h agrees, not against a 60 bps gap; risk = clamp(2.5 × vol, 40, 300); reward = max(1.8 × risk, 2.5 × cost); 8 h.

The cost is 60 bps in fees plus about 8 bps of gas, so ≈ 68 bps.

| Asset | Kind | Notes | Honoured / Void / Lapsed | Hit rate | Mean pMin | P&L | P&L per note | Fees / impact / gas per note | In-sample (n, per note) | Out-of-sample (n, per note) |
|---|---|---|---|---|---|---|---|---|---|---|
| WETH | catch-up | 39 | 6 / 0 / 33 | 15% | 74% | −$3.65 | −$0.093 | $0.300 / $0.096 / $0.041 | 19, −$0.148 | 19, −$0.057 |
| WBTC | catch-up | 37 | 5 / 1 / 31 | 14% | 80% | −$8.50 | −$0.230 | $0.300 / $0.093 / $0.041 | 18, −$0.241 | 18, −$0.212 |
| WHSK | catch-up | 35 | 7 / 0 / 28 | 20% | 79% | −$5.75 | −$0.164 | $0.300 / $0.016 / $0.043 | 26, −$0.131 | 9, −$0.260 |
| WETH | momentum | 36 | 4 / 2 / 30 | 11% | 57% | −$6.16 | −$0.171 | $0.299 / $0.094 / $0.042 | 19, −$0.250 | 16, −$0.067 |
| WBTC | momentum | 29 | 2 / 1 / 26 | 7% | 58% | −$7.70 | −$0.266 | $0.300 / $0.092 / $0.042 | 17, −$0.249 | 11, −$0.284 |
| WHSK | momentum | 25 | 0 / 2 / 23 | 0% | 57% | −$7.57 | −$0.303 | $0.300 / $0.017 / $0.042 | 14, −$0.294 | 11, −$0.315 |

Pooled by kind (P&L per note, ± one standard error):

| Kind | Full window | In-sample | Out-of-sample |
|---|---|---|---|
| Catch-up | 111 notes, hit 16% vs pMin 78%, −$0.161 ± 0.032 | 63 notes, −$0.168 ± 0.038 | 46 notes, −$0.158 ± 0.055 |
| Momentum | 90 notes, hit 7% vs pMin 57%, −$0.238 ± 0.042 | 50 notes, −$0.262 ± 0.057 | 38 notes, −$0.202 ± 0.067 |

Why it loses:

- 82% of catch-up notes and 88% of momentum notes lapse. A typical lapse loses about $0.34: the two fees plus gas, with the pool barely moved.
- Honoured notes make only +$0.04 to +$1.58, because most targets are only 90–140 bps (the gap itself) against a ~68–86 bps round trip.

**Calibrated forecaster:** suppose a forecaster stated the true hit rate for each asset and kind (0–20%). The vault would have refused every one of these 201 notes. The contract needs stated odds of at least 50%, and also odds × (reward + risk) > risk + 60 bps. The true hit rate is also far below the mean pMin in every cell.

## 2. Alternative strategies (pre-declared grid)

The grid was written into `replay.mjs` before any result was seen.

- Every family runs on two scopes: all three pools, and WHSK only, since WHSK is the only pool that trades every day.
- Every target must itself clear the round-trip cost plus 10 bps.
- The void is set at reward/1.25, within the mandate's 1.2 R/R, and kept between 25 and 300 bps.
- Rewards are capped at 600 bps.

### Families

| Family | Trigger | Bet | Grid | Configs |
|---|---|---|---|---|
| (a) catch-up, partial target | k·\|gap\| ≥ cost + 10 and an external swap in the last W h | the pool moves k of the way to the mid within H | k ∈ {0.3, 0.5, 0.7}, W ∈ {1, 6, 12} h, H ∈ {4, 12} h | 18 × 2 |
| (b) pool momentum | the pool TWAP moved ≥ θ over LB hours, the last quarter agrees, a swap in the last hour | θ more in the same direction within 4 h | LB ∈ {1, 2, 4} h, θ ∈ {80, 150} bps | 6 × 2 |
| (c) exchange lead | the mid moved ≥ X in N min; the pool moved < X/3 that way; gap ≥ X/2; a swap in the last hour | the pool follows 0.7 of the gap within H | X ∈ {80, 150} bps, N ∈ {30, 60} min, H ∈ {2, 4} h | 8 × 2 |
| (d) fade | the pool spot jumped ≥ S in 15 min; the exchange moved < S/3 that way; the pool sits ≥ S/2 past the mid | a reversal of k·jump within H | S ∈ {80, 150} bps, k ∈ {0.5, 1}, H ∈ {2, 4} h | 8 × 2 |
| (d2) fade to the mid, round 2 | a jump ≥ S in 15 min, the exchange flat that way | a full return to the mid within H | S ∈ {30, 60} bps, H ∈ {2, 4} h | 4 × 2 |

**Round 2 is disclosed as an addition.** All 16 round-1 fade configs fired zero times in-sample, because a target of k × jump must itself clear ~78 bps and pool jumps that big are rare. Round 2 was added on in-sample trigger counts only; round-1 fade also had zero out-of-sample notes. **Configs tried: 88** (80 in round 1, 8 in round 2).

### Selection rule (fixed in advance)

- Use in-sample data only.
- Among configs with ≥ 15 in-sample notes, take the highest value of mean net P&L per note minus one standard error.
- The pick must be above zero in-sample.
- Read its out-of-sample result once, and keep it only if it made money after all costs.

### Result

The best eligible config was `catchup-k0.7-act12h-h12-all`: −$0.050 ± 0.081 per note over 23 in-sample notes. That is not above zero, so nothing was carried out of sample and **`chosen` is `null`**.

The only configs positive in-sample had 1 to 11 notes and are noise. For example, `catchup-k0.7-act6h-h12-WHSK` made +$0.004 ± 0.084 over 11 notes; out of sample it made −$0.266 over 4 notes.

All results, losers included. Out-of-sample figures are shown for transparency only and took no part in selection; most out-of-sample cells have under 10 notes and can't be read.

| Config | In-sample notes | Hit | Per note (SE) | Out-of-sample notes | Per note |
|---|---|---|---|---|---|
| catchup-k0.3-act1h-h4-all | 0 | – | – | 2 | −$0.341 |
| catchup-k0.3-act1h-h12-all | 0 | – | – | 2 | $0.646 |
| catchup-k0.3-act6h-h4-all | 3 | 33% | $0.159 (0.500) | 2 | −$0.341 |
| catchup-k0.3-act6h-h12-all | 2 | 50% | $0.409 (0.749) | 2 | $0.646 |
| catchup-k0.3-act12h-h4-all | 4 | 25% | $0.034 (0.375) | 2 | −$0.341 |
| catchup-k0.3-act12h-h12-all | 2 | 50% | $0.409 (0.749) | 2 | $0.646 |
| catchup-k0.5-act1h-h4-all | 15 | 33% | −$0.163 (0.082) | 18 | −$0.212 |
| catchup-k0.5-act1h-h12-all | 13 | 38% | −$0.221 (0.117) | 19 | −$0.113 |
| catchup-k0.5-act6h-h4-all | 21 | 29% | −$0.128 (0.088) | 24 | −$0.188 |
| catchup-k0.5-act6h-h12-all | 15 | 40% | −$0.137 (0.137) | 21 | −$0.085 |
| catchup-k0.5-act12h-h4-all | 23 | 30% | −$0.117 (0.086) | 28 | −$0.206 |
| catchup-k0.5-act12h-h12-all | 16 | 44% | −$0.100 (0.133) | 22 | −$0.080 |
| catchup-k0.7-act1h-h4-all | 23 | 13% | −$0.195 (0.053) | 26 | −$0.188 |
| catchup-k0.7-act1h-h12-all | 18 | 33% | −$0.136 (0.061) | 24 | −$0.078 |
| catchup-k0.7-act6h-h4-all | 30 | 13% | −$0.166 (0.062) | 36 | −$0.207 |
| catchup-k0.7-act6h-h12-all | 20 | 40% | −$0.047 (0.087) | 24 | −$0.074 |
| catchup-k0.7-act12h-h4-all | 36 | 17% | −$0.172 (0.057) | 46 | −$0.236 |
| **catchup-k0.7-act12h-h12-all** (best eligible) | 23 | 39% | −$0.050 (0.081) | 25 | −$0.084 |
| poolmom-lb1h-th80-all | 28 | 14% | −$0.305 (0.047) | 12 | −$0.268 |
| poolmom-lb1h-th150-all | 8 | 25% | −$0.228 (0.164) | 2 | −$0.341 |
| poolmom-lb2h-th80-all | 32 | 16% | −$0.297 (0.045) | 14 | −$0.254 |
| poolmom-lb2h-th150-all | 11 | 18% | −$0.268 (0.108) | 2 | −$0.341 |
| poolmom-lb4h-th80-all | 35 | 14% | −$0.295 (0.043) | 16 | −$0.250 |
| poolmom-lb4h-th150-all | 16 | 13% | −$0.228 (0.080) | 7 | −$0.292 |
| exlead-x80-n30m-h2-all | 9 | 22% | −$0.172 (0.079) | 4 | −$0.340 |
| exlead-x80-n30m-h4-all | 8 | 25% | −$0.222 (0.133) | 3 | −$0.341 |
| exlead-x80-n60m-h2-all | 9 | 22% | −$0.174 (0.079) | 5 | −$0.272 |
| exlead-x80-n60m-h4-all | 8 | 25% | −$0.163 (0.105) | 4 | −$0.255 |
| exlead-x150-n30m-h2-all | 6 | 17% | −$0.173 (0.090) | 3 | −$0.302 |
| exlead-x150-n30m-h4-all | 6 | 17% | −$0.187 (0.119) | 2 | −$0.280 |
| exlead-x150-n60m-h2-all | 6 | 17% | −$0.174 (0.090) | 4 | −$0.286 |
| exlead-x150-n60m-h4-all | 6 | 17% | −$0.188 (0.120) | 3 | −$0.266 |
| fade-s{80,150}-k{0.5,1}-h{2,4}-all (8 configs) | 0 | – | – | 0 | – |
| catchup-k0.3-*-WHSK (6 configs) | 0 | – | – | 0 | – |
| catchup-k0.5-act1h-h4-WHSK | 8 | 38% | −$0.184 (0.140) | 3 | −$0.232 |
| catchup-k0.5-act1h-h12-WHSK | 8 | 38% | −$0.182 (0.146) | 3 | −$0.352 |
| catchup-k0.5-act6h-h4-WHSK | 8 | 38% | −$0.184 (0.140) | 4 | −$0.257 |
| catchup-k0.5-act6h-h12-WHSK | 8 | 38% | −$0.182 (0.146) | 3 | −$0.352 |
| catchup-k0.5-act12h-h4-WHSK | 8 | 38% | −$0.184 (0.140) | 4 | −$0.257 |
| catchup-k0.5-act12h-h12-WHSK | 8 | 38% | −$0.182 (0.146) | 3 | −$0.352 |
| catchup-k0.7-act1h-h4-WHSK | 10 | 30% | −$0.129 (0.109) | 4 | −$0.176 |
| catchup-k0.7-act1h-h12-WHSK | 10 | 50% | −$0.031 (0.084) | 4 | −$0.266 |
| catchup-k0.7-act6h-h4-WHSK | 12 | 25% | −$0.167 (0.094) | 5 | −$0.208 |
| catchup-k0.7-act6h-h12-WHSK | 11 | 55% | $0.004 (0.084) | 4 | −$0.266 |
| catchup-k0.7-act12h-h4-WHSK | 13 | 23% | −$0.180 (0.087) | 5 | −$0.208 |
| catchup-k0.7-act12h-h12-WHSK | 12 | 50% | −$0.025 (0.082) | 4 | −$0.266 |
| poolmom-lb1h-th80-WHSK | 8 | 13% | −$0.305 (0.113) | 2 | −$0.233 |
| poolmom-lb1h-th150-WHSK | 2 | 50% | −$0.000 (0.365) | 0 | – |
| poolmom-lb2h-th80-WHSK | 8 | 13% | −$0.305 (0.113) | 2 | −$0.233 |
| poolmom-lb2h-th150-WHSK | 3 | 33% | −$0.093 (0.230) | 0 | – |
| poolmom-lb4h-th80-WHSK | 9 | 11% | −$0.311 (0.098) | 2 | −$0.233 |
| poolmom-lb4h-th150-WHSK | 4 | 25% | −$0.157 (0.175) | 0 | – |
| exlead-x80-n30m-h2-WHSK | 9 | 22% | −$0.172 (0.079) | 2 | −$0.340 |
| exlead-x80-n30m-h4-WHSK | 8 | 25% | −$0.222 (0.133) | 1 | −$0.340 |
| exlead-x80-n60m-h2-WHSK | 8 | 25% | −$0.153 (0.087) | 2 | −$0.340 |
| exlead-x80-n60m-h4-WHSK | 7 | 29% | −$0.138 (0.117) | 1 | −$0.340 |
| exlead-x150-n30m-h2-WHSK | 5 | 20% | −$0.200 (0.105) | 2 | −$0.283 |
| exlead-x150-n30m-h4-WHSK | 5 | 20% | −$0.216 (0.142) | 1 | −$0.220 |
| exlead-x150-n60m-h2-WHSK | 4 | 25% | −$0.165 (0.128) | 2 | −$0.283 |
| exlead-x150-n60m-h4-WHSK | 4 | 25% | −$0.187 (0.179) | 1 | −$0.220 |
| fade-s{80,150}-k{0.5,1}-h{2,4}-WHSK (8 configs) | 0 | – | – | 0 | – |
| fade2-s30-to-mid-h2 (all and WHSK, same note) | 1 | 0% | −$0.369 | 0 | – |
| fade2-s30-to-mid-h4 (all and WHSK, same note) | 1 | 100% | $0.208 | 0 | – |
| fade2-s60-to-mid-h{2,4} (all and WHSK) | 0 | – | – | 0 | – |

## 3. Why no rule of ours can work here: the edge budget

This check needs no model. A note can't earn more than the pool's own move toward the exchange, and the round trip costs ~70–90 bps. We took every 5-minute sample where the pool had an external swap in the prior 12 h and stood G bps from the mid, and measured how far the pool itself then moved toward the exchange, using spot and no trade of ours.

Samples overlap heavily (one 12 h move counts up to 144 times), so read these as averages over a handful of regimes.

| Asset | Gap (bps) | Samples | Mean pool move toward the exchange, 2 h / 4 h / 12 h (bps) | Share moved ≥ 70 bps by 12 h | Mean best point within 12 h (bps) |
|---|---|---|---|---|---|
| WETH | 50–100 | 960 | 13 / 17 / 18 | 23% | 46 |
| WETH | 100–200 | 941 | 19 / 31 / 44 | 28% | 53 |
| WETH | ≥ 200 | 256 | 53 / 84 / 92 | 24% | 100 |
| WBTC | 50–100 | 1113 | 12 / 18 / 36 | 33% | 54 |
| WBTC | 100–200 | 679 | 15 / 35 / 57 | 45% | 64 |
| WBTC | ≥ 200 | 10 | 0 / 0 / 0 | 0% | 0 |
| WHSK | 50–100 | 2776 | 6 / 12 / 34 | 15% | 42 |
| WHSK | 100–200 | 89 | 19 / 24 / 73 | 29% | 81 |
| WHSK | ≥ 200 | 105 | 86 / 182 / 391 | 99% | 391 |

**Most cells:** on gaps up to 200 bps, the pool's own average catch-up within 12 h (18–73 bps) and even its average best point (42–81 bps) sit at or below the round-trip cost. No choice of target, void or horizon on these signals can turn that into positive expectancy.

**The exception:** WHSK at ≥ 200 bps, which is essentially **one episode**. It is the re-pricing on Oct 15–16, after all three pools sat without a swap from Oct 10 to Oct 15. One event can't be the basis of a rule.

**WETH at ≥ 200 bps** averages 92 bps but has a median of 0. A few large catch-ups carry the mean, and three of four samples never move 70 bps.

## 4. Sensitivity: impact persistence

With the persist model (`replay-persist.json`), every cell still loses, in-sample and out-of-sample:

| Kind | Notes | Hit rate | P&L per note |
|---|---|---|---|
| Catch-up | 110 | 19% | −$0.181 |
| Momentum | 90 | 8% | −$0.197 |

The best eligible alternative is the same config: −$0.044 ± 0.086 per note in-sample, so `chosen` is `null` again.

## The chosen strategy

**None.** No rule of ours shows positive expectancy after costs on HSKSwap, so no `agent/src/strategy-replayed.ts` was written.

What the data support saying to judges:

- A $50 round trip through these 0.30%-fee pools costs about 68 bps plus 3–19 bps of impact.
- The pools themselves rarely move that far.
- The honest posture for the live agent is to pass, and to keep publishing its passes.

Out of sample the live rules would lose about $0.16 (catch-up) to $0.20 (momentum) per $50 note.

For reference only, and **not recommended**: the closest in-sample config was `catchup-k0.7-act12h-h12-all`, with params `{ scope: "all", k: 0.7, activeH: 12, horizonH: 12 }`. The rule: when 0.7 × |gap| ≥ cost + 10 bps and the pool had an external swap in the last 12 h, set the target at 0.7 × |gap| and the void at target/1.25, for 12 h. It lost $0.050 per note in-sample and $0.084 out-of-sample.

## Limitations

- **One window, one dormant stretch.** This is one 30-day window, with a six-day stretch (Oct 10–15) in which no pool swapped; 36 of the 202 notes of the live rules opened in it. A busier month with real arbitrageurs could look different. The edge budget says what would have to change: pool-side moves larger than ~90 bps inside the horizon.
- **Exchange mid.** The mid comes from 5-minute closes, not live mids, and it also stands in for the Chainlink seatbelt (Chainlink history is not cached).
- **Swap model.** Swaps are modelled at constant in-range liquidity, which is fine for $50 trades well inside a tick range. External swaps are assumed to be exact-input in the persist model.
- **Settlement timing.** Settlement is checked every 30 s. A keeper that is faster or slower than that would change little, because the price is a step function between swaps.
- **Shorts.** Short notes assume the vault holds the inventory to sell.
- **Sample sizes.** Out-of-sample samples are small: 46 and 38 notes for the live kinds, and under 10 for most alternatives. They are enough to show that the live rules lose. They cannot show that any alternative wins.
