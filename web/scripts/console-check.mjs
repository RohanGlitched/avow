// Opens each page on a deployed site and prints console errors (hydration, fetch) per page.
import { chromium } from "playwright";
const base = (process.argv[2] ?? "https://avow-world.vercel.app").replace(/\/$/, "");
const pages = ["/", "/notes", "/notes/1", "/mandate", "/desk", "/record", "/journal", "/how", "/business"]; // note URLs carry the serial: /notes/1 is AVW·000001
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  for (const path of pages) {
    const p = await ctx.newPage();
    const errs = [];
    p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 300)));
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
    await p.goto(base + path, { waitUntil: "load", timeout: 60_000 });
    await p.waitForTimeout(3000);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(`${w} ${path} ${errs.length ? "ERRORS " + errs.join(" | ") : "ok"}${sw > w ? " SIDEWAYS " + sw : ""}`);
    await p.close();
  }
  await ctx.close();
}
await b.close();
