// Read-only check of a HashKey Global key: balances and the symbol rules for the three hedgeable pairs. Places no orders.
// HK_API_KEY=… HK_API_SECRET=… node dist/hedgecheck.js
import { balances, keysFromEnv, symbolRules } from "./hedge.js";

const k = keysFromEnv();
if (!k) throw new Error("set HK_API_KEY and HK_API_SECRET");
const b = await balances(k);
console.log("balances", Object.fromEntries(Object.entries(b).filter(([, v]) => v.free + v.locked > 0)));
for (const s of ["ETHUSDT", "BTCUSDT", "HSKUSDT"]) console.log(s, await symbolRules(s));
