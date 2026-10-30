// One-off: the convergence cache kept only sqrtPriceX96 and tick per swap. The replay also needs each swap's
// in-range `liquidity` and amounts (to price our own $50 trade). These come from the same Swap events, read
// through the public Blockscout API (not the rate-limited RPC), paced at ~1 request/s and cached.
// Usage: node fetch-liquidity.mjs   -> cache/bs-swaps-<SYM>.json  [{b,i,a0,a1,s,L,t}]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'cache');
const TOPIC = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const POOLS = {
  WETH: '0xb92b79ed6b370D5cFee2E14B1D0983C258304C16',
  WBTC: '0xd9EA2cE468957Ba49cCC38C4758Ed6ecD561449A',
  WHSK: '0x4ff515761864e7838B0AdB8b5b2B8B7A068905dC',
};
const win = JSON.parse(fs.readFileSync(path.join(CACHE, 'window.json'), 'utf8'));
const FROM_BLOCK = win.head - Math.ceil((30 * 86400) / 2) - 3000; // a little before the window start
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [sym, pool] of Object.entries(POOLS)) {
  const file = path.join(CACHE, `bs-swaps-${sym}.json`);
  if (fs.existsSync(file)) { console.log(sym, 'cached'); continue; }
  const out = [];
  let params = null;
  for (let page = 0; page < 400; page++) {
    const q = new URLSearchParams({ topic: TOPIC, ...(params ?? {}) });
    const url = `https://hsk.blockscout.com/api/v2/addresses/${pool}/logs?${q}`;
    let j = null;
    for (let a = 0; a < 6 && !j; a++) {
      try {
        const r = await fetch(url, { headers: { 'user-agent': 'avow-research/1.0' } });
        if (r.ok) j = await r.json();
        else { console.log(sym, 'status', r.status); await sleep(2000 * 2 ** a); }
      } catch (e) { await sleep(2000 * 2 ** a); }
    }
    if (!j) throw new Error('blockscout failed ' + sym);
    let stop = false;
    for (const it of j.items) {
      if (it.topics[0] !== TOPIC) continue;
      const b = Number(it.block_number);
      if (b > win.head) continue;
      if (b < FROM_BLOCK) { stop = true; continue; }
      const p = Object.fromEntries(it.decoded.parameters.map((x) => [x.name, x.value]));
      out.push({ b, i: Number(it.index), a0: p.amount0, a1: p.amount1, s: p.sqrtPriceX96, L: p.liquidity, t: Number(p.tick) });
    }
    if (stop || !j.next_page_params) break;
    params = j.next_page_params;
    await sleep(900);
  }
  out.sort((x, y) => x.b - y.b || x.i - y.i);
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(sym, out.length, 'swaps');
}
