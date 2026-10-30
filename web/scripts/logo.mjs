// Renders app/icon.svg to a 512×512 PNG (DoraHacks logo field).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const svg = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
await p.setContent(`<html><body style="margin:0;background:#EDF0E8;display:grid;place-items:center;height:512px"><div style="width:420px;height:420px">${svg.replace("<svg", '<svg width="420" height="420"')}</div></body></html>`);
await p.screenshot({ path: new URL("../../docs/logo-512.png", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });
await b.close();
