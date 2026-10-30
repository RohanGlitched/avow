import { LOOP_MS, MODE } from "./config.js";
import { tick, account } from "./agent.js";
import { buildState } from "./state.js";
import { live, serve } from "./server.js";
import { journal } from "./journal.js";
import { simulateOutsideTraders } from "./sim.js";

serve();
journal.add({ kind: "heartbeat", title: `Dictum started (${MODE === "mainnet" ? "HSK Chain mainnet" : "rehearsal on a fork of HSK mainnet"})` });

let running = false;
async function loop() {
  if (running) return;
  running = true;
  try {
    const { snaps, v } = await tick();
    if (process.env.DICTUM_DEBUG) console.log("tick", snaps.map((x) => `${x.label} gap ${x.gapBps?.toFixed(1)}`).join(" "));
    live.vault = v;
    live.state = buildState(snaps, v, account.address);
    if (MODE === "fork-rehearsal") await simulateOutsideTraders(snaps).catch((e) => console.error("sim", e?.shortMessage ?? e));
  } catch (e) {
    console.error("tick failed", (e as Error)?.message ?? e);
  } finally {
    running = false;
  }
}
loop();
setInterval(loop, LOOP_MS);
