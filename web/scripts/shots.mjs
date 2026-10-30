// Full-page screenshots of every page at 1440 and 390, plus layout checks.
// Usage: node scripts/shots.mjs [baseUrl] [page,page,...] [--dark] [--viewport]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("http")) ?? "http://localhost:3417").replace(/\/$/, "");
const only = args.find((a) => !a.startsWith("http") && !a.startsWith("--"));
const dark = args.includes("--dark");
const viewportOnly = args.includes("--viewport");
// Note pages: the newest few notes, read from the site itself (URLs carry the serial number: /notes/1 is AVW·000001).
let noteSerials = [];
try {
  const st = await (await fetch(base + "/api/state")).json();
  noteSerials = (st.notes ?? []).slice(0, 3).map((n) => n.id + 1);
} catch {}
const PAGES = [
  ["home", "/"],
  ["notes", "/notes"],
  ...noteSerials.map((n) => [`note-${n}`, `/notes/${n}`]),
  ["mandate", "/mandate"],
  ["desk", "/desk"],
  ["record", "/record"],
  ["how", "/how"],
  ["business", "/business"],
  ["journal", "/journal"],
  ["404", "/no-such-page"],
].filter(([k]) => !only || only.split(",").includes(k));
const WIDTHS = [1440, 390];
const out = fileURLToPath(new URL("../.shots/", import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const problems = [];
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w > 800 ? 900 : 844 }, deviceScaleFactor: 1, colorScheme: dark ? "dark" : "light", reducedMotion: "reduce" });
  for (const [key, path] of PAGES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base + path, { waitUntil: "networkidle" });
    // let deferred rosettes and measured charts draw
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth, h: document.body.scrollHeight, html: document.documentElement.outerHTML.length }));
    if (m.sw > m.vw) {
      const wide = await page.evaluate(() => {
        const vw = window.innerWidth;
        return [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > vw + 1)
          .slice(0, 6)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(el.getBoundingClientRect().right)}`);
      });
      problems.push(`${key}@${w}: scrollWidth ${m.sw} > ${m.vw}: ${wide.join(" | ")}`);
    }
    if (errors.length) problems.push(`${key}@${w}: console: ${errors.slice(0, 3).join(" / ")}`);
    const file = `${out}${key}-${w}${dark ? "-dark" : ""}.png`;
    await page.screenshot({ path: file, fullPage: !viewportOnly });
    if (!viewportOnly && args.includes("--slices")) {
      const sliceH = w > 800 ? 1600 : 2000;
      for (let y = 0, i = 0; y < m.h; y += sliceH, i++) {
        await page.screenshot({ path: `${out}${key}-${w}${dark ? "-dark" : ""}-s${i}.png`, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(sliceH, m.h - y) } });
      }
    }
    console.log(`${key}@${w}: height ${m.h}px, html ${(m.html / 1024).toFixed(0)} KB -> ${file}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "No overflow or console errors.");
