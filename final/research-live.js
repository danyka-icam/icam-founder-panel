// PANEL_CONN2 G5 (2026-08-25) -- live Research screen wired to canonical
// Continuity granularity only. No RD1-XX mock entities, no invented
// researcher names, no fabricated roadmap/evidence-score/experiment data --
// those blocks were reframed to an honest "not available" note in the HTML
// itself (per PANEL_CONN2: never fabricate; render not-available instead).
(function () {
  "use strict";
  var OBJECTS = "/founder-ui-preview/api/continuity/objects";
  var RD1 = function (id) { return "/founder-ui-preview/api/continuity/rd1-projection/" + encodeURIComponent(id); };
  var BLOCKERS = "/founder-ui-preview/api/continuity/blockers";

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }
  function shortTitle(t, n) {
    t = String(t || "");
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
  }
  function ageLabel(iso) {
    if (!iso) return "—";
    var minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    var d = Math.floor(minutes / 1440);
    var h = Math.floor((minutes % 1440) / 60);
    if (d > 0) return d + "д " + h + "ч";
    var m = minutes % 60;
    return h > 0 ? h + "ч " + m + "м" : m + "м";
  }
  function fetchJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    });
  }
  function setField(name, value) {
    var el = document.querySelector('[data-f="' + name + '"]');
    if (el) el.textContent = value;
  }

  function init() {
    fetchJSON(OBJECTS).then(function (resp) {
      var items = resp.items || [];
      var ids = items.map(function (o) { return o.object_id; });
      return Promise.all(ids.map(function (id) {
        return fetchJSON(RD1(id)).catch(function () { return { object_id: id, available: false }; });
      })).then(function (projections) {
        var byId = {};
        projections.forEach(function (p) { byId[p.object_id] = p; });
        // Блокеры берём из канонического реестра блокеров, а не выдумываем из статуса.
        return fetchJSON(BLOCKERS).catch(function () { return { items: [] }; })
          .then(function (bl) {
            var open = {};
            ((bl && bl.items) || []).forEach(function (b) {
              if (b.is_test) return;
              if (String(b.status || "").toUpperCase() === "CLEARED") return;
              (open[b.object_id] = open[b.object_id] || []).push(b);
            });
            render(items, byId, open);
          });
      });
    }).catch(function () {});
  }

  function render(items, projById, blockersById) {
    var total = items.length;
    var active = items.filter(function (o) { return /^ACTIVE/.test(o.declared_status || ""); }).length;
    var needsNika = items.filter(function (o) { return o.needs_nika; }).length;
    var parked = items.filter(function (o) { return /PARKED|PREPARING/.test(o.declared_status || ""); }).length;
    var unresolved = items.filter(function (o) {
      var p = projById[o.object_id];
      return !p || !p.semantic_freshness;
    }).length;

    setField("kpi-total", total);
    setField("kpi-active", active);
    setField("kpi-needs-nika", needsNika);
    setField("kpi-parked", parked);
    setField("kpi-unresolved", unresolved);

    renderObjectsTable(items, projById);
    renderActiveTable(items, projById, blockersById || {});
    renderDecisionList(items);
    renderChangesFeed(items);
  }

  function stateClass(status) {
    status = String(status || "");
    if (/ACTIVE/.test(status)) return "work";
    if (/PARKED|PREPARING/.test(status)) return "attention";
    return "work";
  }

  function renderObjectsTable(items, projById) {
    var el = document.querySelector('[data-f="objects-table"]');
    if (!el) return;
    el.innerHTML = items.map(function (o) {
      var p = projById[o.object_id] || {};
      var unresolvedMark = !p.semantic_freshness ? ' <span title="no projected event backs this state" style="color:#dfad59">●</span>' : "";
      return (
        '<div class="r-row"><b>' + esc(o.object_id) + '</b>' +
        '<span>' + esc(shortTitle(o.name, 40)) + unresolvedMark + '</span>' +
        '<em>' + esc(shortTitle(p.stage || "—", 16)) + '</em>' +
        '<strong class="state ' + stateClass(o.declared_status) + '" title="' + esc(p.status || o.declared_status || "") + '">' + esc(shortTitle(p.status || o.declared_status, 14)) + '</strong></div>'
      );
    }).join("");
  }

  // Материальным считаем только событие с реальным смыслом; всё прочее -- не
  // "последний результат", а шум, и выдавать его за результат нельзя.
  var MATERIAL_KIND = ["GATE_RESULT", "DECISION", "STATUS_CHANGE", "STAGE_CHANGE", "TEST_RESULT"];

  function extraLine(o, blockersById) {
    var out = "";
    var bl = (blockersById || {})[o.object_id] || [];
    if (bl.length) {
      var titles = bl.map(function (b) { return b.title || b.blocker_key; }).join(" | ");
      out += '<br><small style="color:#e08d8d" title="' + esc(titles) + '">мешает: ' + bl.length +
             ' — ' + esc(shortTitle(bl[0].title || bl[0].blocker_key, 34)) + '</small>';
    }
    if (MATERIAL_KIND.indexOf(String(o.last_meaning_kind)) !== -1 && o.last_summary) {
      out += '<br><small style="color:#8d968f" title="' + esc(o.last_summary) + '">' +
             esc(String(o.last_meaning_kind).toLowerCase()) + ': ' + esc(shortTitle(o.last_summary, 34)) + '</small>';
    } else if (!bl.length) {
      out += '<br><small style="color:#6f786f">материального результата нет</small>';
    }
    return out;
  }

  function renderActiveTable(items, projById, blockersById) {
    var el = document.querySelector('[data-f="active-table"]');
    if (!el) return;
    el.innerHTML = items.map(function (o) {
      var p = projById[o.object_id] || {};
      return (
        '<div class="a-row"><b>' + esc(o.object_id) + '</b>' +
        '<span>' + esc(p.owner || "не назначен") + '</span>' +
        '<i class="stage blue">' + esc(ageLabel(p.semantic_freshness)) + '</i>' +
        '<em class="evidence partial">' + esc(shortTitle(p.next_move || "—", 30)) + '</em>' +
        '<span>' + esc(shortTitle(p.next_gate || "—", 30)) + extraLine(o, blockersById) + '</span></div>'
      );
    }).join("");
  }

  function renderDecisionList(items) {
    var el = document.querySelector('[data-f="decision-list"]');
    if (!el) return;
    var needing = items.filter(function (o) { return o.needs_nika; });
    if (!needing.length) {
      el.innerHTML = '<li><span class="decision-mark" style="background:rgba(131,163,105,.15);color:#a9c98a">✓</span><p>Объектов, ждущих вашего решения, сейчас нет</p><b>—</b><time>live</time></li>';
      return;
    }
    el.innerHTML = needing.map(function (o) {
      return (
        '<li><span class="decision-mark">!</span><p>' + esc(o.object_id) + ': ' + esc(shortTitle(o.name, 50)) +
        '</p><b>' + esc(o.priority || "—") + '</b><time>needs_nika</time></li>'
      );
    }).join("");
  }

  function renderChangesFeed(items) {
    var el = document.querySelector('[data-f="changes-feed"]');
    if (!el) return;
    var withEvents = items.filter(function (o) { return o.last_event_at; });
    withEvents.sort(function (a, b) { return String(b.last_event_at).localeCompare(String(a.last_event_at)); });
    if (!withEvents.length) {
      el.innerHTML = "<div><p>Нет зафиксированных событий</p></div>";
      return;
    }
    var iconByKind = { STATE_CHANGE: "good", NOISE: "neutral", DECISION: "blue" };
    el.innerHTML = withEvents.slice(0, 8).map(function (o) {
      var icon = iconByKind[o.last_meaning_kind] || "neutral";
      return (
        '<div><span class="change-icon ' + icon + '">' + (icon === "good" ? "✓" : icon === "blue" ? "△" : "○") + '</span>' +
        '<p>' + esc(o.object_id) + ': ' + esc(shortTitle(o.last_summary || "—", 90)) +
        '<small>' + esc(ageLabel(o.last_event_at)) + ' назад</small></p></div>'
      );
    }).join("");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
