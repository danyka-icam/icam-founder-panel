// PANEL_CONN G1 (2026-08-25) -- live Continuity wiring for the Home screen only.
// Additive: does not touch app.js, does not change card markup/classes, only
// replaces the mock <li> content inside the existing structure once real data
// arrives. If a fetch fails the mock stays exactly as shipped -- never blank,
// never a broken card.
//
// Scope, matching PANEL_CONN.md G1 exactly:
//   1. СЕЙЧАС      -> open_commitments (Continuity founder-inbox)
//   2. ТРЕБУЕТ ВНИМАНИЯ (NEEDS NIKA) -> needs_founder (Continuity founder-inbox)
//   4. ЧТО ИЗМЕНИЛОСЬ -> most recently updated commitments+blockers (real
//      updated_at timestamps; not a true before/after diff -- no changelog
//      endpoint exists yet, tracked as an open item, not fabricated)
//   6. STEWARD      -> system_attention_open count from /health (degraded state)
// NOT wired here (left as shipped mock, on purpose): 3. ПРИОРИТЕТЫ RD1 (that is
// G5/Research screen scope) and 5. РАДАР (not covered by any PANEL_CONN gate).
(function () {
  "use strict";
  var FOUNDER_INBOX = "/founder-ui-preview/api/continuity/founder-inbox";
  var HEALTH = "/founder-ui-preview/api/continuity-health";

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

  function renderNow(commitments) {
    var list = document.querySelector(".home-panel .home-list");
    if (!list || !commitments || !commitments.length) return;
    var items = commitments.slice(0, 4);
    list.innerHTML = items
      .map(function (c, i) {
        return (
          "<li><span class=\"rank\">" + (i + 1) + "</span>" +
          "<span>[" + esc(c.object_id) + "] " + esc(shortTitle(c.title, 90)) + "</span>" +
          "<b class=\"status-pill\">" + esc(c.status || "OPEN") + "</b></li>"
        );
      })
      .join("");
  }

  function renderNeedsNika(needsFounder) {
    var panels = document.querySelectorAll(".home-panel");
    var target = null;
    panels.forEach(function (p) {
      if (p.textContent.indexOf("ТРЕБУЕТ ВНИМАНИЯ") !== -1) target = p;
    });
    if (!target) return;
    var list = target.querySelector(".home-list");
    if (!list) return;
    if (!needsFounder || !needsFounder.length) {
      list.innerHTML =
        "<li><span class=\"decision-icon\">✓</span><span>Нет решений, требующих Niki прямо сейчас</span><b class=\"deadline\">live</b></li>";
      return;
    }
    list.innerHTML = needsFounder
      .slice(0, 4)
      .map(function (n) {
        return (
          "<li><span class=\"decision-icon\">!</span>" +
          "<span>[" + esc(n.object_id) + "] " + esc(shortTitle(n.title, 90)) + "</span>" +
          "<b class=\"deadline\">live</b></li>"
        );
      })
      .join("");
  }

  function renderWhatChanged(commitments, blockers) {
    var panels = document.querySelectorAll(".home-panel");
    var target = null;
    panels.forEach(function (p) {
      if (p.textContent.indexOf("ИЗМЕНИЛОСЬ") !== -1) target = p;
    });
    if (!target) return;
    var body = target.querySelector(".changed-body");
    if (!body) return;
    var all = (commitments || []).concat(blockers || []);
    all.sort(function (a, b) { return String(b.updated_at || "").localeCompare(String(a.updated_at || "")); });
    var recent = all.slice(0, 4);
    if (!recent.length) return;
    var html = recent
      .map(function (r) {
        var d = (r.updated_at || "").slice(0, 10);
        return "<p>[" + esc(d) + "] " + esc(r.object_id) + ": " + esc(shortTitle(r.title, 70)) + "</p>";
      })
      .join("");
    body.innerHTML =
      "<div class=\"changed-col after\" style=\"width:100%\"><h4>Последние изменения (live, по updated_at)</h4>" + html + "</div>";
  }

  function renderSteward(health, systemAttentionOpen) {
    var panels = document.querySelectorAll(".home-panel");
    var target = null;
    panels.forEach(function (p) {
      if (p.textContent.indexOf("STEWARD") !== -1) target = p;
    });
    if (!target) return;
    var donut = target.querySelector(".donut.big strong");
    var small = target.querySelector(".integrity-meter small");
    if (!health || !health.ok) {
      if (small) small.innerHTML = "Индекс целостности<br>недоступен (Continuity offline)";
      return;
    }
    var pct = systemAttentionOpen === 0 ? 100 : Math.max(60, 100 - systemAttentionOpen * 3);
    var i = target.querySelector(".donut.big i");
    if (i) i.style.setProperty("--p", pct + "%");
    if (donut) donut.textContent = pct + "%";
    if (small) {
      small.innerHTML =
        "Индекс целостности (live)<br>" +
        (systemAttentionOpen === 0
          ? "отлично, 0 открытых SYSTEM-вопросов"
          : systemAttentionOpen + " открыт(ых) SYSTEM-вопрос(ов)");
    }
  }

  function init() {
    var inboxPromise = fetchJSON(FOUNDER_INBOX).catch(function () { return null; });
    var healthPromise = fetchJSON(HEALTH).catch(function () { return null; });
    Promise.all([inboxPromise, healthPromise]).then(function (res) {
      var inbox = res[0];
      var health = res[1];
      if (inbox) {
        // renderNow / renderWhatChanged ОТКЛЮЧЕНЫ намеренно (2026-08-27).
        // Они писали в те же контейнеры, что и модуль синтеза ниже, и два
        // модуля гонялись за один и тот же список: побеждал тот, чей fetch
        // вернулся позже. На экране это выглядело как «то маршруты, то
        // обязательства» в панели «1. СЕЙЧАС». Источник по спецификации —
        // маршруты Оркестратора, их и оставляем; обязательства сюда не идут.
        renderNeedsNika(inbox.needs_founder);
      }
      if (health) {
        var systemOpen = health.system_attention_open;
        if (systemOpen == null && inbox) systemOpen = (inbox.summary || {}).system_attention;
        renderSteward(health, systemOpen == null ? 0 : systemOpen);
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

// ── HOME SYNTHESIS (PANEL_INFO, 2026-08-26) ──────────────────────────────────
// Задача: не транспорт, а СИНТЕЗ уровня фаундера. Нового источника истины нет —
// всё читается из уже существующих GET-проекций (Continuity capsule/state,
// Testing summary, Hub sync-health). Панель ничего не пишет.
//
// Принцип, которому подчинён весь модуль: показывать только то, что реально
// пришло из источника. Если данных нет — писать «нет», а не рисовать спокойную
// картинку. Пустой NEEDS NIKA здесь — это ответ, а не сбой.
(function () {
  "use strict";
  var API = "/founder-ui-preview/api";
  var OBJECTS = API + "/continuity/objects";
  var CAPSULE = API + "/continuity/capsule/";
  var INBOX = API + "/continuity/founder-inbox";
  var TESTING = API + "/testing/summary";
  var HUB = API + "/hub/sync-health";
  var OBS_ROUTES = API + "/observer/routes";
  var OBS_METRICS = API + "/observer/metrics";

  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function get(u) { return fetch(u, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("http_" + r.status); return r.json(); }); }
  function soft(u) { return get(u).catch(function () { return null; }); }
  function cut(t, n) { t = String(t == null ? "" : t); return t.length > n ? t.slice(0, n - 1) + "…" : t; }
  function daysSince(iso) {
    if (!iso) return null;
    var d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return isNaN(d) ? null : d;
  }
  function agoLabel(iso) {
    var d = daysSince(iso);
    if (d === null) return "нет событий";
    if (d === 0) return "сегодня";
    if (d === 1) return "вчера";
    return d + " дн назад";
  }
  function panelBy(text) {
    var found = null;
    document.querySelectorAll(".home-panel").forEach(function (p) {
      if (!found && p.textContent.indexOf(text) !== -1) found = p;
    });
    return found;
  }

  // Внутренние коды -> читаемые ярлыки. Точный код сохраняем в title, чтобы
  // читаемость не стирала происхождение.
  var KIND_RU = {
    DECISION: "решение", COMMITMENT: "обязательство", GATE_RESULT: "результат гейта",
    STATUS_CHANGE: "смена статуса", STAGE_CHANGE: "смена этапа", BLOCKER: "блокер",
    FOUNDER_ATTENTION: "требует Niki", MEANINGFUL: "изменение", NOISE: "шум",
    TEST_RESULT: "результат теста", EXTERNAL_EVENT: "внешнее событие"
  };
  var MATERIAL = ["DECISION", "COMMITMENT", "GATE_RESULT", "STATUS_CHANGE", "STAGE_CHANGE",
                  "FOUNDER_ATTENTION", "TEST_RESULT", "EXTERNAL_EVENT", "BLOCKER"];

  function renderNowStrip(vals) {
    var strip = document.querySelector('[data-f="now-strip"]');
    if (!strip) return;
    var cells = [
      ["Активные маршруты", vals.routes,
        (vals.routesNote ? "из них " + vals.routesNote + " без движения 7дн" : "оркестратор"),
        (vals.routesNote && vals.routes && vals.routesNote / vals.routes > 0.5) ? "warn" : ""],
      ["Исследовательские линии", vals.research, "ACTIVE_RESEARCH", ""],
      ["Активные тесты", vals.tests, "в исполнении", ""],
      ["Ручной разбор", vals.manual, "требует человека", vals.manual > 0 ? "warn" : "calm"],
      ["Системные проблемы", vals.system, "открытых SYSTEM", vals.system > 0 ? "warn" : "calm"],
      ["Требует Niki", vals.nika, "решений фаундера", vals.nika > 0 ? "hot" : "calm"]
    ];
    strip.innerHTML = cells.map(function (c) {
      return "<div class='" + c[3] + "'><small>" + esc(c[0]) + "</small><b>" +
        (c[1] == null ? "—" : esc(c[1])) + "</b><em>" + esc(c[2]) + "</em></div>";
    }).join("");
  }

  function renderNeedsNikaRich(inbox) {
    var p = panelBy("ТРЕБУЕТ ВНИМАНИЯ"); if (!p) return;
    var list = p.querySelector(".home-list"); if (!list) return;
    var items = (inbox && inbox.needs_founder) || [];
    if (!items.length) {
      list.innerHTML = "<li><span class='decision-icon'>✓</span><span>Решений, требующих Niki, сейчас нет. " +
        "Открытые системные вопросы (" + esc(((inbox || {}).summary || {}).system_attention || 0) +
        ") — инфраструктурные, разбираются без вас.</span><b class='deadline'>live</b></li>";
      return;
    }
    list.innerHTML = items.slice(0, 5).map(function (n) {
      return "<li><span class='decision-icon'>!</span><span>" +
        "<b>[" + esc(n.object_id || "—") + "]</b> " + esc(cut(n.title, 90)) +
        "<br><small style='color:#8d968f'>что нужно: " + esc(cut(n.reason || n.issue_type || "—", 70)) +
        " · источник: " + esc(n.source_system || "continuity") +
        " · открыто " + esc(agoLabel(n.opened_at)) + "</small>" +
        "</span><b class='deadline'>sev " + esc(n.severity == null ? "—" : n.severity) + "</b></li>";
    }).join("");
  }

  function renderRoutes(routes) {
    var p = panelBy("1. СЕЙЧАС"); if (!p) return;
    var list = p.querySelector(".home-list"); if (!list) return;
    var act = (routes || []).filter(function (r) {
      var st = String(r.status || "").toUpperCase();
      return st !== "CLOSED" && st !== "DONE" && st !== "ARCHIVED";
    });
    if (!act.length) { list.innerHTML = "<li><span class='rank'>—</span><span>Оркестратор не отдал активных маршрутов</span><b class='status-pill'>live</b></li>"; return; }
    // Вперёд — то, где ход за нами и где дольше всего нет движения:
    // это и есть «что от меня ждут», а не просто список.
    act.sort(function (a, b) {
      var da = daysSince(a.last_movement_at), db = daysSince(b.last_movement_at);
      return (db == null ? -1 : db) - (da == null ? -1 : da);
    });
    list.innerHTML = act.slice(0, 5).map(function (r, i) {
      var stale = daysSince(r.last_movement_at);
      var staleTag = (stale !== null && stale >= 7)
        ? " <b style='color:#c6a35f'>· без движения " + stale + " дн</b>" : "";
      var blk = (r.blockers && r.blockers.length)
        ? " <b style='color:#e08d8d'>· блокеров " + r.blockers.length + "</b>" : "";
      return "<li><span class='rank'>" + (i + 1) + "</span><span>" +
        "<b>[" + esc(r.area || r.source_object_id || "—") + "]</b> " + esc(cut(r.next_move || r.title, 78)) +
        "<br><small style='color:#8d968f'>ход у: " + esc(cut(r.ball_owner || "не назначен", 34)) +
        " · пересмотр: " + esc(cut(r.review_condition || "—", 34)) + staleTag + blk + "</small>" +
        "</span><b class='status-pill'>" + esc(r.priority || r.status || "—") + "</b></li>";
    }).join("");
  }

  function renderChangedRich(caps) {
    var p = panelBy("ИЗМЕНИЛОСЬ"); if (!p) return;
    var body = p.querySelector(".changed-body"); if (!body) return;
    var evs = [];
    caps.forEach(function (c) {
      (c.recent_meaningful_events || []).forEach(function (e) {
        if (MATERIAL.indexOf(String(e.meaning_kind)) === -1) return;   // шум и повторы отсекаем
        evs.push({ obj: c.object.object_id, kind: e.meaning_kind, at: e.assessed_at,
                   sig: e.significance, sum: e.summary });
      });
    });
    if (!evs.length) { body.innerHTML = "<div class='changed-col after' style='width:100%'><h4>Материальных изменений не зафиксировано</h4></div>"; return; }
    evs.sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); });
    // Схлопываем повтор одного и того же смысла по одному объекту в одну строку.
    var seen = {}, uniq = [];
    evs.forEach(function (e) {
      var k = e.obj + "|" + e.kind + "|" + cut(e.sum, 60);
      if (seen[k]) { seen[k].n++; return; }
      seen[k] = { n: 1 }; e.dup = seen[k]; uniq.push(e);
    });
    body.innerHTML = "<div class='changed-col after' style='width:100%'><h4>Материальные изменения (live, шум отфильтрован)</h4>" +
      uniq.slice(0, 6).map(function (e) {
        var lbl = KIND_RU[e.kind] || e.kind;
        var rep = e.dup && e.dup.n > 1 ? " <span style='color:#6f786f'>×" + e.dup.n + "</span>" : "";
        return "<p title='" + esc(e.kind) + "'><b style='color:#8fd6a6'>" + esc(lbl) + "</b>" + rep +
          " · <b>[" + esc(e.obj) + "]</b> " + esc(cut(e.sum, 95)) +
          " <span style='color:#6f786f'>" + esc(agoLabel(e.at)) + "</span></p>";
      }).join("") + "</div>";
  }

  function renderSystemCards(objs) {
    var byId = {}; objs.forEach(function (o) { byId[o.object_id] = o; });
    var map = { "Foundation": "FND-001", "Research": "FND-003", "BrazilPortal": "FND-007",
                "Steward": "FND-001", "RD1": "FND-005", "Control Plane": "CMP-000011" };
    document.querySelectorAll(".system-card").forEach(function (card) {
      var h = card.querySelector("h3"); if (!h) return;
      var id = map[h.textContent.trim()]; if (!id) return;
      var o = byId[id]; var st = card.querySelector(".state");
      if (!st) return;
      if (!o) { st.textContent = "нет данных"; return; }
      st.textContent = String(o.declared_status || "—").toLowerCase().replace(/_/g, " ");
      st.title = o.object_id + " · " + (o.declared_status || "");
      var p = card.querySelector("p");
      if (p) p.innerHTML = esc(cut(o.name || o.object_id, 46)) + "<br><span style='color:#6f786f'>" +
        esc(agoLabel(o.last_event_at)) + "</span>";
    });
  }

  function boot() {
    Promise.all([soft(OBJECTS), soft(INBOX), soft(TESTING), soft(HUB),
                 soft(OBS_ROUTES), soft(OBS_METRICS)]).then(function (r) {
      var objs = (r[0] && r[0].items) || [];
      var inbox = r[1], testing = r[2], hub = r[3];
      var routes = (r[4] && r[4].routes) || [];
      var om = (r[5] && r[5].metrics && r[5].metrics.operational) || {};
      function mv(k) { var x = om[k]; return x && typeof x === "object" ? x.value : x; }
      renderSystemCards(objs);
      renderNeedsNikaRich(inbox);
      renderRoutes(routes);
      var ids = objs.map(function (o) { return o.object_id; }).slice(0, 12);
      return Promise.all(ids.map(function (id) { return soft(CAPSULE + encodeURIComponent(id)); }))
        .then(function (caps) {
          caps = caps.filter(function (c) { return c && c.object; });
          renderChangedRich(caps);
          var research = objs.filter(function (o) {
            return String(o.declared_status || "").indexOf("RESEARCH") !== -1 ||
                   String(o.object_type || "").indexOf("research") !== -1; }).length;
          renderNowStrip({
            routes: mv("active_routes"),
            routesNote: mv("stale_routes_7d"),
            research: research,
            tests: testing ? ((testing.active || []).length) : null,
            manual: hub ? ((hub.review_queue || {}).manual_review_required) : null,
            system: inbox ? ((inbox.summary || {}).system_attention) : null,
            nika: inbox ? ((inbox.summary || {}).needs_founder) : null
          });
        });
    }).catch(function () { /* мягкая деградация: поля остаются "—", выдумок нет */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setInterval(boot, 90000);
})();
