// FOUNDER_PANEL_V2_INTEGRATED_SMOKE
//
// Goes past "the page loaded": drives the real v2 panel in a real browser and
// asserts that each G19 projection actually rendered live server state, and
// that failure/degraded modes stay honest.
//
// Three passes:
//   1. LIVE     — every source reachable; each page must render its projection.
//   2. DEGRADED — one projection endpoint forced to fail; that page must say so
//                 and must NOT fall back to looking healthy or empty.
//   3. BOUNDARY — writes are refused and market signals stay disconnected.
//
// Read-only throughout. Endpoint failures in pass 2 are simulated in the
// browser (page.route -> abort), so no live service is ever taken down. The two
// POST probes in pass 3 send no body and are expected to be refused at the
// proxy boundary; they assert that writes are blocked, they do not write.
//
// Usage:
//   PANEL_URL=<url-of-v2-panel> node integrated_smoke.mjs
//
// PANEL_URL must point at a running v2 panel whose /founder-ui-preview/api
// projections are reachable. The panel is not publicly exposed, so the URL is
// environment-specific and deliberately not hardcoded here. Exit code is 0 only
// when every check passes.

import { chromium } from "playwright";

const BASE = process.env.PANEL_URL;
if (!BASE) {
  console.error("PANEL_URL not set — point it at a running v2 panel, e.g.");
  console.error("  PANEL_URL=http://<host>/founder-ui-preview/v2/ node integrated_smoke.mjs");
  process.exit(2);
}
const API = "/founder-ui-preview/api";

const PAGES = {
  operations: { nav: "operations", endpoint: API + "/panel/operations", expect: ["Операционная проекция"] },
  brazilportal: { nav: "brazilportal", endpoint: API + "/panel/brazilportal", expect: ["BrazilPortal", "Объявленный статус", "Спроецированный статус"] },
  foundation: { nav: "foundation", endpoint: API + "/panel/foundation", expect: ["Готовность основания"] },
  atlas: { nav: "atlas", endpoint: API + "/panel/atlas", expect: ["Атлас"] },
  "digital-twin": { nav: "digital-twin", endpoint: API + "/panel/twin", expect: ["Twin"] },
};

const results = [];
function record(pass, name, ok, detail) {
  results.push({ pass, name, ok, detail });
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
}

async function textOfPage(page, key) {
  return page.evaluate((k) => {
    const el = document.querySelector(`[data-page-panel="${k}"]`);
    if (!el) return "";
    // the page is a tab; read its text whether or not it is the visible one
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }, key);
}

async function newPage(browser, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  if (opts.failEndpoint) {
    await page.route("**" + opts.failEndpoint + "**", (r) => r.abort("failed"));
  }
  page._errors = errors;
  return page;
}

const browser = await chromium.launch();

// ---------------------------------------------------------------- pass 1
console.log("\n=== PASS 1: LIVE — every projection renders real state ===");
{
  const page = await newPage(browser);
  const resp = await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  record(1, "page loads", resp && resp.status() === 200, "HTTP " + (resp && resp.status()));
  await page.waitForTimeout(2500);

  for (const [key, cfg] of Object.entries(PAGES)) {
    const txt = await textOfPage(page, key);
    const missing = cfg.expect.filter((e) => !txt.includes(e));
    const substantive = txt.length > 120;
    record(1, `${key}: rendered`, missing.length === 0 && substantive,
      missing.length ? "missing: " + missing.join(", ") : `${txt.length} chars`);
  }

  // honest-state assertions on real current data
  const fnd = await textOfPage(page, "foundation");
  // A bare /READY/ match is not enough: the page legitimately contains the
  // sentence "Зелёный READY не показывается". Assert the aggregate verdict and
  // the blocking evidence instead of keyword-hunting.
  const claimsReady = /Общий статус\s*READY/i.test(fnd);
  record(1, "foundation shows DEGRADED not green",
    /Готовность основания\s*—\s*DEGRADED/i.test(fnd) && !claimsReady && fnd.includes("orphan receipt"),
    fnd.includes("orphan receipt") ? "DEGRADED + orphan receipt shown as blocker" : "no orphan mention");

  const bp = await textOfPage(page, "brazilportal");
  record(1, "brazilportal keeps both statuses separate",
    bp.includes("Объявленный статус") && bp.includes("Спроецированный статус"));

  const ops = await textOfPage(page, "operations");
  record(1, "operations marks unprovable fields unavailable",
    /Недоступно/i.test(ops), "ball_owner/factual_result");

  record(1, "no console/page errors", page._errors.length === 0,
    page._errors.slice(0, 2).join(" | "));
  await page.close();
}

// ---------------------------------------------------------------- pass 2
console.log("\n=== PASS 2: DEGRADED — a dead source must not look healthy ===");
for (const [key, cfg] of Object.entries(PAGES)) {
  const page = await newPage(browser, { failEndpoint: cfg.endpoint });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  const txt = await textOfPage(page, key);
  const saysUnavailable = /не ответил|недоступ|источник|ошибк/i.test(txt);
  const looksFalselyHealthy = /\bREADY\b|\bPASS\b/.test(txt) && !saysUnavailable;
  record(2, `${key}: dead source reported`, saysUnavailable && !looksFalselyHealthy,
    saysUnavailable ? "states unavailability" : "SILENT — did not report failure");
  await page.close();
}

// ---------------------------------------------------------------- pass 3
console.log("\n=== PASS 3: BOUNDARY — writes refused, signals disconnected ===");
{
  const page = await newPage(browser);
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  for (const p of ["/panel/operations", "/panel/foundation"]) {
    const status = await page.evaluate(async (u) => {
      try { const r = await fetch(u, { method: "POST" }); return r.status; }
      catch (e) { return "blocked:" + e.message; }
    }, API + p);
    record(3, `POST ${p} refused`, status === 403 || String(status).startsWith("blocked"), "status " + status);
  }

  const js = await (await fetch(BASE + "live.js")).text();
  record(3, "market signals not wired",
    !/API\s*\+\s*["']\/panel\/signals|signals\/ingest/.test(js));
  record(3, "no write verbs in client",
    !/method:\s*["'](POST|PATCH|PUT|DELETE)/.test(js));
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log("\n" + "=".repeat(60));
console.log(`INTEGRATED SMOKE: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("\nFAILED:");
  failed.forEach((f) => console.log(`  pass ${f.pass} — ${f.name}: ${f.detail || ""}`));
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
