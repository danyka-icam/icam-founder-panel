// ─────────────────────────────────────────────────────────────────────────────
// WIDGET TRUTH CONTRACT (PANEL_TRUST_G2 · P0) · 2026-08-27
//
// Это НЕ новое хранилище правды. Ни одного собственного факта тут не хранится:
// контракт объявляет, какой виджет каким источником обязан питаться, а всё
// остальное (HTTP-статус, время последнего успеха, свежесть) СНИМАЕТСЯ с живых
// ответов через перехват fetch. Если источник не ответил — виджет не имеет права
// показывать число, и контракт делает это видимым.
//
// Почему перехват fetch, а не правка каждого модуля: модули пишут в DOM
// по-разному (data-f, классы, innerHTML), и обходить их по одному — способ
// получить рассинхрон. Сеть же одна на всех и врать не умеет.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";

  var NET = {};        // endpoint -> {status, at, ok, bytes}
  var START = Date.now();

  // ── перехват сети: единственный источник фактов о доступности ──
  var _fetch = window.fetch;
  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    return _fetch.apply(this, arguments).then(function (r) {
      try {
        var key = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
        NET[key] = { status: r.status, ok: r.ok, at: new Date().toISOString(), items: null };
        // Клонируем и считаем «сколько данных реально приехало». Без этого
        // пустой ответ 200 неотличим от наполненного, и виджет с текстом-заглушкой
        // засчитывается как живой — ровно так контракт и ошибся на первом прогоне.
        if (r.ok) {
          r.clone().json().then(function (j) {
            NET[key].items = countItems(j);
          }).catch(function () { NET[key].items = null; });
        }
      } catch (e) {}
      return r;
    }, function (e) {
      try {
        var key = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
        NET[key] = { status: 0, ok: false, at: new Date().toISOString(),
                     error: String(e).slice(0, 90) };
      } catch (_) {}
      throw e;
    });
  };

  // Грубый, но честный подсчёт: сколько элементов в ответе. Ищем первый
  // непустой массив на верхних уровнях; если массивов нет — считаем по числу
  // содержательных полей. Задача не измерить точно, а отличить "пусто" от "есть".
  function countItems(j) {
    if (j == null) return 0;
    if (Array.isArray(j)) return j.length;
    if (typeof j !== "object") return 1;
    var best = null;
    Object.keys(j).forEach(function (k) {
      var v = j[k];
      if (Array.isArray(v)) best = Math.max(best == null ? 0 : best, v.length);
    });
    if (best != null) return best;
    var n = 0;
    Object.keys(j).forEach(function (k) {
      var v = j[k];
      if (v !== null && v !== "" && k !== "ok" && k !== "generated_at" && k !== "as_of") n++;
    });
    return n;
  }

  var API = "/founder-ui-preview/api";

  // ── ОБЪЯВЛЕНИЕ КОНТРАКТА ──
  // required=true означает: без этого источника экран не имеет права
  // считаться рабочим. Сторож падает именно на таких.
  var C = {
    index: [
      { id: "home.now_strip", sel: '[data-f="now-strip"]', required: true,
        owner: "Observer + Testing + Hub + Continuity",
        endpoints: [API+"/observer/metrics", API+"/testing/summary",
                    API+"/hub/sync-health", API+"/continuity/founder-inbox"] },
      // Панели переименованы смысловым слоем (2026-08-27): «Требует внимания»
      // стало «Требует меня», демо-панели «Приоритеты RD1» и «Радар» заменены
      // на «Застой и риски» и «Следующие ходы». Матчеры обновлены следом —
      // сторож честно поймал рассинхрон, когда я про них забыл.
      { id: "home.now", panel: "1. СЕЙЧАС", required: true,
        owner: "Orchestrator", endpoints: [API+"/observer/routes"] },
      { id: "home.needs_founder", panel: "ТРЕБУЕТ МЕНЯ", required: true,
        owner: "Continuity", endpoints: [API+"/continuity/founder-inbox"] },
      { id: "home.stalled", panel: "ЗАСТОЙ И РИСКИ", required: true,
        owner: "Orchestrator + Continuity blockers + Testing",
        endpoints: [API+"/observer/routes", API+"/continuity/blockers"] },
      { id: "home.changed", panel: "ЧТО ИЗМЕНИЛОСЬ", required: true,
        owner: "Continuity objects", endpoints: [API+"/continuity/objects"] },
      { id: "home.next_moves", panel: "СЛЕДУЮЩИЕ ХОДЫ", required: true,
        owner: "Orchestrator", endpoints: [API+"/observer/routes"] },
      { id: "home.steward", panel: "STEWARD", required: false,
        owner: "Continuity health", endpoints: [API+"/continuity-health"] },
      { id: "home.system_cards", sel: ".system-card", required: true,
        owner: "Continuity", endpoints: [API+"/continuity/objects"] },
      { id: "home.growth_map", sel: ".growth-card", required: false,
        owner: null, endpoints: [], demo: true }
    ],
    research: [
      { id: "research.kpi", sel: ".research-kpi", required: true,
        owner: "Continuity", endpoints: [API+"/continuity/objects"] },
      { id: "research.objects", sel: '[data-f="objects-table"]', required: true,
        owner: "Continuity rd1-projection", endpoints: [API+"/continuity/objects"] },
      { id: "research.active", sel: '[data-f="active-table"]', required: true,
        owner: "Continuity rd1-projection + blockers", endpoints: [API+"/continuity/blockers"] },
      { id: "research.decisions", sel: '[data-f="decision-list"]', required: false,
        owner: "Continuity", endpoints: [API+"/continuity/objects"] }
    ],
    testing: [
      { id: "testing.kpi", sel: ".doc-kpi", required: true,
        owner: "ICAM Testing Dept", endpoints: [API+"/testing/summary"] },
      { id: "testing.runner", sel: '[data-f="runner"]', required: true,
        owner: "Local runner", endpoints: [API+"/testing-runner-health"] },
      { id: "testing.lineage", sel: ".lin-card", required: false,
        owner: "Testing ledger", endpoints: [API+"/testing/tests"] }
    ],
    operations: [
      { id: "ops.routes", panel: "ТЕКУЩАЯ ОЧЕРЕДЬ", required: true,
        owner: "Orchestrator", endpoints: [API+"/observer/routes"] },
      { id: "ops.load", panel: "Активные ходы", required: true,
        owner: "Observer", endpoints: [API+"/observer/metrics"] }
    ],
    documents: [
      { id: "docs.counters", sel: ".doc-kpi", required: true,
        owner: "ICAM Hub", endpoints: [API+"/hub/sync-health"] }
    ],
    registry: [
      { id: "registry.count", sel: '[data-f="reg-count"]', required: true,
        owner: "Continuity", endpoints: [API+"/continuity/objects"] }
    ],
    foundation: [
      { id: "foundation.status", sel: '.foundation-kpi[data-live="1"]', required: true,
        owner: "Continuity FND-001 capsule",
        endpoints: [API+"/continuity/capsule/FND-001", API+"/continuity-health",
                    API+"/continuity/artifacts/missing", API+"/continuity/blockers"] },
      { id: "foundation.rest", sel: '.foundation-kpi:not([data-live])', required: false,
        owner: null, endpoints: [], demo: true,
        note: "Recovery: источника проверки восстановления в контуре нет" }
    ],
    brazilportal: [
      { id: "bp.contour", sel: '.bp-kpi[data-live="1"]', required: true,
        owner: "Continuity FND-007 capsule",
        endpoints: [API+"/continuity/capsule/FND-007", API+"/continuity/blockers"] },
      { id: "bp.funnel_metrics", sel: '.bp-kpi:not([data-live])', required: false,
        owner: null, endpoints: [], demo: true,
        note: "Radar/Funnel/Content: рантайм-эндпоинты BrazilPortal панели недоступны" }
    ],
    signals: [
      { id: "signals.active", sel: '.sig-kpi[data-live="1"]', required: true,
        owner: "Continuity founder-inbox (сведено по ключу)",
        endpoints: [API+"/continuity/founder-inbox"] },
      { id: "signals.correlation", sel: '.sig-kpi:not([data-live])', required: false,
        owner: null, endpoints: [], demo: true,
        note: "канонической службы корреляций нет: observer/signals и observer/radar → 404" }
    ],
    settings: [
      { id: "settings.connections", sel: '.set-kpi[data-live="1"]', required: true,
        owner: "живая проверка достижимости из браузера",
        endpoints: [API+"/continuity/objects", API+"/observer/routes", API+"/hub/sync-health",
                    API+"/testing/summary", API+"/continuity/founder-inbox"] },
      { id: "settings.rest", sel: '.set-kpi:not([data-live])', required: false,
        owner: null, endpoints: [], demo: true }
    ]
  };

  function screen() {
    var m = location.pathname.match(/([a-z]+)\.html/);
    return m ? m[1] : "index";
  }

  function panelEl(title) {
    var f = null;
    document.querySelectorAll(".home-panel,article.card,section.card").forEach(function (p) {
      if (!f && (p.innerText || "").indexOf(title) !== -1) f = p;
    });
    return f;
  }

  function els(w) {
    if (w.sel) return [].slice.call(document.querySelectorAll(w.sel));
    if (w.panel) { var e = panelEl(w.panel); return e ? [e] : []; }
    return [];
  }

  function hasContent(list) {
    return list.some(function (e) {
      var t = (e.innerText || "").replace(/\s+/g, " ").trim();
      // Порог был length > 2 — и объявлял пустыми настоящие значения «11» и «6».
      // Короткое число это полноценное содержимое; пустым считается только
      // реально пустое и прочерк-заглушка.
      return t.length > 0 && t !== "—" && t !== "-";
    });
  }

  // ── вычисление режима: только из фактов, без предположений ──
  function evaluate(w) {
    var nodes = els(w);
    var rec = {
      widget_id: w.id, screen: screen(), source_owner: w.owner,
      source_endpoint: w.endpoints.slice(), auth_path: w.endpoints.length ? "basic-auth (same-origin)" : null,
      required_for_screen: !!w.required, rendered: nodes.length,
      last_http_status: null, last_success_at: null, semantic_as_of: null,
      partial_data: false, rendered_value_origin: null, error_reason: null,
      source_mode: "UNAVAILABLE", note: w.note || null
    };
    if (w.demo || (!w.endpoints.length && !w.owner)) {
      rec.source_mode = "DEMO";
      rec.rendered_value_origin = "static markup";
      rec.error_reason = "источник не объявлен";
      return rec;
    }
    var seen = w.endpoints.map(function (e) { return NET[e]; }).filter(Boolean);
    var okc = seen.filter(function (n) { return n.ok; });
    if (seen.length) {
      var last = seen[seen.length - 1];
      rec.last_http_status = last.status;
      if (okc.length) rec.last_success_at = okc[okc.length - 1].at;
      if (okc.length < w.endpoints.length) rec.partial_data = true;
      rec.payload_items = okc.map(function (n) { return n.items; });
    }
    var filled = hasContent(nodes);
    // источник ответил 200, но привёз ноль записей — это EMPTY_DATA, не LIVE
    var anyPayload = okc.some(function (n) { return n.items == null || n.items > 0; });
    var allEmpty = okc.length > 0 && okc.every(function (n) { return n.items === 0; });
    if (!seen.length) {
      rec.source_mode = "UNAVAILABLE";
      rec.error_reason = "ни одного запроса к объявленному источнику";
    } else if (!okc.length) {
      rec.source_mode = "UNAVAILABLE";
      rec.error_reason = "источник ответил " + rec.last_http_status;
    } else if (allEmpty) {
      // Источник доступен, но данных нет. Отличается от отказа источника —
      // и не даёт права называть виджет живым, даже если он нарисовал заглушку.
      rec.source_mode = "DEGRADED";
      rec.error_reason = "EMPTY_DATA: источник ответил 200, но вернул 0 записей";
      rec.rendered_value_origin = filled ? "fallback text, not data" : "empty";
      rec.partial_data = true;
    } else if (!filled) {
      rec.source_mode = "DEGRADED";
      rec.error_reason = "RENDER_EMPTY: источник доступен и не пуст, виджет не заполнен";
      rec.rendered_value_origin = "live source, empty render";
    } else {
      rec.source_mode = rec.partial_data ? "DEGRADED" : "LIVE";
      rec.rendered_value_origin = "live source";
    }
    return rec;
  }

  var BADGE = {
    LIVE:        ["#2f5f3f", "#8fd6a6", "ЖИВО"],
    DEGRADED:    ["#4a4230", "#c6a35f", "ЧАСТИЧНО"],
    STALE:       ["#4a4230", "#c6a35f", "УСТАРЕЛО"],
    UNAVAILABLE: ["#4a3030", "#d08a8a", "НЕТ ИСТОЧНИКА"],
    DEMO:        ["#3a3550", "#a99ad6", "ДЕМО"]
  };

  // Состояние показываем НЕ подписью, а цветом кольца вокруг иконки карточки.
  // Текстовые плашки «ЖИВО/ДЕМО» висели в разных местах, наезжали на стрелку
  // и делали панель похожей на несколько разных вёрсток. Точные детали
  // (endpoint, HTTP, время успеха) остаются в подсказке иконки.
  var MODE_CLASS = { LIVE:"st-live", DEGRADED:"st-part", STALE:"st-part",
                     UNAVAILABLE:"st-none", DEMO:"st-demo" };
  function paint(rec, nodes) {
    var cls = MODE_CLASS[rec.source_mode] || "st-none";
    var tip = [rec.widget_id,
               "состояние: " + ({LIVE:"живо",DEGRADED:"работает частично",
                 STALE:"данные устарели",UNAVAILABLE:"источник не подключён",
                 DEMO:"демонстрация"}[rec.source_mode] || rec.source_mode),
               "источник: " + (rec.source_owner || "не объявлен"),
               rec.source_endpoint.join(" , ") || "",
               "HTTP: " + (rec.last_http_status == null ? "запроса не было" : rec.last_http_status),
               rec.last_success_at ? "успех: " + rec.last_success_at : "",
               rec.error_reason || ""].filter(Boolean).join("\n");
    nodes.forEach(function (el) {
      var card = (el.closest && el.closest("article.card, section.card")) || el;
      ["st-live","st-part","st-none","st-demo"].forEach(function(c){card.classList.remove(c)});
      card.classList.add(cls);
      card.dataset.stateTip = tip;
      // кольцо вешаем на иконку карточки — она есть почти у всех
      // ТОЛЬКО настоящие контейнеры иконок. Прежний селектор включал
      // ".panel-head span" и ловил ЛЮБОЙ текстовый span в шапке — из-за этого
      // «иконки» получались шириной 50–112px вместо 26 и строй ломался.
      var icon = card.querySelector(
        ".doc-kpi-icon, .rk-icon, .f-kpi-icon, .bp-kpi-icon, .sig-kpi-icon, " +
        ".set-kpi-icon, .kpi-icon, .system-icon, .panel-head h2 > svg");
      if (icon) { icon.classList.add("state-ring"); icon.title = tip; }
      else card.title = tip;
    });
  }

  function run() {
    var list = C[screen()] || [];
    var out = list.map(function (w) {
      var rec = evaluate(w);
      paint(rec, els(w));
      return rec;
    });
    window.__TRUST = {
      screen: screen(), generated_at: new Date().toISOString(),
      elapsed_ms: Date.now() - START, network: NET, widgets: out,
      summary: {
        total: out.length,
        live: out.filter(function (r) { return r.source_mode === "LIVE"; }).length,
        degraded: out.filter(function (r) { return r.source_mode === "DEGRADED"; }).length,
        unavailable: out.filter(function (r) { return r.source_mode === "UNAVAILABLE"; }).length,
        demo: out.filter(function (r) { return r.source_mode === "DEMO"; }).length,
        required_failing: out.filter(function (r) {
          return r.required_for_screen && r.source_mode !== "LIVE"; }).map(function (r) { return r.widget_id; }),
        bad_http: Object.keys(NET).filter(function (k) { return NET[k].status >= 400 || NET[k].status === 0; })
      }
    };
  }

  // даём живым модулям отработать, затем снимаем состояние
  // Три замера, а не два. Часть виджетов (здоровье раннера, счётчик реестра)
  // наполняется позже 8 с — их источники медленнее прочих. Ранний снимок
  // объявлял живой виджет «незаполненным»: ошибка была во времени замера,
  // а не в данных. Последний замер перезаписывает предыдущие.
  function boot() { setTimeout(run, 3500); setTimeout(run, 8000); setTimeout(run, 13000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
