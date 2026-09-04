// FOUNDER_PANEL_V2_INTEGRATED_SMOKE
//
// Goes past "the page loaded": drives the real v2 panel in a real browser and
// asserts that each G19 projection actually rendered live server state, and
// that failure/degraded modes stay honest.
//
// Five passes:
//   1. LIVE     — every source reachable; each page must render its projection.
//   2. DEGRADED — one projection endpoint forced to fail; that page must say so
//                 and must NOT fall back to looking healthy or empty.
//   3. BOUNDARY — writes are refused and market signals ingest stays unreachable.
//   4. OWNER RENDER — a known ball_owner in the Operations response must
//      actually reach the rendered screen text.
//   5. MARKET SIGNALS — activation contract (NOT_ACTIVATED / ACTIVATED_EMPTY /
//      ACTIVATED+populated) each render distinctly and honestly; enrichment
//      fields reach the screen; an aborted source shows unavailable, not
//      stale/fake data; ingest stays 404/403'd; no ingest secret in the client.
//
// Read-only throughout. Endpoint failures in pass 2/5c are simulated in the
// browser (page.route -> abort), so no live service is ever taken down. The
// POST probes in pass 3/5 send no body and are expected to be refused at the
// proxy boundary; they assert that writes are blocked, they do not write.
// Pass 4 and 5a/5b intercept the real endpoint response in the browser and
// substitute a fixture; nothing is written to the database in any pass.
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

  // Market Scanner QA passed 2026-09-04, GET /signals is wired. This check
  // must survive FLOW_ACTIVATED flipping to true later -- so it reads the
  // real activation_state from the API instead of hardcoding an expectation,
  // and asserts whichever of the three states is honestly true right now.
  const sig = await textOfPage(page, "signals");
  let signalsApiState = null;
  try {
    signalsApiState = await page.evaluate(async (u) => {
      const r = await fetch(u);
      return (await r.json()).activation_state;
    }, API + "/signals");
  } catch (e) { /* leave null -- handled below as a failure */ }

  const stateChecks = {
    NOT_ACTIVATED: () => /не активирован/i.test(sig) && !/Внешний источник возможностей ещё не подключён/i.test(sig),
    ACTIVATED_EMPTY: () => /активен, новых сигналов нет/i.test(sig),
    ACTIVATED: () => !/не активирован/i.test(sig) && !/^\s*$/.test(sig),
  };
  const checkFn = stateChecks[signalsApiState];
  record(1, `market signals UI matches real activation_state (${signalsApiState ?? "API UNREACHABLE"})`,
    !!checkFn && checkFn(),
    checkFn ? (checkFn() ? "UI matches API state" : "UI text does not match API's " + signalsApiState) :
      "activation_state missing/unrecognized from /api/signals");

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
  // Market Scanner QA passed 2026-09-04: the client now reads GET /signals
  // (read-only, no ingest key reaches the browser). What must stay true is
  // narrower than "absent" -- no ingest path in the client, ever.
  record(3, "no ingest path wired into client",
    !/signals\/ingest/.test(js));
  record(3, "no write verbs in client",
    !/method:\s*["'](POST|PATCH|PUT|DELETE)/.test(js));
  await page.close();
}

// ---------------------------------------------------------------- pass 4
console.log("\n=== PASS 4: OWNER RENDER — a known ball_owner must reach the screen ===");
{
  // Browser-side fixture only: the real /panel/operations response is
  // intercepted and replaced before it reaches the page. Nothing is written
  // to the database, and no other route is touched.
  const KNOWN_OWNER = "CONTRACT-TEST-HOLDER";
  const page = await newPage(browser);
  await page.route("**" + PAGES.operations.endpoint + "**", async (route) => {
    const real = await route.fetch();
    const body = await real.json();
    const fixtureOps = [
      {
        commitment_key: "SMOKE-FIXTURE-OWNER-1",
        object_id: "H008",
        title: "Owner render smoke fixture (browser-side only, not persisted)",
        status: "OPEN",
        opened_at: body.observed_at,
        updated_at: body.observed_at,
        activation_condition: null,
        ball_owner: KNOWN_OWNER,
        object_level_blockers: [],
      },
      ...(Array.isArray(body.operations) ? body.operations : []),
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...body,
        source_status: "AVAILABLE",
        unavailable_fields: (body.unavailable_fields || []).filter((f) => f !== "ball_owner"),
        counts: { ...(body.counts || {}), total: (body.counts?.total || 0) + 1, open: (body.counts?.open || 0) + 1 },
        operations: fixtureOps,
      }),
    });
  });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  const txt = await textOfPage(page, "operations");
  record(4, "known ball_owner text appears on screen", txt.includes(KNOWN_OWNER),
    txt.includes(KNOWN_OWNER) ? "found" : "NOT FOUND — owner render regression");
  record(4, "stale hardcoded 'owner не заполняется источником' text is gone",
    !/owner не заполняется источником/i.test(txt));
  await page.close();
}

