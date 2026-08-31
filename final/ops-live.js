// PANEL_CONN G2 (2026-08-25) -- live Orchestrator wiring for Operations screen.
// Additive, same pattern as panel-live.js on Home: replace mock content inside
// the existing card markup once real data arrives, never touch layout/classes,
// never blank a card if a fetch fails.
//
// Wired (real 1:1 label match only):
//   KPI "Активные ходы"      -> observer/summary.routes_active
//   KPI "Требует внимания"   -> observer/metrics.operational.attention_debt
//   Текущая очередь (queue-panel) -> observer/routes (top 5 ACTIVE by priority)
// NOT wired here on purpose: "Очередь"/"Gates"/"За 24 часа" KPIs, runs-panel,
// load-panel, gates-panel, health-panel -- no Orchestrator field corresponds
// to those specific labels without relabeling the shipped card, which the
// handoff explicitly asks not to do without visual review.
(function () {
  "use strict";
  var SUMMARY = "/founder-ui-preview/api/observer/summary";
  var METRICS = "/founder-ui-preview/api/observer/metrics";
  var ROUTES = "/founder-ui-preview/api/observer/routes";

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }
  function shortTitle(t, n) {
    t = String(t || "");
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }
  function fetchJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    });
  }

  function renderKPIs(summary, metrics) {
    var kpis = document.querySelectorAll(".ops-kpi");
    kpis.forEach(function (card) {
      var label = card.querySelector("small");
      if (!label) return;
      var strong = card.querySelector("strong");
      if (!strong) return;
      var text = label.textContent.trim();
      if (text === "Активные ходы" && summary) {
        strong.textContent = summary.routes_active;
      } else if (text === "Требует внимания" && metrics) {
        var debt = metrics.operational && metrics.operational.attention_debt;
        if (debt) strong.textContent = debt.value;
      }
    });
  }

  function renderQueue(routes) {
    var panel = document.querySelector(".queue-panel");
    if (!panel || !routes || !routes.length) return;
    var active = routes.filter(function (r) { return r.status === "ACTIVE"; });
    active.sort(function (a, b) {
      return String(a.priority || "").localeCompare(String(b.priority || ""));
    });
    var rows = active.slice(0, 5);
    var oldRows = panel.querySelectorAll(".queue-row");
    oldRows.forEach(function (el) { el.remove(); });
    var head = panel.querySelector(".queue-head");
    var btn = panel.querySelector(".text-link");
    rows.forEach(function (r, i) {
      var row = document.createElement("div");
      row.className = "queue-row";
      row.innerHTML =
        "<i>" + (i + 1) + "</i><b>" + esc(r.area || "—") + "</b>" +
        "<p>" + esc(shortTitle(r.next_move || r.title, 70)) + "</p>" +
        "<span>" + esc(r.ball_owner || "—") + "</span>" +
        "<em class=\"state live\">live</em>";
      if (btn) panel.insertBefore(row, btn);
      else head.insertAdjacentElement("afterend", row);
    });
  }

  function init() {
    var s = fetchJSON(SUMMARY).then(function (r) { return r.summary; }).catch(function () { return null; });
    var m = fetchJSON(METRICS).then(function (r) { return r.metrics; }).catch(function () { return null; });
    var r = fetchJSON(ROUTES).then(function (r) { return r.routes; }).catch(function () { return null; });
    Promise.all([s, m, r]).then(function (res) {
      renderKPIs(res[0], res[1]);
      renderQueue(res[2]);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
