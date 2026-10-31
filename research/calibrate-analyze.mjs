// Scores the model calibration study (CALIBRATION.md).
// Inputs: calib-candidates.json (node replay.mjs --calib) and one JSONL of model answers per model (agent/src/calibrate.ts).
// Usage:  node calibrate-analyze.mjs <model>=<answers.jsonl> [<model>=<answers.jsonl> ...]
// Output: calibration.json (summary per model + one row per candidate; no prompts beyond one example, no secrets).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(fs.readFileSync(path.join(HERE, 'calib-candidates.json'), 'utf8'));
const runs = process.argv.slice(2).map((a) => { const [model, file] = a.split('='); return { model, rows: fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) }; });
if (!runs.length) throw new Error('usage: node calibrate-analyze.mjs <model>=<answers.jsonl> ...');

const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const se = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) / a.length); };
const brier = (pairs) => (pairs.length ? mean(pairs.map(([p, y]) => (p - y) ** 2)) : null);
const ruleKey = (c) => `1.00@${(c.expiry - c.openT) / 3600}`;
const base = (c) => c.variants[ruleKey(c)];
const hit = (o) => (o.status === 'honoured' ? 1 : 0);
const SPLITS = { all: () => true, 'in-sample': (c) => c.split === 'in-sample', 'out-of-sample': (c) => c.split === 'out-of-sample' };
const cands = C.candidates.filter((c) => ['honoured', 'void', 'lapsed'].includes(base(c).status));
const dropped = C.candidates.length - cands.length;

// AUC (probability that a random honoured candidate got a higher forecast than a random miss), ties count half
function auc(pairs) {
  const pos = pairs.filter(([, y]) => y === 1).map(([p]) => p), neg = pairs.filter(([, y]) => y === 0).map(([p]) => p);
  if (!pos.length || !neg.length) return null;
  let s = 0; for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (pos.length * neg.length);
}
// paired bootstrap of a Brier difference (resamples candidates; the samples overlap in time, so this understates uncertainty)
function bootDiff(a, b, y, n = 4000) {
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const k = y.length, d = [];
  for (let t = 0; t < n; t++) { let s = 0; for (let i = 0; i < k; i++) { const j = Math.floor(rnd() * k); s += (a[j] - y[j]) ** 2 - (b[j] - y[j]) ** 2; } d.push(s / k); }
  d.sort((x, z) => x - z);
  return { meanDiff: r4(mean(d)), ci95: [r4(d[Math.floor(n * 0.025)]), r4(d[Math.floor(n * 0.975)])] };
}
function reliability(pairs, edges) {
  return edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    const xs = pairs.filter(([p]) => p >= lo && (i === edges.length - 2 ? p <= hi : p < hi));
    return { bin: `${lo.toFixed(2)}–${hi.toFixed(2)}`, n: xs.length, meanStated: r4(mean(xs.map(([p]) => p))), realized: r4(mean(xs.map(([, y]) => y))), honoured: xs.filter(([, y]) => y).length };
  });
}
const pnlStats = (xs) => ({ notes: xs.length, pnlUsd: r4(xs.reduce((s, x) => s + x, 0)), perNoteUsd: r4(mean(xs)), seUsd: r4(se(xs)) });

// climatology learned in-sample (hit rate per kind), applied to every candidate: the honest "base rate" a rule could know
const isHit = (kind) => mean(cands.filter((c) => c.split === 'in-sample' && c.kind === kind).map((c) => hit(base(c))));
const fullHit = (kind) => mean(cands.filter((c) => c.kind === kind).map((c) => hit(base(c))));
const clim = { 'catch-up': isHit('catch-up'), momentum: isHit('momentum') };
const climFull = { 'catch-up': fullHit('catch-up'), momentum: fullHit('momentum') };
const priorOf = (c) => { const p = c.snap.find((s) => s.sym === c.asset).prior; return p && p.episodes ? p.moved / p.episodes : null; };
const priorFullOf = (c) => { const p = c.snap.find((s) => s.sym === c.asset).prior; return p && p.fullWindow.episodes ? p.fullWindow.moved / p.fullWindow.episodes : null; };

