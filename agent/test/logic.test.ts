import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (orig) => ({ ...(await orig<typeof import("node:fs")>()), existsSync: () => false }));
const { candidates, reshape } = await import("../src/signals.js");
const { classify } = await import("../src/desk.js");
const { unsupportedNumbers, statement } = await import("../src/brain.js");

const mandate = { maxSlippageBps: 60, maxSpotDevBps: 100, maxStopBps: 300, minRewardRiskX100: 120, maxDrawdownBps: 1500, cooldown: 600, maxHorizon: 86400, maxNotional: 250_000_000n, maxExposure: 250_000_000n, dailyLossLimit: 10_000_000n, assetMask: 7, paused: false };
const vault = (over: Record<string, unknown> = {}) =>
  ({ mandate, denomination: 50, exposure: 0, notes: [], blockTime: 1_793_400_000, balances: [{ sym: "USDT", amount: 100, locked: 0 }, { sym: "WETH", amount: 0.05, locked: 0 }, { sym: "WBTC", amount: 0.001, locked: 0 }, { sym: "WHSK", amount: 1000, locked: 0 }], ...over }) as never;
const snap = (sym: string, twap: number, fair: number, extra: Record<string, unknown> = {}) => ({
  sym, label: sym.slice(1), t: 0, twapPx: twap, twapPx8: BigInt(Math.round(twap * 1e8)), spotPx: twap, poolUsdt: 48_000, poolAsset: 20, lastSwapAgoSec: 600,
  hashkeyPx: fair, gatePx: fair, fairPx: fair, chainlinkPx: fair, chainlinkAgeSec: 3600, gapBps: ((fair - twap) / twap) * 1e4, chainlinkDevBps: (Math.abs(twap - fair) / fair) * 1e4,
  r1h: 0, r4h: 0, r24h: 0, vol1h: 0.006, swaps3h: 2, netFlowUsd3h: 0, maxSwapUsd3h: 0, ...extra,
});
const market = (eth: [number, number]) => [snap("WETH", eth[0], eth[1]), snap("WBTC", 76_000, 76_000), snap("WHSK", 0.087, 0.087)];

describe("candidate rules", () => {
  it("sets the target past the full round trip even when the gap is inside it, so the cost lands in pMin", () => {
    const { list } = candidates(market([2235, 2235 * 1.005]) as never, vault());
    const c = list.find((x) => x.key === "WETH:long:catch-up")!;
    expect(c).toBeTruthy();
    expect(c.rewardBps).toBeGreaterThanOrEqual(c.costBps * 2.5 - 1e-9); // aims past the cost, not at the gap
    expect(c.pMin).toBeCloseTo((c.riskBps + c.costBps) / (c.rewardBps + c.riskBps), 6);
  });
  it("passes when there is no visible gap or trend", () => {
    const { list, passes } = candidates(market([2235, 2235 * 1.0005]) as never, vault());
    expect(list.filter((c) => c.sym === "WETH")).toHaveLength(0);
    expect(passes.find((p) => p.sym === "WETH")).toBeTruthy();
  });
  it("offers a catch-up long when HSKSwap is well below the exchanges, with costs in pMin", () => {
    const { list } = candidates(market([2235, 2235 * 1.012]) as never, vault());
    const c = list.find((x) => x.key === "WETH:long:catch-up")!;
    expect(c).toBeTruthy();
    expect(c.costBps).toBeGreaterThan(60);
    expect(c.pMin).toBeCloseTo((c.riskBps + c.costBps) / (c.rewardBps + c.riskBps), 6);
    expect(c.rewardBps / c.riskBps).toBeGreaterThanOrEqual(1.2);
    expect(c.target).toBeGreaterThan(c.entry);
    expect(c.void).toBeLessThan(c.entry);
  });
  it("offers a short only up to the free inventory it can sell", () => {
    const { list } = candidates(market([2235, 2235 * 0.988]) as never, vault({ balances: [{ sym: "USDT", amount: 100, locked: 0 }, { sym: "WETH", amount: 0.01, locked: 0 }, { sym: "WBTC", amount: 0, locked: 0 }, { sym: "WHSK", amount: 0, locked: 0 }] }));
    const c = list.find((x) => x.key === "WETH:short:catch-up")!;
    expect(c.notionalUsd).toBeLessThanOrEqual(0.01 * 2235);
  });
  it("refuses everything for an asset the mandate excludes or with a note already open", () => {
    const { list } = candidates(market([2235, 2235 * 1.02]) as never, vault({ mandate: { ...mandate, assetMask: 6 } }));
    expect(list.some((c) => c.sym === "WETH")).toBe(false);
    const open = candidates(market([2235, 2235 * 1.02]) as never, vault({ notes: [{ asset: 0, status: "outstanding" }] }));
    expect(open.list.some((c) => c.sym === "WETH")).toBe(false);
  });
  it("refuses when Chainlink is stale (the off-chain seatbelt)", () => {
    const m = market([2235, 2235 * 1.02]);
    (m[0] as Record<string, unknown>).chainlinkAgeSec = 30 * 3600;
    expect(candidates(m as never, vault()).list.some((c) => c.sym === "WETH")).toBe(false);
  });
});

