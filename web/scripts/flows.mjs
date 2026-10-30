// Exercises the interactive flows on a running build and screenshots each result.
// Usage: node scripts/flows.mjs [baseUrl]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://localhost:3417").replace(/\/$/, "");
const out = fileURLToPath(new URL("../.shots/", import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const fail = (m) => {
  errors.push(m);
  console.log("FAIL", m);
};

for (const w of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));

  // Mandate: loosen one clause, tighten another, then try to sign.
  await page.goto(`${base}/mandate`, { waitUntil: "networkidle" });
  await page.locator("#f-maxNotionalUsd").fill("120");
  await page.locator("#f-maxStopBps").fill("500");
  await page.waitForTimeout(900);
  const form = page.locator(".amend").first();
  if (!(await form.getByText("looser").count())) fail("mandate: looser tag missing");
  if (!(await form.getByText("Needs the owner's signature").count())) fail("mandate: owner part missing");
  await form.getByRole("button", { name: "Sign with owner wallet" }).click();
  await page.waitForTimeout(300);
  if (!(await page.getByText("Wallet signing arrives with the mainnet vault.").count())) fail("mandate: sign error not shown");
  await page.locator("#amend").scrollIntoViewIfNeeded();
  await page.locator(".editor").screenshot({ path: `${out}flow-mandate-${w}.png` });

  // Desk: a stricter proposal, a looser one, and citations.
  await page.goto(`${base}/desk`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Be more careful today" }).click();
  await page.locator(".amend").first().waitFor({ timeout: 10000 });
  if (!(await page.getByText("Avow can apply this itself").count())) fail("desk: stricter part missing");
  await page.getByRole("button", { name: "Ask Avow to apply it" }).click();
  await page.getByText("Agent-side tightening arrives with the mainnet vault.").waitFor({ timeout: 5000 }).catch(() => fail("desk: tighten stub message missing"));
  await page.getByRole("button", { name: "Trade bigger" }).click();
  await page.waitForTimeout(800);
  if (!(await page.getByText("Needs the owner's signature").count())) fail("desk: looser part missing");
  await page.getByRole("button", { name: "What is open right now?" }).click();
  await page.waitForTimeout(800);
  if ((await page.locator(".cites a").count()) < 2) fail("desk: citations missing");
  await page.screenshot({ path: `${out}flow-desk-${w}.png`, fullPage: true });

  // Notes filter and journal filter.
  await page.goto(`${base}/notes`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Void/ }).click();
  const n = await page.locator(".stub").count();
  if (n !== 2) fail(`notes: void filter shows ${n}`);
  await page.goto(`${base}/journal`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Blocked by a clause/ }).click();
  const b = await page.locator(".jrow").count();
  if (b < 1) fail("journal: blocked filter empty");

  // Mobile menu.
  if (w < 800) {
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Menu" }).click();
    await page.screenshot({ path: `${out}flow-menu-${w}.png` });
    await page.locator("#sheet").getByRole("link", { name: /Business/ }).click();
    await page.waitForURL(/business/);
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? `Problems:\n${errors.join("\n")}` : "All flows passed.");
