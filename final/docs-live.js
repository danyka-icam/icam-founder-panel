// PANEL_CONN G4 (2026-08-25) + REV_FLOW (2026-08-25) -- live Hub
// Reviewer/Artifacts wiring for Documents screen. Additive, same pattern as
// panel-live.js/ops-live.js.
//
// Wired (real 1:1 label match only):
//   KPI "Documents"             -> hub/sync-health.objects_on_disk (durable/indexed total)
//   KPI "Manual review required" -> hub/sync-health.review_queue.manual_review_required
//     (REV_FLOW split: CANONICAL_REVIEW + UNKNOWN only, NOT all durable/indexed)
//   KPI "Oldest manual review"  -> hub/sync-health.review_queue.oldest_manual_review_minutes
//   KPI "Unknown classification" -> hub/sync-health.review_queue.unknown_classification
//   Очередь документов (queue-panel) -> review_queue.oldest_5 (already manual-only from backend)
//   attention-docs-panel bullet -> manual_review_required count
// NOT wired here on purpose: "Связность" KPI, lifecycle-panel, recent-panel,
// provenance-panel, type-panel -- no Hub field corresponds to those specific
// labels/graphs without inventing a mapping.
(function () {
  "use strict";
  var HEALTH = "/founder-ui-preview/api/hub/sync-health";

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }
  function shortTitle(t, n) {
    t = String(t || "");
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }
  function ageLabel(minutes) {
    if (minutes == null) return "—";
    var h = Math.floor(minutes / 60);
    var m = Math.round(minutes % 60);
    return h > 0 ? h + "ч " + m + "м" : m + "м";
  }
  function fetchJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    });
  }

  function renderKPIs(health) {
    var rq = health.review_queue || {};
    var kpis = document.querySelectorAll(".doc-kpi");
    kpis.forEach(function (card) {
      var label = card.querySelector("small");
      var strong = card.querySelector("strong");
      if (!label || !strong) return;
      var text = label.textContent.trim();
      if (text === "Documents") {
        strong.textContent = health.objects_on_disk;
      } else if (text === "Manual review required") {
        strong.textContent = rq.manual_review_required;
      } else if (text === "Oldest manual review") {
        strong.textContent = ageLabel(rq.oldest_manual_review_minutes);
      } else if (text === "Unknown classification") {
        strong.textContent = rq.unknown_classification;
      }
    });
  }

  function renderQueue(health) {
    var panel = document.querySelector(".doc-panel.queue-panel");
    var rq = health.review_queue || {};
    var oldest5 = rq.oldest_5;
    if (!panel) return;
    panel.querySelectorAll(".queue-row").forEach(function (el) { el.remove(); });
    var btn = panel.querySelector(".text-link");
    if (!oldest5 || !oldest5.length) {
      var empty = document.createElement("div");
      empty.className = "queue-row";
      empty.innerHTML = '<p><b>Пусто</b><small>нет пунктов, требующих ручного разбора</small></p><span>—</span><time>—</time><em class="state new">OK</em>';
      if (btn) panel.insertBefore(empty, btn);
      return;
    }
    oldest5.forEach(function (r) {
      var ageMin = Math.round((Date.now() - new Date(r.received_at).getTime()) / 60000);
      var row = document.createElement("div");
      row.className = "queue-row";
      row.innerHTML =
        "<p><b>" + esc(shortTitle(r.packet_file || "(inline event)", 42)) + "</b><small>" +
        esc(r.claimed_object_id || "не привязан") + " · " + esc(r.artifact_class || "UNKNOWN") + "</small></p>" +
        "<span>Hub</span><time>" + ageLabel(ageMin) + "</time>" +
        "<em class=\"state " + (r.artifact_class === "CANONICAL_REVIEW" ? "review" : "hold") + "\">" +
        esc(r.artifact_class || "UNKNOWN") + "</em>";
      panel.insertBefore(row, btn);
    });
  }

  function renderAttention(health) {
    var rq = health.review_queue || {};
    var panels = document.querySelectorAll(".doc-panel");
    var target = null;
    panels.forEach(function (p) {
      if (p.textContent.indexOf("Требует внимания") !== -1) target = p;
    });
    if (!target) return;
    var alerts = target.querySelectorAll(".doc-alert");
    var last = alerts[alerts.length - 1];
    if (!last) return;
    var small = last.querySelector("small");
    if (small) {
      small.textContent = rq.manual_review_required + " файлов реально требуют ручного разбора (REV_FLOW: CANONICAL_REVIEW + UNKNOWN только, из " + health.objects_on_disk + " durable/indexed)";
    }
  }

  function init() {
    fetchJSON(HEALTH).then(function (health) {
      renderKPIs(health);
      renderQueue(health);
      renderAttention(health);
    }).catch(function () {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
