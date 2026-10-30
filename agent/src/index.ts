import { LOOP_MS, MODE } from "./config.js";
import { tick, account } from "./agent.js";
import { buildState } from "./state.js";
import { live, serve } from "./server.js";
import { journal } from "./journal.js";
import { simulateOutsideTraders } from "./sim.js";
import { mainnetPool, type MainnetPool } from "./market.js";
import { ASSETS } from "./config.js";

const mainnetPools: Record<string, MainnetPool> = {};

serve();
console.log(`Avow started (${MODE === "mainnet" ? "HSK Chain mainnet" : "rehearsal on a fork of HSK mainnet"})`);
if (!journal.all().length) journal.add({ kind: "heartbeat", title: `Avow began watching HSKSwap (${MODE === "mainnet" ? "HSK Chain mainnet" : "rehearsal on a fork of HSK mainnet"})` });

let running = false;
async function loop() {
  if (running) return;
  running = true;
  try {
    const { snaps, v } = await tick();
    if (process.env.DICTUM_DEBUG) console.log("tick", snaps.map((x) => `${x.label} gap ${x.gapBps?.toFixed(1)}`).join(" "));
    live.vault = v;
    if (MODE !== "mainnet") for (const a of ASSETS) mainnetPools[a.sym] = await mainnetPool(a);
    live.state = buildState(snaps, v, account.address, mainnetPools);
    if (MODE === "fork-rehearsal") await simulateOutsideTraders(snaps).catch((e) => console.error("sim", e?.shortMessage ?? e));
  } catch (e) {
    console.error("tick failed", (e as Error)?.message ?? e);
  } finally {
    running = false;
  }
}
loop();
setInterval(loop, LOOP_MS);