// ---------------------------------------------------------------- pass 5
console.log("\n=== PASS 5: MARKET SIGNALS — activation contract + boundary ===");
{
  const SIGNALS_EP = "/founder-ui-preview/api/signals";
  const KNOWN_ENTITY = "SMOKE-FIXTURE-ENTITY";
  const KNOWN_SUMMARY = "SMOKE-FIXTURE-SUMMARY-RU";

  // 5a: activated + populated, with enrichment — the FULL market card
  // contract must reach the rendered screen text (base fields AND the
  // enrichment sub-object), and opening the source/evidence drawer must show
  // the real source url and evidence items from the fixture.
  {
    const KNOWN_TYPE = "smoke-fixture-signal-type";
    const KNOWN_TITLE = "SMOKE-FIXTURE-TITLE-TEXT";
    const KNOWN_WHY = "SMOKE-FIXTURE-WHY-RU-TEXT";
    const KNOWN_AXIS = "smoke-fixture-axis-alpha";
    const KNOWN_SOURCE_NAME = "smoke-fixture-source-name";
    const KNOWN_SOURCE_URL = "https://example.invalid/smoke-fixture-evidence-source";
    const KNOWN_STATUS = "smoke-fixture-status-watch";
    const KNOWN_EVIDENCE_1 = "smoke-fixture-evidence-item-one";
    const KNOWN_EVIDENCE_2 = "smoke-fixture-evidence-item-two";
    const RELEVANCE = 77;

    const page = await newPage(browser);
    await page.route("**" + SIGNALS_EP + "**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          activation_state: "ACTIVATED",
          source_status: "AVAILABLE",
          flow_activated: true,
          observed_at: new Date().toISOString(),
          degraded_reason: null,
          counts: { returned: 1, stored_total: 1 },
          source_coverage: { status: "OK", reason: null, ok_count: 12, total_sources: 12, failing: [] },
          signals: [{
            schema: "atlas.market-signal.v1",
            signal_id: "mkt-smoke-fixture-1",
            observed_at: new Date().toISOString(),
            entity: KNOWN_ENTITY,
            signal_type: KNOWN_TYPE,
            title: KNOWN_TITLE,
            axis: [KNOWN_AXIS, "agents"],
            relevance_score: RELEVANCE,
            confidence: "high",
            source: { name: KNOWN_SOURCE_NAME, url: KNOWN_SOURCE_URL },
            evidence: [KNOWN_EVIDENCE_1, KNOWN_EVIDENCE_2],
            status: KNOWN_STATUS,
            enrichment: {
              summary_ru: KNOWN_SUMMARY,
              why_it_matters_ru: KNOWN_WHY,
              architecture_proximity: 60,
              market_significance: 40,
              architecture_convergence: true,
              recommended_action: "watch",
            },
          }],
        }),
      });
    });
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const txt = await textOfPage(page, "signals");
    const contractFields = {
      entity: KNOWN_ENTITY, type: KNOWN_TYPE, relevance: String(RELEVANCE),
      title: KNOWN_TITLE, summary_ru: KNOWN_SUMMARY, why_it_matters_ru: KNOWN_WHY,
      axes: KNOWN_AXIS, evidence_count: "evidence: 2", source: KNOWN_SOURCE_NAME,
      status: KNOWN_STATUS,
    };
    const missing = Object.entries(contractFields).filter(([, v]) => !txt.includes(v)).map(([k]) => k);
    record(5, "full market card contract reaches the screen",
      missing.length === 0,
      missing.length ? "missing: " + missing.join(", ") : "all 10 contract fields present");

    // Open the drawer and verify the real source url + evidence items show —
    // not summary text, the actual provenance the fixture carried.
    const opened = await page.evaluate(() => {
      const btn = document.querySelector('[data-market-card] [data-drawer-toggle]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    await page.waitForTimeout(300);
    const drawerTxt = opened ? await page.evaluate(() => {
      const el = document.querySelector('[data-market-card] [data-drawer-body]');
      return el ? el.innerText : "";
    }) : "";
    record(5, "source/evidence drawer opens and shows real provenance",
      opened && drawerTxt.includes(KNOWN_SOURCE_URL) && drawerTxt.includes(KNOWN_EVIDENCE_1) && drawerTxt.includes(KNOWN_EVIDENCE_2),
      !opened ? "drawer toggle not found" :
        (drawerTxt.includes(KNOWN_SOURCE_URL) ? "source url ok" : "source url MISSING") + ", " +
        (drawerTxt.includes(KNOWN_EVIDENCE_1) && drawerTxt.includes(KNOWN_EVIDENCE_2) ? "evidence items ok" : "evidence items MISSING"));

    await page.close();
  }

  // 5b: activated but empty — must say "активен, новых сигналов нет", not the
  // pre-activation copy and not a silent blank.
  {
    const page = await newPage(browser);
    await page.route("**" + SIGNALS_EP + "**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          activation_state: "ACTIVATED_EMPTY",
          source_status: "EMPTY",
          flow_activated: true,
          observed_at: new Date().toISOString(),
          degraded_reason: "Поток активен, новых сигналов нет.",
          counts: { returned: 0, stored_total: 0 },
          source_coverage: { status: "OK", reason: null, ok_count: 12, total_sources: 12, failing: [] },
          signals: [],
        }),
      });
    });
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const txt = await textOfPage(page, "signals");
    record(5, "activated+empty shows 'активен, новых сигналов нет'",
      /активен, новых сигналов нет|Поток активен/i.test(txt),
      /активен, новых сигналов нет|Поток активен/i.test(txt) ? "found" : "NOT FOUND");
    await page.close();
  }

  // 5c: source aborted entirely — must say unavailable, never keep showing
  // whatever the previous successful fetch happened to render.
  {
    const page = await newPage(browser, { failEndpoint: SIGNALS_EP });
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const txt = await textOfPage(page, "signals");
    record(5, "aborted market signals source shown as unavailable",
      /Market Scanner недоступен|источник не ответил/i.test(txt),
      /Market Scanner недоступен|источник не ответил/i.test(txt) ? "reported unavailable" : "SILENT — old/fake data risk");
  }

  // 5d/5e/5f: boundary — GET/POST /ingest -> 404, POST /signals -> 403.
  {
    const page = await newPage(browser);
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    for (const method of ["GET", "POST"]) {
      const status = await page.evaluate(async (args) => {
        try { const r = await fetch(args.u, { method: args.m }); return r.status; }
        catch (e) { return "blocked:" + e.message; }
      }, { u: SIGNALS_EP + "/ingest", m: method });
      record(5, `${method} /signals/ingest -> 404`, status === 404, "status " + status);
    }
    const postStatus = await page.evaluate(async (u) => {
      try { const r = await fetch(u, { method: "POST" }); return r.status; }
      catch (e) { return "blocked:" + e.message; }
    }, SIGNALS_EP);
    record(5, "POST /signals -> 403", postStatus === 403, "status " + postStatus);
    await page.close();
  }

  // 5f2: a fixture field-movement axis and a fixture scanner-diagnostics
  // value must each reach their real DOM hooks -- not just "no error", an
  // actual positive check that the specific fixture value landed.
  {
    const FM_TREND = "up2";
    const DIAG_COVERAGE_TAG = "SMOKE-FIXTURE-COVERAGE-STATUS";

    const page = await newPage(browser);
    await page.route("**" + API + "/signals/field-movement**", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          status: "AVAILABLE", reason: null, observed_at: new Date().toISOString(),
          axes: [
            { axis: "world-model", label: "World models", trend: FM_TREND, current_weight: 200, prior_weight: 90 },
            { axis: "decision-intelligence", label: "Decision intelligence", trend: null, current_weight: 0, prior_weight: 0 },
            { axis: "simulation", label: "Simulation", trend: null, current_weight: 0, prior_weight: 0 },
            { axis: "external-sensing", label: "External sensing", trend: null, current_weight: 0, prior_weight: 0 },
            { axis: "epistemics", label: "Epistemics", trend: null, current_weight: 0, prior_weight: 0 },
            { axis: "agents", label: "Agents", trend: null, current_weight: 0, prior_weight: 0 },
          ],
        }),
      });
    });
    await page.route("**" + API + "/signals/diagnostics**", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          flow_activated: false, observed_at: new Date().toISOString(),
          scanner: { last_run_at: new Date().toISOString(), freshness_state: "FRESH", age_seconds: 120, run_summary: null },
          source_coverage: { status: DIAG_COVERAGE_TAG, reason: null, ok_count: 9, total_sources: 12, failing: [] },
          enrichment: { stored_signals: 9, enriched_signals: 9, pending: 0 },
          ingest: { key_configured: true, patch_implemented: false },
        }),
      });
    });
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const fmText = await page.evaluate(() => {
      const el = document.querySelector('[data-fm="world-model"]');
      return el ? el.textContent : null;
    });
    record(5, "fixture field-movement axis reaches the DOM",
      fmText === "↑↑", "data-fm=world-model textContent: " + JSON.stringify(fmText));

    const diagText = await page.evaluate(() => {
      const el = document.querySelector('[data-scan="coverage"]');
      return el ? el.textContent : null;
    });
    record(5, "fixture scanner-diagnostics coverage reaches the DOM",
      !!diagText && diagText.includes(DIAG_COVERAGE_TAG),
      "data-scan=coverage textContent: " + JSON.stringify(diagText));

    await page.close();
  }

  // 5g: no write verbs, no ingest secret anywhere in the shipped client.
  {
    const js = await (await fetch(BASE + "live.js")).text();
    record(5, "no write verbs in client (re-check after signals wiring)",
      !/method:\s*["'](POST|PATCH|PUT|DELETE)/.test(js));
    record(5, "no ingest key/secret literal in client",
      !/x-atlas-signals-key/i.test(js) && !/ATLAS_SIGNALS_KEY_FILE/i.test(js) &&
      !/sk-ant-/i.test(js));
  }
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