describe("the model may shape a candidate only inside the rules", () => {
  const c = candidates(market([2235, 2235 * 1.012]) as never, vault()).list[0];
  it("clamps the scale to 0.7–1.3 and the horizon to the allowed set", () => {
    const r = reshape(c, vault(), 5, 7)!;
    expect(r === null || r.rewardBps <= c.rewardBps * 1.3 + 1e-9).toBe(true);
    if (r) expect(r.horizonSec).toBe(c.horizonSec);
  });
  it("rejects a shape whose reward no longer clears costs or reward/risk", () => {
    expect(reshape({ ...c, rewardBps: c.costBps * 1.1 }, vault(), 0.7, 4)).toBeNull();
  });
  it("recomputes break-even after reshaping", () => {
    const r = reshape(c, vault(), 1.3, 12);
    if (r) expect(r.pMin).toBeLessThan(c.pMin);
  });
});

describe("mandate changes from plain language", () => {
  const m = { maxSlippageBps: 60, maxSpotDevBps: 100, maxStopBps: 300, minRewardRisk: 1.2, maxDrawdownBps: 1500, cooldownSec: 600, maxHorizonSec: 86400, maxNotionalUsd: 250, maxExposureUsd: 250, dailyLossLimitUsd: 10, assets: ["WETH", "WBTC", "WHSK"], paused: false } as never;
  it("reads 'false' as false (resuming is looser) and 'true' as stricter", () => {
    const paused = { ...(m as object), paused: true } as never;
    expect(classify(paused, "paused", "false")).toMatchObject({ to: false, stricter: false });
    expect(classify(m, "paused", "true")).toMatchObject({ to: true, stricter: true });
    expect(classify(m, "paused", "maybe")).toBeNull();
  });
  it("understands units", () => {
    expect(classify(m, "maxNotionalUsd", "$25")).toMatchObject({ to: 25, stricter: true });
    expect(classify(m, "maxStopBps", "1.5%")).toMatchObject({ to: 150, stricter: true });
    expect(classify(m, "cooldownSec", "2h")).toMatchObject({ to: 7200, stricter: true });
  });
  it("refuses values outside sane bounds", () => {
    expect(classify(m, "maxNotionalUsd", 100_000)).toBeNull();
    expect(classify(m, "maxStopBps", "50%")).toBeNull();
  });
  it("treats a subset of assets as stricter and a new asset as looser", () => {
    expect(classify(m, "assets", "ETH")).toMatchObject({ to: "WETH", stricter: true });
    const ethOnly = { ...(m as object), assets: ["WETH"] } as never;
    expect(classify(ethOnly, "assets", "ETH, HSK")).toMatchObject({ stricter: false });
  });
});

describe("what may be published on chain", () => {
  const c = candidates(market([2235, 2235 * 1.012]) as never, vault()).list[0];
  it("flags numbers the model invented", () => {
    expect(unsupportedNumbers("HSKSwap is 9.99% below with 777 swaps", c)).toEqual(expect.arrayContaining(["9.99", "777"]));
  });
  it("accepts numbers that are in the facts", () => {
    expect(unsupportedNumbers(`The pool fee is 0.30% each way`, c)).toEqual([]);
  });
  it("writes the levels and time from the rules, never the model", () => {
    const s = statement(c, 1_793_443_200, 0.62, "Because.");
    expect(s).toMatch(/^Avow swears that ETH will trade above [\d,.]+ on HSKSwap before .* IST, or this note is void at [\d,.]+\. Odds 62%\. Because\.$/);
  });
});