const summary = {};
const perCand = new Map(cands.map((c) => {
  const b = base(c);
  return [c.id, {
    id: c.id, book: c.book, asset: c.asset, kind: c.kind, side: c.side, openT: c.openT, openUtc: new Date(c.openT * 1000).toISOString().slice(0, 16) + 'Z', expiry: c.expiry,
    horizonH: (c.expiry - c.openT) / 3600, split: c.split, entry: c.entry, target: c.target, void: c.void, rewardBps: r4(c.rewardBps), riskBps: r4(c.riskBps),
    gapBps: r4(c.gapBps), pMinVault: r4(c.pMinContract), pMinWithGas: r4(c.pMin), priorShown: r4(priorOf(c)),
    outcome: { status: b.status, closeT: b.closeT, pnlUsd: b.pnlUsd, netUsd: b.netUsd }, bookOutcome: { status: c.status, netUsd: r4(c.netUsd) },
    flipOutcome: { status: c.flip.status, netUsd: c.flip.netUsd ?? null }, models: {},
  }];
}));

for (const run of runs) {
  const ans = new Map(run.rows.map((x) => [x.id, x]));
  const S = {};
  const errors = { decide: run.rows.filter((x) => x.decideError).length, forecast: run.rows.filter((x) => x.forecastError).length };
  const inTok = run.rows.reduce((s, x) => s + (x.forecast?.inTokens ?? 0), 0);
  const tok = run.rows.reduce((s, x) => s + (x.tokens ?? 0), 0);
  const usd = run.rows.reduce((s, x) => s + (x.usd ?? 0), 0);
  const modelsUsed = {};
  for (const x of run.rows) for (const m of [x.decide?.model, x.forecast?.model]) if (m) modelsUsed[m] = (modelsUsed[m] ?? 0) + 1;
  for (const [split, f] of Object.entries(SPLITS)) {
    const cs = cands.filter(f).filter((c) => ans.get(c.id));
    const A = cs.map((c) => ({ c, a: ans.get(c.id).decide, fc: ans.get(c.id).forecast })).filter((x) => x.a);
    const said = A.filter((x) => x.a.decision === 'swear');
    const sworn = A.filter((x) => x.a.sworn);
    const swornPairs = sworn.map((x) => [x.a.p, hit(x.a.outcome)]);
    const reasons = {}; for (const x of A) reasons[x.a.reason] = (reasons[x.a.reason] ?? 0) + 1;
    const scales = {}; const hours = {};
    for (const x of said) { scales[String(x.a.targetScale)] = (scales[String(x.a.targetScale)] ?? 0) + 1; hours[String(x.a.horizonHours)] = (hours[String(x.a.horizonHours)] ?? 0) + 1; }
    // forecast arm and the baselines, on the same candidates (those with a forecast)
    const F = cs.filter((c) => ans.get(c.id).forecast && Number.isFinite(ans.get(c.id).forecast.probability));
    const y = F.map((c) => hit(base(c)));
    const pm = F.map((c) => Math.min(1, Math.max(0, ans.get(c.id).forecast.probability)));
    const fcs = {
      'model (forecast-only prompt)': pm,
      'Bold: always 0.80': F.map(() => 0.8),
      'coin: always 0.50': F.map(() => 0.5),
      'pMin (vault break-even at the rule levels)': F.map((c) => c.pMinContract),
      'in-sample hit rate per kind (learned on days 1-20)': F.map((c) => clim[c.kind]),
      'full-window hit rate per kind (hindsight, look-ahead)': F.map((c) => climFull[c.kind]),
    };
    const brierTable = Object.fromEntries(Object.entries(fcs).map(([k, p]) => [k, { n: p.length, brier: r4(brier(p.map((q, i) => [q, y[i]]))), meanStated: r4(mean(p)), auc: r4(auc(p.map((q, i) => [q, y[i]]))) }]));
    const withPrior = F.filter((c) => priorOf(c) !== null);
    const yP = withPrior.map((c) => hit(base(c)));
    const priorTable = {
      n: withPrior.length,
      'model (forecast-only prompt)': r4(brier(withPrior.map((c, i) => [Math.min(1, Math.max(0, ans.get(c.id).forecast.probability)), yP[i]]))),
      'study prior as shown in the prompt (episodes before the candidate)': r4(brier(withPrior.map((c, i) => [priorOf(c), yP[i]]))),
      'study.json full-window prior (look-ahead)': r4(brier(withPrior.map((c, i) => [priorFullOf(c), yP[i]]))),
      meanPriorShown: r4(mean(withPrior.map(priorOf))), realized: r4(mean(yP)),
    };
    // Fade states 0.65 on the mirror-image note: a different event, scored on its own outcome
    const fadeOk = F.filter((c) => ['honoured', 'void', 'lapsed'].includes(c.flip.status));
    const fade = { n: fadeOk.length, brier: r4(brier(fadeOk.map((c) => [0.65, hit(c.flip)]))), realized: r4(mean(fadeOk.map((c) => hit(c.flip)))) };
    // P&L, every policy on the same candidates, every note simulated alone with the replay's cost model
    const pnl = {
      'swear nothing': pnlStats([]),
      'swear everything (rule shape)': pnlStats(cs.map((c) => base(c).netUsd)),
      'model, decide() as the live agent runs it': pnlStats(sworn.map((x) => x.a.outcome.netUsd).filter((v) => v !== undefined)),
      'model forecast > pMin + 0.01 (derived policy)': pnlStats(F.filter((c) => ans.get(c.id).forecast.probability > c.pMinContract + 0.01).map((c) => base(c).netUsd)),
      'Bold (0.80 > pMin + 0.01, rule shape)': pnlStats(cs.filter((c) => 0.8 > c.pMinContract + 0.01).map((c) => base(c).netUsd)),
      'Fade (0.65 > pMin + 0.01, mirror note)': pnlStats(cs.filter((c) => 0.65 > c.pMinContract + 0.01 && c.flip.netUsd !== undefined).map((c) => c.flip.netUsd)),
    };
    const pnlGross = {
      'swear everything (rule shape)': pnlStats(cs.map((c) => base(c).pnlUsd)),
      'model, decide() as the live agent runs it': pnlStats(sworn.map((x) => x.a.outcome.pnlUsd).filter((v) => v !== undefined)),
    };
    // does the model's swear/abstain pick better candidates? (outcome of the candidate at the rule shape)
    const filt = {
      swornBaseHitRate: r4(mean(sworn.map((x) => hit(base(x.c))))), notSwornBaseHitRate: r4(mean(A.filter((x) => !x.a.sworn).map((x) => hit(base(x.c))))),
      swornBaseNetPerNote: r4(mean(sworn.map((x) => base(x.c).netUsd))), notSwornBaseNetPerNote: r4(mean(A.filter((x) => !x.a.sworn).map((x) => base(x.c).netUsd))),
      // the same model's forecast-only answer on the same candidates (consistency between the two prompts)
      // how often would a random pick of the same number of these candidates do at least as well (rule-shape net P&L)?
      randomPickPValue: (() => {
        const k = sworn.length, pool = A.map((x) => base(x.c).netUsd), obs = mean(sworn.map((x) => base(x.c).netUsd));
        if (!k || k >= pool.length) return null;
        let seed = 777; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
        let ge = 0; const N = 20000;
        for (let t = 0; t < N; t++) { const idx = pool.map((v, i) => [rnd(), v]).sort((u, w) => u[0] - w[0]).slice(0, k); if (mean(idx.map((z) => z[1])) >= obs - 1e-12) ge++; }
        return r4(ge / N);
      })(),
      forecastArmMeanOnSworn: r4(mean(sworn.filter((x) => x.fc).map((x) => x.fc.probability))), forecastArmMeanOnNotSworn: r4(mean(A.filter((x) => !x.a.sworn && x.fc).map((x) => x.fc.probability))),
    };
    S[split] = {
      candidates: cs.length,
      decide: {
        answered: A.length, saidSwear: said.length, saidSwearRate: r4(said.length / A.length), sworn: sworn.length, swornRate: r4(sworn.length / A.length), reasons,
        meanConfidenceWhenSwearing: r4(mean(said.map((x) => Number(x.a.confidence)).filter(Number.isFinite))), meanStatedOddsSworn: r4(mean(sworn.map((x) => x.a.p))),
        meanPMinSworn: r4(mean(sworn.map((x) => x.a.shape.pMin))), swornHitRate: r4(mean(swornPairs.map(([, h]) => h))), swornHonoured: swornPairs.filter(([, h]) => h).length,
        brierSworn: r4(brier(swornPairs)), targetScales: scales, horizonHours: hours,
        reliabilitySworn: reliability(swornPairs, [0.5, 0.6, 0.7, 0.8, 1.0]), filter: filt,
      },
      forecast: {
        answered: F.length, meanProbability: r4(mean(pm)), realizedHitRate: r4(mean(y)), share_below_050: r4(mean(pm.map((p) => (p < 0.5 ? 1 : 0)))),
        reliability: reliability(pm.map((p, i) => [p, y[i]]), [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]),
        brier: brierTable, studyPriorSubset: priorTable, fadeOnMirrorNote: fade,
        byKind: Object.fromEntries(['catch-up', 'momentum'].map((k) => {
          const idx = F.map((c, i) => [c, i]).filter(([c]) => c.kind === k).map(([, i]) => i);
          const yy = idx.map((i) => y[i]);
          return [k, { n: idx.length, realized: r4(mean(yy)), meanModel: r4(mean(idx.map((i) => pm[i]))), brierModel: r4(brier(idx.map((i) => [pm[i], y[i]]))),
            brierInSampleRate: r4(brier(idx.map((i) => [clim[k], y[i]]))), brierCoin: r4(brier(yy.map((v) => [0.5, v]))), aucModel: r4(auc(idx.map((i) => [pm[i], y[i]]))) }];
        })),
        bootstrapModelMinusBaseline: {
          'in-sample hit rate per kind': bootDiff(pm, F.map((c) => clim[c.kind]), y),
          'coin 0.50': bootDiff(pm, F.map(() => 0.5), y),
          'pMin': bootDiff(pm, F.map((c) => c.pMinContract), y),
        },
      },
      pnlNetOfGasUsd: pnl, pnlVaultGrossUsd: pnlGross,
    };
  }
  summary[run.model] = { calls: run.rows.length * 2, errors, modelsUsed, tokens: tok, forecastInputTokens: inTok, usd: r4(usd), ...S };
  for (const x of run.rows) {
    const pc = perCand.get(x.id); if (!pc) continue;
    pc.models[run.model] = {
      decide: x.decide ? { decision: x.decide.decision, confidence: x.decide.confidence, targetScale: x.decide.targetScale, horizonHours: x.decide.horizonHours, sworn: x.decide.sworn, reason: x.decide.reason,
        statedOdds: x.decide.p, shape: x.decide.shape, outcome: x.decide.outcome ? { status: x.decide.outcome.status, netUsd: x.decide.outcome.netUsd } : null, because: x.decide.because, rationale: x.decide.rationale, model: x.decide.model } : { error: x.decideError },
      forecast: x.forecast ? { probability: x.forecast.probability, rationale: x.forecast.rationale, model: x.forecast.model } : { error: x.forecastError },
    };
  }
}

