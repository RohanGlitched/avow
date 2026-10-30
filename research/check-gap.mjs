// audit: compare slot0 at historical blocks with the swap-log step function, esp. over the zero-swap days
const rpc='https://mainnet.hsk.xyz';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function call(method,params){await sleep(400);const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return (await r.json()).result;}
import fs from 'node:fs';
const pools={WETH:'0xb92b79ed6b370d5cfee2e14b1d0983c258304c16',WBTC:'0xd9ea2ce468957ba49ccc38c4758ed6ecd561449a',WHSK:'0x4ff515761864e7838b0adb8b5b2b8b7a068905dc'};
const blockts=JSON.parse(fs.readFileSync('cache/blockts.json','utf8'));
const startBlock=28226683, startT=1790800501;
const day=(d)=>startBlock+Math.round(d*86400/2);
for (const [n,p] of Object.entries(pools)) {
  const store=JSON.parse(fs.readFileSync(`cache/swaps-${n}.json`,'utf8'));
  const all=Object.values(store.chunks).flat().sort((a,b)=>a.b-b.b);
  const out=[];
  for (const d of [8,9,10,11,12,13,14,15,16]) {
    const b=day(d); const s=await call('eth_call',[{to:p,data:'0x3850c7bd'},'0x'+b.toString(16)]);
    const sqrt=BigInt('0x'+s.slice(2,66)).toString();
    const last=[...all].reverse().find(x=>x.b<=b);
    out.push(`d${d} slot0==lastSwap:${last&&last.s===sqrt} (lastSwapBlock ${last?.b}, blk ${b})`);
  }
  console.log(n,'\n  '+out.join('\n  '));
}
// any log at all from the pool in zero-swap days?
for (const [n,p] of Object.entries(pools)) {
  const r=await call('eth_getLogs',[{address:p,fromBlock:'0x'+day(10.2).toString(16),toBlock:'0x'+(day(10.2)+4999).toString(16)}]);
  console.log(n,'all-topic logs in 5000-block span on d10.2:',Array.isArray(r)?r.length:r);
}
