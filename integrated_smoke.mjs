// FOUNDER_PANEL_V2_INTEGRATED_SMOKE
//
// Goes past "the page loaded": drives the real v2 panel in a real browser and
// asserts that each G19 projection actually rendered live server state, and
// that failure/degraded modes stay honest.
//
// Six passes:
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
//   6. PERSONAL TWIN — a live fixture's commitment/seal reaches the screen;
//      a simulated Twin outage shows honest OFFLINE/UNAVAILABLE, never a
//      fallback to the last healthy state; needs_confirmation>0 shows a
//      waiting state without issuing any write; no prohibited prediction
//      data (probabilities/ranked choices/hidden payload) and no confirm/
//      ingest write route or the Twin's localhost port appear in the client.
//
// Read-only throughout. Endpoint failures in pass 2/5c/6b are simulated in
// the browser (page.route -> abort), so no live service is ever taken down.
// The POST probes in pass 3/5 send no body and are expected to be refused at
// the proxy boundary; they assert that writes are blocked, they do not write.
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
  atlas: { nav: "atlas", endpoint: API + "/atlas-state", expect: ["ATLAS", "частично объявленное состояние"] },
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
  record(1, "foundation current readiness is source-backed",
    /Общий статус\s*источник сообщает READY/i.test(fnd) &&
    /Осиротевшие расписки\s*0/i.test(fnd) &&
    /Исключённые self-test расписки\s*1/i.test(fnd),
    "READY only with production orphan=0; evidence-backed self-test exclusion remains visible");

  const atlas = await textOfPage(page, "atlas");
  record(1, "ATLAS Gate 2 live canonical projection",
    /частично объявленное состояние/i.test(atlas) &&
    /aiclavis-atlas-state/.test(atlas) &&
    /FOUNDER_READ_ONLY_SANITIZED_V1/.test(atlas) &&
    !/NO_ATLAS_STATE_SOURCE/.test(atlas),
    "canonical authority + sanitized Founder projection");

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
console.log("\n=== PASS 5: FOUNDER RADAR / MARKET SOURCES — projection + boundary ===");
{
  const RADAR_EP = "/founder-ui-preview/api/radar";
  const SIGNALS_EP = "/founder-ui-preview/api/signals";
  const FIELD_EP = "/founder-ui-preview/api/signals/field-movement";
  const DIAG_EP = "/founder-ui-preview/api/signals/diagnostics";

  // 5a: Founder Radar is the current Signals surface. A field signal must
  // reach the Radar card + inspector with its source-bounded context.
  {
    const TITLE = "SMOKE-RADAR-FIELD-TITLE";
    const WHY = "SMOKE-RADAR-FIELD-WHY";
    const BRANCH = "Smoke Radar Branch";
    const page = await newPage(browser);
    await page.route("**" + RADAR_EP + "**", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          schema: "aiclavis.founder-radar.v0.2", generated_at: new Date().toISOString(), read_only: true,
          attention: [], opportunities: [], waiting: [], upcoming: [], predictions: [],
          field: {
            source_coverage: { ok_count: 11, total_sources: 12 },
            signals: [{
              radar_id: "radar-smoke-field-1", signal_id: "signal-smoke-field-1",
              title: TITLE, status: "ACT", relevance_score: 88, why: WHY,
              context: { world: "Коммерческий ATLAS", line: "Рынок", branch: BRANCH },
              source_ref: { kind: "market_signal", signal_id: "signal-smoke-field-1" },
              evidence: [{ kind: "fixture-1" }, { kind: "fixture-2" }]
            }]
          },
          atlas_learning: [], investment: { available: false }, reputation: []
        })
      });
    });
    await page.goto(BASE + "#signals", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const txt = await textOfPage(page, "signals");
    record(5, "Founder Radar field signal reaches the current Signals surface",
      txt.includes(TITLE) && txt.includes(WHY) && txt.includes(BRANCH) && /Покрытие Scanner: 11 из 12/.test(txt),
      txt.includes(TITLE) ? "signal rendered" : "signal MISSING");

    const inspector = await page.evaluate(() => {
      const el = document.querySelector('[data-radar-inspector]');
      return el ? el.innerText : "";
    });
    record(5, "Radar inspector preserves source and evidence boundary",
      inspector.includes(TITLE) && inspector.includes(WHY) && /Market Scanner/.test(inspector) && /2 свидетельств/.test(inspector),
      /Market Scanner/.test(inspector) ? "source/evidence shown" : "source/evidence MISSING");

    const stewardContext = await page.evaluate(() => {
      const btn = document.querySelector('[data-radar-inspector] [data-cc-steward-context]');
      return btn ? btn.getAttribute("data-cc-steward-context") : "";
    });
    record(5, "Radar signal exposes exact bounded Steward context",
      stewardContext.includes(TITLE) && stewardContext.includes("signal-smoke-field-1") && stewardContext.includes(BRANCH),
      stewardContext ? "context present" : "context MISSING");
    await page.close();
  }

  // 5b: empty field is explicit and keeps source coverage separate.
  {
    const page = await newPage(browser);
    await page.route("**" + RADAR_EP + "**", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          schema: "aiclavis.founder-radar.v0.2", generated_at: new Date().toISOString(), read_only: true,
          attention: [], opportunities: [], waiting: [], upcoming: [], predictions: [],
          field: { source_coverage: { ok_count: 12, total_sources: 12 }, signals: [] },
          atlas_learning: [], investment: { available: false }, reputation: []
        })
      });
    });
    await page.goto(BASE + "#signals", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const txt = await textOfPage(page, "signals");
    record(5, "empty Radar field is explicit, not a silent blank",
      /Новых отобранных внешних сигналов нет/.test(txt) && /Покрытие Scanner: 12 из 12/.test(txt),
      /Новых отобранных внешних сигналов нет/.test(txt) ? "explicit empty state" : "empty state MISSING");
    await page.close();
  }

  // 5c: Radar outage must fail closed; no stale signal cards survive.
  {
    const page = await newPage(browser, { failEndpoint: RADAR_EP });
    await page.goto(BASE + "#signals", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const txt = await textOfPage(page, "signals");
    record(5, "Founder Radar outage is shown as unavailable",
      /Радар недоступен|Источник радара недоступен/.test(txt),
      /Радар недоступен|Источник радара недоступен/.test(txt) ? "reported unavailable" : "SILENT — stale/fake data risk");
    await page.close();
  }

  // 5d: Market Scanner remains read-only from the browser. Ingest is absent.
  {
    const page = await newPage(browser);
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    for (const method of ["GET", "POST"]) {
      const status = await page.evaluate(async (args) => {
        try { const r = await fetch(args.u, { method: args.m }); return r.status; }
        catch (e) { return "blocked:" + e.message; }
      }, { u: SIGNALS_EP + "/ingest", m: method });
      record(5, method + " /signals/ingest -> 404", status === 404, "status " + status);
    }
    const postStatus = await page.evaluate(async (u) => {
      try { const r = await fetch(u, { method: "POST" }); return r.status; }
      catch (e) { return "blocked:" + e.message; }
    }, SIGNALS_EP);
    record(5, "POST /signals -> 403", postStatus === 403, "status " + postStatus);
    await page.close();
  }

  // 5e: raw Market Scanner / Field Movement remain observable as read sources
  // in Diagnostics; they are not a second competing Signals-page UI.
  {
    const DIAG_COVERAGE_TAG = "SMOKE-FIXTURE-COVERAGE-STATUS";
    const page = await newPage(browser);
    await page.route("**" + FIELD_EP + "**", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          status: "AVAILABLE", observed_at: new Date().toISOString(),
          axes: [{ axis: "world-model", label: "World models", trend: "up2", current_weight: 200, prior_weight: 90 }]
        })
      });
    });
    await page.route("**" + DIAG_EP + "**", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          flow_activated: false, observed_at: new Date().toISOString(),
          scanner: { last_run_at: new Date().toISOString(), freshness_state: "FRESH", age_seconds: 120, run_summary: null },
          source_coverage: { status: DIAG_COVERAGE_TAG, reason: null, ok_count: 9, total_sources: 12, failing: [] },
          enrichment: { stored_signals: 9, enriched_signals: 9, pending: 0 },
          ingest: { key_configured: true, patch_implemented: false }
        })
      });
    });
    await page.goto(BASE + "#diagnostics", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const reads = await page.evaluate(() => {
      const el = document.querySelector('[data-x-read-times]');
      return el ? el.innerText : "";
    });
    record(5, "Field Movement remains visible as a successful read source in Diagnostics",
      /Движение поля/.test(reads) && /ответ получен/.test(reads),
      /Движение поля/.test(reads) ? "read source shown" : "read source MISSING");

    const diagText = await page.evaluate(() => {
      const el = document.querySelector('[data-scan="coverage"]');
      return el ? el.textContent : null;
    });
    record(5, "scanner-diagnostics coverage reaches the Diagnostics DOM",
      !!diagText && diagText.includes(DIAG_COVERAGE_TAG),
      "data-scan=coverage textContent: " + JSON.stringify(diagText));
    await page.close();
  }

  // 5f: shipped client remains free of direct write verbs / ingest secrets.
  {
    const js = await (await fetch(BASE + "live.js")).text();
    record(5, "no write verbs in client (Radar/market boundary)",
      !/method:\s*["'](POST|PATCH|PUT|DELETE)/.test(js));
    record(5, "no ingest key/secret literal in client",
      !/x-atlas-signals-key/i.test(js) && !/ATLAS_SIGNALS_KEY_FILE/i.test(js) && !/sk-ant-/i.test(js));
  }
}

// ---------------------------------------------------------------- pass 6
console.log("\n=== PASS 6: PERSONAL TWIN — safe projection + boundary ===");
{
  const TWIN_EP = "/founder-ui-preview/api/panel/twin";
  const KNOWN_COMMITMENT = "smokefixturecommitmentabc123";

  // 6a: live fixture with a real commitment/seal reaches the screen.
  {
    const page = await newPage(browser);
    await page.route("**" + TWIN_EP + "**", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          source_status: "LIVE",
          program_object: { object_id: "FND-005", declared_status: "PTC_R0_SERVER_RUNTIME" },
          runtime_health: "OK", mode: "WARM_START", clones_active: 8,
          prospective_scored_n: 0, current_prediction: "SEALED",
          current_commitment: KNOWN_COMMITMENT, seal_created_at: new Date().toISOString(),
          last_outcome: null, needs_confirmation: 0, best_predictor: null,
          safety_invariants_status: { pre_action_seal: "ENFORCED" },
          ss001_transfer_boundary: "ENGINEERING_METHODOLOGY_ONLY__NO_EMPIRICAL_TRANSFER",
          observed_at: new Date().toISOString(),
        }),
      });
    });
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const txt = await textOfPage(page, "digital-twin");
    // Rendered via the shared cut() helper, which truncates to n-1 chars plus
    // an ellipsis -- check a prefix short enough to survive that, not an
    // exact-length slice that assumes truncation behaves like a plain slice.
    const commitmentPrefix = KNOWN_COMMITMENT.slice(0, 20);
    record(6, "live Twin fixture reaches the Twin page",
      txt.includes(commitmentPrefix) && /SEALED/i.test(txt),
      txt.includes(commitmentPrefix) ? "commitment shown" : "commitment MISSING");

    // Regression guard for the 2026-09-05 cleanup: the DT page used to carry
    // a static hero block claiming "СЕРВИС НЕ ПОДКЛЮЧЁН" regardless of
    // real Twin state. With a LIVE fixture active, that stale claim must not
    // appear anywhere on the page -- deliberately not pinning what the new
    // copy says, only that the old contradiction is gone.
    record(6, "no stale 'СЕРВИС НЕ ПОДКЛЮЧЁН' claim on DT page when Twin is LIVE",
      !/СЕРВИС НЕ ПОДКЛЮЧЁН/i.test(txt),
      /СЕРВИС НЕ ПОДКЛЮЧЁН/i.test(txt) ? "STALE CLAIM STILL PRESENT" : "gone");
    await page.close();
  }

  // 6b: Twin unreachable -> OFFLINE/UNAVAILABLE, no fallback to old healthy
  // state. Simulated by aborting the route, same pattern as pass 2.
  {
    const page = await newPage(browser, { failEndpoint: TWIN_EP });
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const txt = await textOfPage(page, "digital-twin");
    record(6, "Twin outage shows honest OFFLINE/UNAVAILABLE, not stale data",
      /OFFLINE|UNAVAILABLE|НЕДОСТУПЕН/i.test(txt),
      /OFFLINE|UNAVAILABLE|НЕДОСТУПЕН/i.test(txt) ? "reported unavailable" : "SILENT — stale/fake data risk");
    await page.close();
  }

  // 6c: needs_confirmation > 0 shows a waiting state but performs no write.
  {
    const page = await newPage(browser);
    let postSeen = false;
    page.on("request", (req) => { if (req.method() !== "GET" && req.url().includes("/panel/twin")) postSeen = true; });
    await page.route("**" + TWIN_EP + "**", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          source_status: "LIVE",
          program_object: { object_id: "FND-005", declared_status: "PTC_R0_SERVER_RUNTIME" },
          runtime_health: "OK", mode: "LEARNING", clones_active: 8,
          prospective_scored_n: 3, current_prediction: "NO_LIVE_SEAL",
          current_commitment: null, seal_created_at: null,
          last_outcome: "RESOLVED_AUTO", needs_confirmation: 2, best_predictor: null,
          safety_invariants_status: { pre_action_seal: "ENFORCED" },
          ss001_transfer_boundary: "ENGINEERING_METHODOLOGY_ONLY__NO_EMPIRICAL_TRANSFER",
          observed_at: new Date().toISOString(),
        }),
      });
    });
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    const txt = await textOfPage(page, "digital-twin");
    record(6, "needs_confirmation fixture shows waiting state, no write issued",
      /ожидает подтверждения/i.test(txt) && !postSeen,
      (/ожидает подтверждения/i.test(txt) ? "waiting state shown" : "waiting state MISSING") +
      (postSeen ? "; WRITE CALL DETECTED" : ""));
    await page.close();
  }

  // 6d: prohibited prediction data absent from the shipped client bundle.
  {
    const js = await (await fetch(BASE + "live.js")).text();
    const html = await (await fetch(BASE)).text();
    const forbidden = /clone_probabilit|ranked_candidate|hidden_payload|predicted_choice/i;
    record(6, "no prohibited Twin prediction markers in client HTML/JS",
      !forbidden.test(js) && !forbidden.test(html));
    record(6, "no Twin confirm/ingest write route or port literal in client",
      !/confirm-outcome|ingest-founder-event|record-exposure/i.test(js) && !/8804/.test(js));
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