// how the answers were produced (agent/src/calibrate.ts); usage is summed from the answers themselves
const meta = {
  runDate: '2026-10-31 (IST)',
  prompt: 'agent/src/brain.ts decide() imported unchanged (repo commit 95a505b); forecast-only arm: same user prompt, forecast system prompt in agent/src/calibrate.ts',
  call: 'agent/src/llm.ts generate(): Vertex AI global endpoint, temperature 0.3, thinkingBudget 512, maxOutputTokens 4000, JSON schema; one sample per prompt',
  where: 'local workstation, gcloud user access token (the llm.ts fallback path); not the VM',
  prices: 'list prices coded in agent/src/llm.ts: gemini-3.5-flash-lite $0.10 / $0.40, gemini-3.5-flash $0.30 / $2.50 per 1M input / output tokens (thinking counted as output)',
  primaryModel: 'gemini-3.5-flash-lite (fallback gemini-3.5-flash)', secondaryModel: 'gemini-3.5-flash (fallback gemini-3.5-flash-lite), the first choice of the live agent',
  usage: Object.fromEntries(runs.map((r) => [r.model, { answeredCalls: r.rows.length * 2, tokens: r.rows.reduce((s, x) => s + (x.tokens ?? 0), 0), usd: r4(r.rows.reduce((s, x) => s + (x.usd ?? 0), 0)) }])),
};
const out = {
  generatedAt: Math.floor(Date.now() / 1000),
  meta,
  window: C.window, notionalUsd: C.notionalUsd,
  candidates: cands.length, droppedNoBaseOutcome: dropped,
  oneNoteSimMatchesBook: C.oneNoteSimMatchesBook,
  bookVsOneNote: { bookNetUsd: r4(cands.reduce((s, c) => s + c.netUsd, 0)), oneNoteNetUsd: r4(cands.reduce((s, c) => s + base(c).netUsd, 0)), statusAgree: cands.filter((c) => c.status === base(c).status).length },
  climatologyInSample: { 'catch-up': r4(clim['catch-up']), momentum: r4(clim.momentum) }, climatologyFullWindow: { 'catch-up': r4(climFull['catch-up']), momentum: r4(climFull.momentum) },
  examplePrompt: runs[0].rows.find((x) => x.id === 0)?.prompt ?? null,
  summary,
  rows: [...perCand.values()],
};
fs.writeFileSync(path.join(HERE, 'calibration.json'), JSON.stringify(out, null, 1));
for (const [m, s] of Object.entries(summary)) {
  console.log(`\n=== ${m}: ${s.calls} calls, $${s.usd}, ${s.tokens} tokens, errors ${JSON.stringify(s.errors)}, used ${JSON.stringify(s.modelsUsed)}`);
  for (const split of Object.keys(SPLITS)) {
    const x = s[split];
    console.log(`-- ${split}: n=${x.candidates} said swear ${x.decide.saidSwear} (${x.decide.saidSwearRate}), sworn ${x.decide.sworn}, mean conf ${x.decide.meanConfidenceWhenSwearing}, sworn hit ${x.decide.swornHitRate}, Brier sworn ${x.decide.brierSworn}; reasons ${JSON.stringify(x.decide.reasons)}`);
    console.table(x.forecast.brier);
    console.log('prior subset', JSON.stringify(x.forecast.studyPriorSubset), 'fade', JSON.stringify(x.forecast.fadeOnMirrorNote));
    console.table(x.pnlNetOfGasUsd);
    console.log('filter', JSON.stringify(x.decide.filter), 'boot', JSON.stringify(x.forecast.bootstrapModelMinusBaseline));
  }
}
console.log('book vs one-note', JSON.stringify(out.bookVsOneNote), 'clim', JSON.stringify(out.climatologyInSample), JSON.stringify(out.climatologyFullWindow));
