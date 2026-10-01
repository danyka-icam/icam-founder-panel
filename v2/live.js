// Founder Panel v2 — Live Read Wiring G22
// Scope: READ ONLY.
// Sources: existing same-origin Orchestrator + Continuity GET projections.
// No canonical writes. No local priority engine. No invented dependency links.
(function () {
  "use strict";

  var API = "/founder-ui-preview/api";
  var ENDPOINTS = {
    routes: API + "/observer/routes",
    summary: API + "/observer/summary",
    metrics: API + "/observer/metrics",
    inbox: API + "/continuity/founder-inbox",
    objects: API + "/continuity/objects",
    blockers: API + "/continuity/blockers",
    testingSummary: API + "/testing/summary",
    testingHealth: API + "/testing-health",
    testingRunner: API + "/testing-runner-health",
    hubHealth: API + "/hub/sync-health",
    continuityHealth: API + "/continuity-health",
    opsProjection: API + "/panel/operations",
    brazilPortal: API + "/panel/brazilportal",
    foundationAgg: API + "/panel/foundation",
    atlasState: API + "/panel/atlas",
    twinState: API + "/panel/twin",
    marketSignals: API + "/signals",
    fieldMovement: API + "/signals/field-movement",
    scannerDiagnostics: API + "/signals/diagnostics",
    founderProjection: API + "/founder-projection",
    organizationalIntelligence: API + "/organizational-intelligence",
    stewardReconciliation: API + "/steward-reconciliation",
    signalLabStatus: API + "/signal-lab-status",
    // Founder Universe read-only backend (separate service, same origin).
    temporalUniverse: "/founder-star-view/api/temporal-universe",
    portfolioAdmission: "/founder-star-view/api/portfolio-admission"
  };
  // Only the Founder Universe reads get a client timeout, so a hung service
  // degrades to "unavailable" instead of stalling the whole read cycle.
  var UNIVERSE_TIMEOUT_MS = 8000;

  var REFRESH_MS = 90000;
  // Latest successful read cycle, shared read-only with command-center.js.
  // Holds exactly the payloads fetched below; nothing is derived or stored here.
  var lastSnapshot = null;
  var STALE_DAYS = 7;
  var CRITICAL_DAYS = 14;

  var sourceState = {
    routes: { ok: false, at: null, error: null },
    summary: { ok: false, at: null, error: null },
    metrics: { ok: false, at: null, error: null },
    inbox: { ok: false, at: null, error: null },
    objects: { ok: false, at: null, error: null },
    blockers: { ok: false, at: null, error: null },
    testingSummary: { ok: false, at: null, error: null },
    testingHealth: { ok: false, at: null, error: null },
    testingRunner: { ok: false, at: null, error: null },
    hubHealth: { ok: false, at: null, error: null },
    continuityHealth: { ok: false, at: null, error: null },
    researchRD1: { ok: false, at: null, error: null },
    opsProjection: { ok: false, at: null, error: null },
    brazilPortal: { ok: false, at: null, error: null },
    foundationAgg: { ok: false, at: null, error: null },
    atlasState: { ok: false, at: null, error: null },
    twinState: { ok: false, at: null, error: null },
    marketSignals: { ok: false, at: null, error: null },
    fieldMovement: { ok: false, at: null, error: null },
    scannerDiagnostics: { ok: false, at: null, error: null },
    founderProjection: { ok: false, at: null, error: null },
    organizationalIntelligence: { ok: false, at: null, error: null },
    stewardReconciliation: { ok: false, at: null, error: null },
    signalLabStatus: { ok: false, at: null, error: null },
    temporalUniverse: { ok: false, at: null, error: null },
    portfolioAdmission: { ok: false, at: null, error: null }
  };

  function esc(value) {
    var d = document.createElement("div");
    d.textContent = String(value == null ? "" : value);
    return d.innerHTML;
  }

  function cut(value, n) {
    var s = String(value == null ? "" : value);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function fetchJSON(name, url, timeoutMs) {
    var ctrl = timeoutMs && window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
    return fetch(url, { credentials: "same-origin", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        sourceState[name] = { ok: true, at: new Date().toISOString(), error: null };
        return json;
      })
      .catch(function (err) {
        var msg = err && err.name === "AbortError" ? "timeout " + timeoutMs + "ms" : String(err && err.message || err);
        sourceState[name] = { ok: false, at: new Date().toISOString(), error: msg };
        return null;
      })
      .then(function (v) { if (timer) clearTimeout(timer); return v; });
  }

  function daysSince(iso) {
    if (!iso) return null;
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }

  function ago(iso) {
    var d = daysSince(iso);
    if (d == null) return "нет отметки";
    if (d === 0) return "сегодня";
    if (d === 1) return "вчера";
    return d + " дн. назад";
  }

  var objectNameById = {};

  function setObjectNameMap(objectsResp) {
    objectNameById = {};
    asArray(objectsResp && objectsResp.items).forEach(function (o) {
      if (o && o.object_id) objectNameById[String(o.object_id)] = o.name || o.title || o.object_id;
    });
  }

  function routeName(r) {
    var id = r.source_object_id || r.object_id || "";
    var mapped = id && objectNameById[String(id)];
    if (mapped) return mapped + " · " + id;

    var title = r.title || r.name || "";
    var generic = /^(PROJECTS?|ПРОЕКТЫ?)$/i;
    if (title && !generic.test(String(title).trim())) return title + (id ? " · " + id : "");
    if (id) return id;
    if (r.area && !generic.test(String(r.area).trim())) return r.area;
    return r.route_id || r.id || "Маршрут";
  }

  function humanCode(value) {
    var raw = String(value == null ? "" : value);
    var map = {
      "ACTIVE":"активно",
      "ACTIVE_PRIORITY":"приоритетное направление",
      "ACTIVE_BUILD":"активная сборка",
      "LIVE":"в работе",
      "DEGRADED":"частично ограничено",
      "UNAVAILABLE":"недоступно",
      "FRESH":"актуально",
      "STALE":"устарело",
      "PASS":"пройдено",
      "FAIL":"не пройдено",
      "APPROVED":"одобрено",
      "RESTORE_TARGET_SET":"цель восстановления задана",
      "READ_ONLY_RECONCILIATION_FIRST":"сначала сверка в режиме только чтения",
      "IMPLEMENTATION_READY":"готово к реализации",
      "UNRESOLVED":"не подтверждено",
      "PERSONAL_CLONE_PROSPECTIVE_LEARNING":"проспективное обучение Personal Twin",
      "REGULATED_PROVIDER_AUDIENCE_ELIGIBILITY":"проверка доступности провайдера для аудитории",
      "FOUNDATION_FINAL_SOAK":"финальная стабилизация Foundation",
      "RD1_ACCEPTED_READ_ONLY_OPERATION":"RD1 принят в режиме read-only",
      "PORTFOLIO_LIVE / ATLAS_ADVISORY_LOCAL_RC1":"портфель активен · ATLAS advisory RC1",
      "DOMAIN_ADJUDICATION_REQUIRED":"нужен содержательный разбор владеющей ветки",
      "IMPLEMENTATION_PARTIALLY_VERIFIED":"реализация подтверждена частично",
      "INSUFFICIENT_EVIDENCE":"доказательств недостаточно",
      "INCONCLUSIVE_DUE_TO_INTER_RATER_DISAGREEMENT":"нет окончательного вывода из-за расхождения кодировщиков",
      "FOUNDER_APPROVAL_GVF002A_2019_RUN":"решение Основателя о запуске GVF-002A 2019",
      "OWNING_BRANCH_CONSTRUCT_REPAIR_BEFORE_HUMAN_CODING":"уточнить владеющую ветку до ручного кодирования",
      "ACTIVE_DESIGN":"активное проектирование",
      "PUBLISHED / PUBLIC":"опубликовано · публично",
      "BLOCKED_SINGLE_SOURCE_PAIR_A_J364486":"заблокировано: единственная пара источников A/J364486",
      "ACTIVE_PRIORITY / FOUNDATION_FREEZE / G0_AMBER":"приоритетное направление · основание заморожено · G0 amber"
    };
    if (map[raw]) return map[raw];
    if (/^[A-Z0-9_\-\/ ]+$/.test(raw) && raw.indexOf("_") >= 0) {
      return raw.replace(/_/g, " ").toLowerCase();
    }
    return raw;
  }

  function projectionTextRu(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return raw;
    var exact = {
      "no commitment movement within freshness window": "в окне свежести не было движения по обязательствам",
      "failing dimensions: artifact_durability_readback": "не пройдено обязательное измерение долговечности артефактов",
      "1 orphan receipt(s): STORED with no object on disk": "1 расписка со статусом STORED не связана с объектом на диске",
      "Confirm commit 98d16f8, Aug-16 DB snapshot/hash lineage, pre-migration configs, Reels-Lab-0.14.0.0, and list the seven media-backed Reel project IDs plus existing artifact filenames/hashes. Modify nothing until inventory matches.": "Подтвердить commit 98d16f8, происхождение снимка БД и хэшей от 16 августа, конфигурации до миграции, Reels-Lab-0.14.0.0 и перечень семи Reel-проектов с медиа вместе с существующими именами файлов и хэшами. Ничего не менять, пока инвентаризация не совпадёт.",
      "Founder decision: restore the clean pre-server Content Factory and approved historical Reels; no funnels, Router attribution, or later hardening in the restored production path.": "Решение Основателя: восстановить чистую досерверную Content Factory и одобренные исторические Reels; не переносить в восстановленный production-контур воронки, атрибуцию Router и более позднее усиление.",
      "Source does not populate owner for this commitment.": "Источник не заполняет владельца хода для этого обязательства.",
      "Continuity has no factual-result field on commitments; closed_at records closure time only, not an outcome.": "В обязательствах Continuity нет поля фактического результата; closed_at фиксирует только время закрытия записи, а не результат."
    };
    if (exact[raw]) return exact[raw];
    if (raw.indexOf("no projected-field or material event movement within freshness window") === 0) return "В окне свежести не было движения по спроецированным полям или материальным событиям; каноническая связь статуса остаётся неразрешённой.";
    return raw;
  }

  function routeKey(r) {
    return String(r.route_id || r.id || r.source_object_id || r.object_id || r.area || r.title || "");
  }

  function isClosed(r) {
    var s = String(r.status || "").toUpperCase();
    return s === "CLOSED" || s === "DONE" || s === "ARCHIVED" || s === "CANCELLED";
  }

  function isFounderOwner(owner) {
    var s = String(owner || "").toLowerCase();
    return s.indexOf("founder") !== -1 ||
           s.indexOf("основател") !== -1 ||
           s.indexOf("nika") !== -1 ||
           s.indexOf("ника") !== -1 ||
           s === "me";
  }

  function blockerCount(r) {
    if (Array.isArray(r.blockers)) return r.blockers.length;
    if (typeof r.blockers === "number") return r.blockers;
    if (r.blocker_count != null) return Number(r.blocker_count) || 0;
    return 0;
  }

  function metricValue(metrics, key) {
    var op = metrics && metrics.operational;
    if (!op) return null;
    var v = op[key];
    if (v && typeof v === "object" && "value" in v) return v.value;
    return v == null ? null : v;
  }

  // Explicit dependency extraction only. We do not infer links from names, text or timing.
  function normalizeDependencyItem(x) {
    if (x == null) return null;
    // A primitive dependency token may resolve only against an explicit route ID.
    // Structured references must likewise name route_id/id. Object IDs, areas and
    // titles are provenance/context and are never promoted into route dependencies.
    if (typeof x === "string" || typeof x === "number") return String(x);
    if (typeof x === "object") return String(x.route_id || x.id || "") || null;
    return null;
  }

  function explicitDependencies(r) {
    var candidates = [
      r.depends_on,
      r.dependencies,
      r.upstream_routes,
      r.upstream,
      r.blocked_by
    ];
    var out = [];
    candidates.forEach(function (v) {
      if (!v) return;
      var items = Array.isArray(v) ? v : [v];
      items.forEach(function (x) {
        var id = normalizeDependencyItem(x);
        if (id && out.indexOf(id) === -1) out.push(id);
      });
    });
    return out;
  }

  function dependencyModel(routes) {
    var byKey = {};
    routes.forEach(function (r) {
      // Dependency resolution is fail-closed: only explicit route identifiers.
      // routeKey() may fall back to provenance fields for local UI identity, so it
      // is intentionally not used here unless it equals route_id/id.
      [r.route_id, r.id].filter(Boolean).map(String).forEach(function (k) { byKey[k] = r; });
    });

    var edges = [];
    routes.forEach(function (r) {
      explicitDependencies(r).forEach(function (dep) {
        var upstream = byKey[String(dep)];
        if (!upstream) return;
        edges.push({ from: routeKey(upstream), to: routeKey(r) });
      });
    });

    var downstream = {};
    edges.forEach(function (e) {
      downstream[e.from] = (downstream[e.from] || 0) + 1;
    });

    return { edges: edges, downstream: downstream };
  }

  function riskInfo(r, depModel) {
    var stale = daysSince(r.last_movement_at);
    var blockers = blockerCount(r);
    var downstream = depModel.downstream[routeKey(r)] || 0;
    var level = "stable";

    if ((stale != null && stale >= CRITICAL_DAYS) ||
        (stale != null && stale >= STALE_DAYS && downstream > 0) ||
        blockers >= 2) {
      level = "critical";
    } else if ((stale != null && stale >= STALE_DAYS) || blockers > 0) {
      level = "return";
    }

    return {
      stale: stale,
      blockers: blockers,
      downstream: downstream,
      level: level
    };
  }

  function injectLiveStyles() {
    if (document.getElementById("v2-live-read-styles")) return;
    var style = document.createElement("style");
    style.id = "v2-live-read-styles";
    style.textContent = [
      ".live-list{display:flex;flex-direction:column;gap:8px}",
      ".live-route{position:relative;padding:11px 12px;border:1px solid var(--line-soft);border-radius:10px;background:rgba(19,25,27,.15)}",
      ".live-route.critical{border-color:rgba(212,117,99,.35);box-shadow:inset 3px 0 0 rgba(212,117,99,.75)}",
      ".live-route.return{border-color:rgba(214,187,120,.24);box-shadow:inset 3px 0 0 rgba(214,187,120,.55)}",
      ".live-route-head{display:flex;align-items:center;justify-content:space-between;gap:10px}",
      ".live-route-head b{font:400 15px Georgia,'Times New Roman',serif}",
      ".live-route-meta{margin-top:5px;color:#929a95;font-size:10.5px;line-height:1.45}",
      ".live-route-next{margin-top:7px;color:#d8dbd6;font-size:12px;line-height:1.45}",
      ".live-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}",
      ".live-badge{font-size:9px;border:1px solid var(--line);border-radius:999px;padding:4px 7px;color:#aeb5b0}",
      ".live-badge.warn{color:#e0c486;border-color:rgba(214,187,120,.25)}",
      ".live-badge.hot{color:#e19a8d;border-color:rgba(212,117,99,.3)}",
      ".source-note{margin-top:8px;color:#7f8984;font-size:9.5px}",
      ".live-empty{padding:14px 0;color:#9aa39e;font-size:12px;line-height:1.5}",
      ".route-visual-board{display:flex;flex-direction:column;gap:8px}",
      ".route-visual-row{display:grid;grid-template-columns:minmax(110px,1fr) 2.2fr minmax(90px,.8fr);gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line-soft)}",
      ".route-visual-row:first-child{border-top:0}",
      ".route-visual-name b{display:block;font-size:10.5px;font-weight:500}.route-visual-name small{display:block;color:#858e89;font-size:9px;margin-top:2px}",
      ".route-rail{height:9px;border-radius:999px;background:rgba(18,23,25,.45);position:relative;overflow:hidden}",
      ".route-rail span{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:rgba(169,196,127,.62)}",
      ".route-rail span.return{background:rgba(214,187,120,.62)}",
      ".route-rail span.critical{background:rgba(212,117,99,.68)}",
      ".route-visual-status{text-align:right;font-size:9.5px;color:#929a95}",
      ".dep-live-message{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:22px;color:#929a95;font-size:11px;line-height:1.5}",
      ".attention-note{font-size:9px;color:#7f8984;line-height:1.35;margin:0 0 7px}",
      ".home-live-list{display:flex;flex-direction:column;gap:7px}",
      ".home-live-item{padding:9px 0;border-top:1px solid var(--line-soft)}",
      ".home-live-item:first-child{border-top:0}",
      ".home-live-item b{font-size:12px;font-weight:500}.home-live-item small{display:block;margin-top:3px;color:#8e9792;font-size:10px;line-height:1.4}",
      ".live-unavailable{min-height:110px;display:flex;flex-direction:column;justify-content:center;color:#9aa39e;font-size:12px;line-height:1.5}",
      ".live-unavailable b{font:400 16px Georgia,'Times New Roman',serif;color:#dfe2dc;margin-bottom:5px}",
      ".market-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".market-card-type,.market-card-relevance{font-size:9px;color:#8e9792;border:1px solid var(--line-soft);border-radius:6px;padding:2px 6px}",
      ".market-card-title{margin-top:6px;font-size:12px;color:#d8dbd6}",
      ".market-card-summary,.market-card-why{margin-top:4px;font-size:11px;color:#9aa39e;line-height:1.4}",
      ".market-card-meta{margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;font-size:9.5px;color:#7f8984}",
      ".market-card-drawer-toggle{margin-top:7px;background:none;border:1px solid var(--line-soft);border-radius:6px;color:#9aa39e;font-size:9.5px;padding:3px 7px;cursor:pointer}",
      ".market-card-drawer-toggle:hover{color:#d8dbd6}",
      ".market-card-drawer{margin-top:7px;padding:8px 9px;border:1px solid var(--line-soft);border-radius:8px;background:rgba(19,25,27,.2)}",
      ".market-card-drawer-row{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#9aa39e;padding:2px 0}",
      ".market-card-drawer-row b{color:#d8dbd6;font-weight:400;word-break:break-all;text-align:right}",
      ".market-card-evidence-list{margin:4px 0 0;padding-left:14px;font-size:10px;color:#9aa39e;line-height:1.5}",
      ".market-coverage-note{margin-top:8px}"
    ].join("");
    document.head.appendChild(style);
  }

  function setOrchestratorHeader(routesOk, summaryOk, metricsOk) {
    var page = document.querySelector('[data-page-panel="orchestrator"]');
    if (!page) return;
    var badge = page.querySelector(".top-actions .state");
    if (!badge) return;
    badge.classList.remove("unavailable", "warn", "live");
    if (!routesOk) {
      badge.classList.add("unavailable");
      badge.textContent = "ИСТОЧНИК НЕДОСТУПЕН";
    } else if (!summaryOk || !metricsOk) {
      badge.classList.add("warn");
      badge.textContent = "ДАННЫЕ ЧАСТИЧНО";
    } else {
      badge.classList.add("live");
      badge.textContent = "ДАННЫЕ ПОДКЛЮЧЕНЫ";
    }
  }

  function unavailableHTML(title, detail) {
    return "<div class='live-unavailable'><b>" + esc(title) + "</b><span>" + esc(detail) + "</span></div>";
  }

  function setHomeKPI(label, value, detail) {
    var cards = document.querySelectorAll('[data-page-panel="home"] .strip .card');
    cards.forEach(function (card) {
      var small = card.querySelector("small");
      var strong = card.querySelector("strong");
      var span = card.querySelector("span");
      if (!small || small.textContent.trim() !== label) return;
      if (strong) strong.textContent = value;
      if (span) span.textContent = detail;
    });
  }

  function renderHomeKPIs(routes, inbox) {
    if (sourceState.routes.ok) {
      var active = routes.filter(function (r) { return !isClosed(r); });
      setHomeKPI("Маршруты", String(active.length), "активные маршруты из текущего чтения Оркестратора");
    } else {
      setHomeKPI("Маршруты", "Недоступно", "текущее чтение Оркестратора завершилось ошибкой");
    }

    if (sourceState.inbox.ok) {
      var needs = inbox && Array.isArray(inbox.needs_founder) ? inbox.needs_founder : [];
      var declared = inbox && inbox.summary && inbox.summary.needs_founder != null ? inbox.summary.needs_founder : needs.length;
      setHomeKPI("Внимание Основателя", String(declared), "реальные элементы Founder inbox");
    } else {
      setHomeKPI("Внимание Основателя", "Недоступно", "Founder inbox не подтвердил текущее состояние");
    }
  }

  function renderRoutesUnavailable() {
    [
      '[data-page-panel="orchestrator"] .mine .panel-body',
      '[data-page-panel="orchestrator"] .waiting .panel-body',
      '[data-page-panel="orchestrator"] .orch-risk .panel-body'
    ].forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el) el.innerHTML = unavailableHTML("Источник маршрутов недоступен", "Панель не сохраняет демонстрационные или прошлые маршруты как current state.");
    });

    var page = document.querySelector('[data-page-panel="orchestrator"]');
    if (page) {
      page.querySelectorAll(".strip .card").forEach(function (card) {
        var strong = card.querySelector("strong");
        var span = card.querySelector("span");
        if (strong) strong.textContent = "Недоступно";
        if (span) span.textContent = "текущее чтение маршрутов завершилось ошибкой";
      });
    }

    var board = document.querySelector('[data-page-panel="orchestrator"] .progress-board');
    var scale = document.querySelector('[data-page-panel="orchestrator"] .attention-scale');
    var graph = document.querySelector('[data-page-panel="orchestrator"] .dependency-graph');
    if (board) board.innerHTML = unavailableHTML("Маршрутные данные недоступны", "Визуальная шкала очищена до нового успешного чтения.");
    if (scale) scale.innerHTML = "<h3>ШКАЛА ВНИМАНИЯ</h3>" + unavailableHTML("Нет current state", "Диагностическая шкала не строится по прошлым или демонстрационным данным.");
    if (graph) graph.innerHTML = "<div class='dep-live-message'>Источник маршрутов недоступен.<br>Граф очищен до нового успешного чтения.</div>";

    var homeNow = document.querySelector('[data-page-panel="home"] .home-panel.now .body');
    var homeRisk = document.querySelector('[data-page-panel="home"] .home-panel.risk .body');
    if (homeNow) homeNow.innerHTML = unavailableHTML("Оркестратор недоступен", "Главная не показывает старый порядок маршрутов как текущий.");
    if (homeRisk) homeRisk.innerHTML = unavailableHTML("Риск-модель недоступна", "Без current routes Панель не вычисляет диагностический застой.");
  }

  function renderInboxUnavailable() {
    var body = document.querySelector('[data-page-panel="home"] .home-panel.need .body');
    if (body) body.innerHTML = unavailableHTML("Founder inbox недоступен", "Панель не может подтвердить, есть ли сейчас решения, требующие Основателя.");
  }

  function renderOrchestratorKPIs(routes, summary, metrics, depModel) {
    var page = document.querySelector('[data-page-panel="orchestrator"]');
    if (!page) return;
    var cards = page.querySelectorAll(".strip .card");
    var active = routes.filter(function (r) { return !isClosed(r); });
    var risks = active.filter(function (r) { return riskInfo(r, depModel).level !== "stable"; });
    var deps = depModel.edges.length;

    cards.forEach(function (card) {
      var small = card.querySelector("small");
      var strong = card.querySelector("strong");
      var span = card.querySelector("span");
      if (!small || !strong) return;
      var label = small.textContent.trim();

      if (label === "Активные маршруты") {
        strong.textContent = summary && summary.routes_active != null ? summary.routes_active : active.length;
        if (span) span.textContent = "живые маршруты Оркестратора";
      }

      if (label === "Отдельные задачи") {
        strong.textContent = "ещё не подключены";
        if (span) span.textContent = "запись будет отдельным безопасным этапом";
      }

      if (label === "Риск отставания") {
        var metricStale = metricValue(metrics, "stale_routes_7d");
        strong.textContent = metricStale != null ? metricStale : risks.length;
        if (span) span.textContent = "по давности движения и блокерам";
      }

      if (label === "Узлы зависимости") {
        strong.textContent = deps ? deps : "нет поля";
        if (span) span.textContent = deps ? "явные связи из источника" : "связи не представлены текущим API";
      }
    });
  }

  function routeCard(r, depModel) {
    var risk = riskInfo(r, depModel);
    var classes = ["live-route"];
    if (risk.level === "critical") classes.push("critical");
    if (risk.level === "return") classes.push("return");

    var badges = [];
    if (r.priority) badges.push("<span class='live-badge'>" + esc(r.priority) + "</span>");
    if (risk.stale != null && risk.stale >= STALE_DAYS) {
      badges.push("<span class='live-badge warn'>без движения " + risk.stale + " дн.</span>");
    }
    if (risk.blockers) {
      badges.push("<span class='live-badge hot'>блокеров " + risk.blockers + "</span>");
    }
    if (risk.downstream) {
      badges.push("<span class='live-badge hot'>задерживает " + risk.downstream + " зависим.</span>");
    }

    return "<div class='" + classes.join(" ") + "'>" +
      "<div class='live-route-head'><b>" + esc(cut(routeName(r), 48)) + "</b>" +
      "<span class='state " + (risk.level === "critical" ? "warn" : "live") + "'>" +
      esc(r.stage || r.status || "этап не передан") + "</span></div>" +
      "<div class='live-route-next'>" + esc(cut(r.next_move || r.title || "Следующий ход не передан", 120)) + "</div>" +
      "<div class='live-route-meta'>ход у: " + esc(r.ball_owner || "не назначен") +
      " · пересмотр: " + esc(cut(r.review_condition || "—", 55)) +
      " · движение: " + esc(ago(r.last_movement_at)) + "</div>" +
      (badges.length ? "<div class='live-badges'>" + badges.join("") + "</div>" : "") +
      "</div>";
  }

  function renderRoutePanel(selector, routes, depModel, emptyText) {
    var el = document.querySelector(selector);
    if (!el) return;
    if (!routes.length) {
      el.innerHTML = "<div class='live-empty'>" + esc(emptyText) + "</div>";
      return;
    }
    el.innerHTML = "<div class='live-list'>" + routes.map(function (r) {
      return routeCard(r, depModel);
    }).join("") + "</div>";
  }

  function renderOrchestratorRoutes(routes, depModel) {
    var active = routes.filter(function (r) { return !isClosed(r); });

    // We preserve source order. The frontend does not create a new canonical priority ranking.
    renderRoutePanel(
      '[data-page-panel="orchestrator"] .mine .panel-body',
      active.slice(0, 8),
      depModel,
      "Оркестратор не отдал активных маршрутов."
    );

    var waiting = active.filter(function (r) {
      // Waiting is an explicit external-owner state. SYSTEM / AGENT mean
      // the move is assigned elsewhere, not that the route is waiting.
      return /^EXTERNAL$/i.test(String(r.ball_owner || "").trim());
    });
    renderRoutePanel(
      '[data-page-panel="orchestrator"] .waiting .panel-body',
      waiting.slice(0, 5),
      depModel,
      "Нет маршрутов с внешним владельцем хода."
    );

    var risk = active.filter(function (r) {
      return riskInfo(r, depModel).level !== "stable";
    }).sort(function (a, b) {
      var da = daysSince(a.last_movement_at);
      var db = daysSince(b.last_movement_at);
      return (db == null ? -1 : db) - (da == null ? -1 : da);
    });

    renderRoutePanel(
      '[data-page-panel="orchestrator"] .orch-risk .panel-body',
      risk.slice(0, 6),
      depModel,
      "По давности движения и блокерам выраженного риска сейчас не видно."
    );
  }

  function recencyFill(days, level) {
    // Visual recency only, not progress or priority.
    if (days == null) return 18;
    var width = Math.min(100, 15 + days * 5);
    if (level === "stable") width = Math.max(12, Math.min(45, width));
    return width;
  }

  function renderVisualBoard(routes, depModel) {
    var board = document.querySelector('[data-page-panel="orchestrator"] .progress-board');
    var scale = document.querySelector('[data-page-panel="orchestrator"] .attention-scale');
    var graph = document.querySelector('[data-page-panel="orchestrator"] .dependency-graph');
    if (!board || !scale || !graph) return;

    var active = routes.filter(function (r) { return !isClosed(r); }).slice(0, 8);
    if (!active.length) {
      board.innerHTML = "<div class='live-empty'>Нет активных маршрутов для визуализации.</div>";
      scale.innerHTML = "<h3>ШКАЛА ВНИМАНИЯ</h3><div class='live-empty'>Нет данных.</div>";
      graph.innerHTML = "<div class='dep-live-message'>Нет данных для графа.</div>";
      return;
    }

    board.innerHTML =
      "<div class='attention-note'>Шкала ниже показывает давность движения, а не процент готовности и не приоритет.</div>" +
      "<div class='route-visual-board'>" +
      active.map(function (r) {
        var risk = riskInfo(r, depModel);
        var days = risk.stale;
        return "<div class='route-visual-row'>" +
          "<div class='route-visual-name'><b>" + esc(cut(routeName(r), 34)) + "</b><small>" +
          esc(humanCode(r.stage || r.status || "этап не передан")) + "</small></div>" +
          "<div class='route-rail'><span class='" + esc(risk.level) + "' style='width:" +
          recencyFill(days, risk.level) + "%'></span></div>" +
          "<div class='route-visual-status'>" + esc(days == null ? "нет даты" : days + " дн.") +
          (risk.downstream ? "<br>↓ " + risk.downstream + " зависим." : "") + "</div>" +
          "</div>";
      }).join("") +
      "</div>";

    var critical = [], returning = [], stable = [];
    active.forEach(function (r) {
      var info = riskInfo(r, depModel);
      var item = { r: r, info: info };
      if (info.level === "critical") critical.push(item);
      else if (info.level === "return") returning.push(item);
      else stable.push(item);
    });

    function attentionRows(items, cls, label) {
      if (!items.length) return "";
      return items.slice(0, 4).map(function (x, i) {
        var reason = [];
        if (x.info.stale != null && x.info.stale >= STALE_DAYS) reason.push("без движения " + x.info.stale + " дн.");
        if (x.info.blockers) reason.push("блокеров " + x.info.blockers);
        if (x.info.downstream) reason.push("задерживает " + x.info.downstream);
        return "<div class='attention " + cls + "'><span>" + (i === 0 ? label : "") + "</span><b>" +
          esc(cut(routeName(x.r), 34)) + "</b><small>" + esc(reason.join(" · ") || "диагностических признаков нет") + "</small></div>";
      }).join("");
    }

    scale.innerHTML =
      "<h3>ШКАЛА ВНИМАНИЯ</h3>" +
      "<div class='attention-note'>Визуальная диагностика панели по давности/блокерам. Это не канонический приоритет Оркестратора.</div>" +
      attentionRows(critical, "critical", "Критично") +
      attentionRows(returning, "return", "Вернуться") +
      attentionRows(stable, "stable", "Без сигнала");

    if (!depModel.edges.length) {
      graph.innerHTML =
        "<div class='dep-live-message'>Текущий маршрутный источник не отдаёт явные связи между линиями.<br>" +
        "Граф зависимостей не строим догадками.</div>";
      return;
    }

    var nodesByKey = {};
    active.forEach(function (r, idx) {
      nodesByKey[routeKey(r)] = {
        r: r,
        x: 18 + (idx % 3) * 32,
        y: 18 + Math.floor(idx / 3) * 31
      };
    });

    var edges = depModel.edges.filter(function (e) {
      return nodesByKey[e.from] && nodesByKey[e.to];
    });

    var html = "<svg viewBox='0 0 100 100' preserveAspectRatio='none' aria-hidden='true'>";
    html += "<defs><marker id='v2Arrow' markerWidth='6' markerHeight='6' refX='5' refY='3' orient='auto'>" +
            "<path d='M0,0 L6,3 L0,6 z' fill='rgba(214,187,120,.72)'/></marker></defs>";
    edges.forEach(function (e) {
      var a = nodesByKey[e.from], b = nodesByKey[e.to];
      html += "<line x1='" + a.x + "' y1='" + a.y + "' x2='" + b.x + "' y2='" + b.y +
              "' stroke='rgba(214,187,120,.62)' stroke-width='.8' marker-end='url(#v2Arrow)'/>";
    });
    html += "</svg>";

    Object.keys(nodesByKey).forEach(function (k) {
      var n = nodesByKey[k];
      var info = riskInfo(n.r, depModel);
      html += "<div class='dep-node " + (info.level === "critical" ? "critical" : "") +
              "' style='left:" + n.x + "%;top:" + n.y + "%;transform:translate(-50%,-50%)'>" +
              esc(cut(routeName(n.r), 18)) + "</div>";
    });
    html += "<div class='dep-caption'>Показаны только явные зависимости, которые реально присутствуют в источнике.</div>";
    graph.innerHTML = html;
  }

  function renderHomeRoutes(routes, depModel) {
    var body = document.querySelector('[data-page-panel="home"] .home-panel.now .body');
    if (!body) return;
    var active = routes.filter(function (r) { return !isClosed(r); });
    if (!active.length) {
      body.innerHTML = "<div class='live-empty'>Оркестратор не отдал активных маршрутов.</div>";
      return;
    }

    body.innerHTML = "<div class='home-live-list'>" +
      active.slice(0, 5).map(function (r) {
        var info = riskInfo(r, depModel);
        return "<div class='home-live-item'><b>" + esc(cut(routeName(r), 40)) + " — " +
          esc(cut(r.next_move || r.title || "следующий ход не передан", 80)) + "</b>" +
          "<small>ход у: " + esc(r.ball_owner || "не назначен") +
          " · " + esc(info.stale == null ? "движение без даты" : "движение " + ago(r.last_movement_at)) +
          (info.blockers ? " · блокеров " + info.blockers : "") +
          "</small></div>";
      }).join("") +
      "</div><div class='source-note'>Порядок строк получен из Оркестратора; Панель не создаёт свой рейтинг.</div>";
  }

  function renderHomeNeeds(inbox) {
    var body = document.querySelector('[data-page-panel="home"] .home-panel.need .body');
    if (!body) return;
    var items = inbox && Array.isArray(inbox.needs_founder) ? inbox.needs_founder : [];
    if (!items.length) {
      body.innerHTML = "<div class='live-empty'>Сейчас нет решений, которые источник помечает как требующие Основателя.</div>";
      return;
    }
    body.innerHTML = "<div class='home-live-list'>" +
      items.slice(0, 5).map(function (n) {
        return "<div class='home-live-item'><b>" +
          esc((n.object_id ? "[" + n.object_id + "] " : "") + cut(n.title || "Требует участия", 84)) +
          "</b><small>" + esc(cut(n.reason || n.issue_type || "причина не передана", 100)) +
          " · открыто: " + esc(ago(n.opened_at)) + "</small></div>";
      }).join("") + "</div>";
  }

  function renderHomeRisk(routes, depModel) {
    var body = document.querySelector('[data-page-panel="home"] .home-panel.risk .body');
    if (!body) return;
    var risk = routes.filter(function (r) {
      return !isClosed(r) && riskInfo(r, depModel).level !== "stable";
    }).sort(function (a, b) {
      var da = daysSince(a.last_movement_at), db = daysSince(b.last_movement_at);
      return (db == null ? -1 : db) - (da == null ? -1 : da);
    });

    if (!risk.length) {
      body.innerHTML = "<div class='live-empty'>По давности движения и блокерам выраженного риска не видно.</div>";
      return;
    }

    body.innerHTML = "<div class='home-live-list'>" +
      risk.slice(0, 5).map(function (r) {
        var info = riskInfo(r, depModel), reasons = [];
        if (info.stale != null) reasons.push("без движения " + info.stale + " дн.");
        if (info.blockers) reasons.push("блокеров " + info.blockers);
        if (info.downstream) reasons.push("задерживает " + info.downstream);
        return "<div class='home-live-item'><b>" + esc(cut(routeName(r), 44)) + "</b><small>" +
          esc(reasons.join(" · ")) + "</small></div>";
      }).join("") +
      "</div><div class='source-note'>Это диагностический сигнал панели, а не новый канонический приоритет.</div>";
  }

  function updateTrust() {
    var required = ["routes"];
    var requiredFailing = required.filter(function (k) { return !sourceState[k].ok; });
    window.__PANEL_V2_LIVE = {
      at: new Date().toISOString(),
      sources: JSON.parse(JSON.stringify(sourceState)),
      required_failing: requiredFailing
    };
    window.__TRUST = window.__TRUST || {};
    window.__TRUST.v2 = window.__PANEL_V2_LIVE;
  }


  function ruStatus(v) {
    var map = {
      ACTIVE_SERVICE: "работает как служба",
      ACTIVE_RESEARCH: "идёт исследование",
      ACTIVE_BUILD: "идёт сборка",
      ACTIVE_PRIORITY: "приоритетное направление",
      ACTIVE_DESIGN: "проектирование",
      ACTIVE_ENGINEERING: "инженерная работа",
      ACTIVE_IMPLEMENTATION: "внедрение",
      ACTIVE_INFRASTRUCTURE: "инфраструктура",
      ACTIVE_BRANCH: "активная ветка",
      PREPARING: "готовится",
      PARKED: "на паузе",
      REQUESTED: "запрошено",
      READY: "готово к запуску",
      RUNNING: "выполняется",
      COMPLETED: "завершено",
      BLOCKED: "остановлено",
      RERUN_REQUIRED: "нужен повтор",
      NEEDS_ADJUDICATION: "ждёт разбора ветки",
      INVALIDATED: "отбраковано",
      INCONCLUSIVE: "без вывода"
    };
    var s = String(v || "");
    return map[s] || s.replace(/_/g, " ").toLowerCase() || "—";
  }

  function ageMinutesLabel(minutes) {
    if (minutes == null || !isFinite(Number(minutes))) return "—";
    var n = Math.max(0, Number(minutes));
    var d = Math.floor(n / 1440);
    var h = Math.floor((n % 1440) / 60);
    var m = Math.round(n % 60);
    if (d) return d + " дн. " + h + " ч.";
    if (h) return h + " ч. " + m + " мин.";
    return m + " мин.";
  }

  function pageBadge(pageKey, mode, text) {
    var page = document.querySelector('[data-page-panel="' + pageKey + '"]');
    if (!page) return;
    var badge = page.querySelector(".top-actions .state");
    if (!badge) return;
    badge.classList.remove("unavailable", "warn", "live", "lab");
    badge.classList.add(mode);
    badge.textContent = text;
  }

  function allTests(summary) {
    var by = {};
    if (!summary) return [];
    asArray(summary.active).forEach(function (t) { if (t && t.test_id) by[t.test_id] = t; });
    asArray(summary.recent).forEach(function (t) { if (t && t.test_id) by[t.test_id] = t; });
    return Object.keys(by).map(function (k) { return by[k]; });
  }

  function renderHomeTesting(summary) {
    var value = document.querySelector('[data-home="testing"]');
    var note = document.querySelector('[data-home-note="testing"]');
    if (!value || !note) return;
    if (!sourceState.testingSummary.ok || !summary) {
      value.textContent = "Недоступно";
      note.textContent = "текущее состояние тестов не подтверждено";
      return;
    }
    var attention = allTests(summary).filter(function (t) {
      return ["NEEDS_ADJUDICATION", "BLOCKED", "RERUN_REQUIRED"].indexOf(String(t.status || "").toUpperCase()) >= 0;
    });
    value.textContent = String(attention.length);
    note.textContent = attention.length ? "проверки, требующие разбора, повтора или снятия блокера" : "нет тестов, требующих внимания";
  }

  function renderRegistry(objectsResp, blockersResp) {
    var page = document.querySelector('[data-page-panel="registry"]');
    if (!page) return;
    if (!sourceState.objects.ok || !objectsResp) {
      pageBadge("registry", "unavailable", "ИСТОЧНИК НЕДОСТУПЕН");
      ["count", "active", "unresolved", "founder"].forEach(function (k) {
        var el = page.querySelector('[data-g="' + k + '"]'); if (el) el.textContent = "Недоступно";
      });
      var list = page.querySelector('[data-g="objects"]');
      if (list) list.innerHTML = unavailableHTML("Объекты Continuity недоступны", "Реестр не показывает прошлый список как текущее состояние.");
      return;
    }

    var items = asArray(objectsResp.items);
    var active = items.filter(function (o) { return /^ACTIVE/.test(String(o.declared_status || "").toUpperCase()); });
    // Absence of last_event_at is an event-history gap, not identity debt.
    // /continuity/objects does not expose a separate identity/mapping verdict.
    var noEventHistory = items.filter(function (o) { return !o.last_event_at; });
    var founder = items.filter(function (o) { return !!(o.needs_nika || o.needs_founder); });

    function put(k, v) { var e = page.querySelector('[data-g="' + k + '"]'); if (e) e.textContent = String(v); }
    put("count", items.length); put("active", active.length); put("unresolved", noEventHistory.length); put("founder", founder.length);
    var core = page.querySelector('[data-g="identity-core"]'); if (core) core.textContent = String(noEventHistory.length);

    var list = page.querySelector('[data-g="objects"]');
    if (list) {
      var recent = items.slice().sort(function (a, b) {
        return String(b.last_event_at || "").localeCompare(String(a.last_event_at || ""));
      });
      list.innerHTML = recent.length ? recent.slice(0, 12).map(function (o) {
        return "<div class='registry-live-row'>" +
          "<b>" + esc(o.object_id || "не определён") + "</b>" +
          "<span>" + esc(o.name || "без названия") + "</span>" +
          "<span>" + esc(o.owning_branch || o.owner || "—") + "</span>" +
          "<span>" + esc(ruStatus(o.declared_status)) + "</span>" +
          "<small>" + esc(ago(o.last_event_at)) + "</small></div>";
      }).join("") : "<div class='registry-empty'><strong>Реестр пуст</strong><span>Источник ответил без объектов.</span></div>";
    }

    var founderBox = page.querySelector('[data-g="founder-list"]');
    if (founderBox) {
      founderBox.innerHTML = founder.length ? "<div class='registry-mini-list'>" + founder.slice(0, 6).map(function (o) {
        return "<div class='registry-mini-item'><b>" + esc(o.name || o.object_id) + "</b><span>" +
          esc(o.object_id || "не определён") + " · " + esc(ruStatus(o.declared_status)) + "</span></div>";
      }).join("") + "</div>" :
      "<div class='registry-empty compact'><strong>Нет объектов, помеченных как требующие участия Основателя</strong><span>Источник объектов не отметил ни один объект флагом needs_founder / needs_nika.</span></div>";
    }

    var blockerBox = page.querySelector('[data-g="blockers-list"]');
    if (blockerBox) {
      if (!sourceState.blockers.ok || !blockersResp) {
        blockerBox.innerHTML = unavailableHTML("Блокеры недоступны", "Список не выводится по данным объектов или по догадке.");
      } else {
        var blockers = asArray(blockersResp.items).filter(function (b) {
          return !b.is_test && String(b.status || "").toUpperCase() !== "CLEARED";
        });
        blockerBox.innerHTML = blockers.length ? "<div class='registry-mini-list'>" + blockers.slice(0, 6).map(function (b) {
          return "<div class='registry-mini-item'><b>" + esc(b.title || b.blocker || "Открытая blocker-запись") + "</b><span>" +
            esc(b.object_id || "объект не определён") + " · " + esc(ruStatus(b.status || "OPEN")) + " · тяжесть не передана</span></div>";
        }).join("") + "</div>" :
        "<div class='registry-empty compact'><strong>Открытых нетестовых blocker-записей нет</strong><span>По текущей проекции Continuity.</span></div>";
      }
    }

    var recentBox = page.querySelector('[data-g="recent-list"]');
    if (recentBox) {
      var changed = items.filter(function (o) { return o.last_event_at; }).sort(function (a, b) {
        return String(b.last_event_at).localeCompare(String(a.last_event_at));
      }).slice(0, 6);
      recentBox.innerHTML = changed.length ? "<div class='registry-mini-list'>" + changed.map(function (o) {
        return "<div class='registry-mini-item'><b>" + esc(o.name || o.object_id) + "</b><span>" +
          esc(ruStatus(o.declared_status)) + " · " + esc(ago(o.last_event_at)) + "</span></div>";
      }).join("") + "</div>" :
      "<div class='registry-empty compact'><strong>Нет событий с датой</strong><span>Источник объектов ответил, но last_event_at не передан. Это не считается проблемой идентичности или доказательством отсутствия изменений.</span></div>";
    }

    pageBadge("registry", sourceState.blockers.ok ? "live" : "warn", sourceState.blockers.ok ? "ДАННЫЕ ПОДКЛЮЧЕНЫ" : "ДАННЫЕ ЧАСТИЧНО");
  }

  function renderDocuments(health, testingSummary) {
    var page = document.querySelector('[data-page-panel="documents"]');
    if (!page) return;
    var keys = ["durable", "review", "oldest", "unknown"];
    if (!sourceState.hubHealth.ok || !health) {
      keys.forEach(function (k) { var e = page.querySelector('[data-d="' + k + '"]'); if (e) e.textContent = "Недоступно"; });
      var q = page.querySelector('[data-d="queue"]');
      if (q) q.innerHTML = unavailableHTML("Hub / Durability недоступен", "Очередь ручного разбора не подтверждена.");
      pageBadge("documents", "unavailable", "ИСТОЧНИК НЕДОСТУПЕН");
      return;
    }
    var rq = health.review_queue || {};
    var vals = {
      durable: health.objects_on_disk == null ? "—" : health.objects_on_disk,
      review: rq.manual_review_required == null ? "—" : rq.manual_review_required,
      oldest: ageMinutesLabel(rq.oldest_manual_review_minutes),
      unknown: rq.unknown_classification == null ? "—" : rq.unknown_classification
    };
    Object.keys(vals).forEach(function (k) { var e = page.querySelector('[data-d="' + k + '"]'); if (e) e.textContent = vals[k]; });
    var durableNote = page.querySelector('[data-d="durable-note"]');
    if (durableNote) {
      var indexed = health.indexed_ok;
      var unindexed = health.unindexed;
      var orphan = health.orphan_receipts;
      var hashMismatch = health.hash_mismatches;
      durableNote.textContent = "на диске: " + (health.objects_on_disk == null ? "—" : health.objects_on_disk) +
        " · индексировано: " + (indexed == null ? "—" : indexed) +
        " · не индексировано: " + (unindexed == null ? "—" : unindexed) +
        " · осиротевших расписок: " + (orphan == null ? "—" : orphan) +
        " · расхождений хэшей: " + (hashMismatch == null ? "—" : hashMismatch);
    }

    var evidenceBox = page.querySelector('[data-d="evidence-overview"]');
    if (evidenceBox) {
      function countOrNull(v) {
        if (v == null || v === "") return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
      }
      var manual = countOrNull(rq.manual_review_required);
      var op = countOrNull(rq.operational_evidence);
      var work = countOrNull(rq.working_reference);
      var canonical = countOrNull(rq.canonical_review);
      var canonicalActive = countOrNull(rq.canonical_review_active);
      var historical = countOrNull(rq.historical_testing_review);
      var unknown = countOrNull(rq.unknown_classification);
      var tests = allTests(testingSummary);
      var adjudication = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "NEEDS_ADJUDICATION"; });
      var rows = asArray(health.review_rows);
      var matched = null, matchedTest = null;
      for (var ai = 0; ai < adjudication.length && !matched; ai++) {
        var tid = String(adjudication[ai].test_id || "");
        matched = rows.filter(function (r) { return tid && String(r.test_id || "") === tid; })[0] || null;
        if (matched) matchedTest = adjudication[ai];
      }
      var roleParts = [op, work, canonical, unknown];
      var roleTotal = roleParts.every(function (v) { return v != null; }) ? roleParts.reduce(function (a, b) { return a + b; }, 0) : null;
      function shownCount(v) { return v == null ? "—" : v; }
      var authority = matched ? String(matched.review_authority_state || "") : "";
      var authorityRu = authority === "UNASSIGNED_REVIEW_QUARANTINE" ? "владелец разбора ещё не назначен" :
        (authority ? humanCode(authority) : "состояние полномочий не передано");
      evidenceBox.innerHTML =
        "<div class='doc-integrity-boundary'><b>Граница сохранности:</b><span>Hub сообщает " + esc(health.objects_on_disk == null ? "—" : health.objects_on_disk) + " объектов на диске, из них индексировано " + esc(health.indexed_ok == null ? "—" : health.indexed_ok) + ", не индексировано " + esc(health.unindexed == null ? "—" : health.unindexed) + ". Осиротевших расписок: " + esc(health.orphan_receipts == null ? "—" : health.orphan_receipts) + "; расхождений хэшей: " + esc(health.hash_mismatches == null ? "—" : health.hash_mismatches) + ". Наличие файла на диске не повышается до доказанного полного readback.</span></div>" +
        "<div class='doc-evidence-head'><div><small>КЛАССИФИКАЦИЯ НЕРАЗОБРАННОГО КОНТУРА</small><b>" + esc(roleTotal != null ? roleTotal : (rq.still_unreviewed == null ? "—" : rq.still_unreviewed)) + " артефактов распределены по роли</b></div><span>ручного разбора сейчас: <strong>" + esc(shownCount(manual)) + "</strong></span></div>" +
        "<div class='doc-role-grid'>" +
          "<div class='operational'><small>Операционные свидетельства</small><b>" + esc(shownCount(op)) + "</b><span>рабочий след; сам по себе не меняет канон</span></div>" +
          "<div class='working'><small>Рабочие ссылки</small><b>" + esc(shownCount(work)) + "</b><span>справочный материал</span></div>" +
          "<div class='canonical'><small>Канонический разбор</small><b>" + esc(shownCount(canonical)) + "</b><span>активны " + esc(shownCount(canonicalActive)) + " · исторические " + esc(shownCount(historical)) + "</span></div>" +
          "<div class='unknown'><small>Не классифицировано</small><b>" + esc(shownCount(unknown)) + "</b><span>нужен ручной разбор роли</span></div>" +
        "</div>" +
        (matched && matchedTest ?
          "<div class='doc-test-link'><div><small>ТОЧНАЯ СВЯЗЬ С ТЕКУЩЕЙ ПРОВЕРКОЙ</small><b>" + esc(matchedTest.test_id || "—") + "</b><span>Testing: " + esc(ruStatus(matchedTest.status)) + " · Hub: канонический разбор · ревизия " + esc(matched.revision != null ? matched.revision : "—") + "</span></div>" +
          "<div class='doc-test-state'><strong>" + esc(authorityRu) + "</strong><span>связь установлена только по точному test_id; доказательства прогона не приравниваются к принятию научного вывода</span></div></div>" :
          "<div class='doc-test-link calm'><div><small>СВЯЗЬ С ТЕКУЩЕЙ ПРОВЕРКОЙ</small><b>Нет точного совпадения test_id</b><span>Панель не связывает артефакты с тестом по названию или похожему тексту.</span></div></div>") +
        "<div class='doc-evidence-rule'>Ручная очередь = активный канонический разбор + неизвестная классификация. Исторические тестовые разборы не возвращаются в активную очередь автоматически.</div>";
    }
    var q = page.querySelector('[data-d="queue"]');
    if (q) {
      var rows = asArray(rq.oldest_5);
      q.innerHTML = rows.length ? rows.map(function (r) {
        var ageMin = r.received_at ? Math.max(0, Math.round((Date.now() - new Date(r.received_at).getTime()) / 60000)) : null;
        return "<div class='document-live-row'><b>" + esc(r.packet_file || "(событие без файла)") + "</b>" +
          "<span>" + esc(r.claimed_object_id || "не привязан") + "</span>" +
          "<span>" + esc(r.artifact_class === "CANONICAL_REVIEW" ? "канонический разбор" : (r.artifact_class === "UNKNOWN" ? "не классифицировано" : humanCode(r.artifact_class || "UNKNOWN"))) +
          (r.classification_reason ? "<small title='" + esc(r.classification_reason) + "'>" + esc(r.classification_reason === "not yet classified" ? "роль ещё не определена" : (r.classification_reason.indexOf("no explicit canonical/operational/working signal") === 0 ? "нет явного сигнала роли" : humanCode(r.classification_reason))) + "</small>" : "") +
          "</span><small>" + esc(ageMinutesLabel(ageMin)) + "</small></div>";
      }).join("") :
      "<div class='documents-empty compact'><strong>Ручного разбора сейчас нет</strong><span>Источник Hub ответил пустой очередью.</span></div>";
    }
    var oldestCard = page.querySelector('[data-d="oldest"]');
    if (oldestCard) {
      var card = oldestCard.closest(".card");
      var note = card && card.querySelector("span");
      if (note) note.textContent = "возраст старейшего пункта очереди ручного разбора; это не свежесть системы";
    }
    pageBadge("documents", "live", "ДАННЫЕ ПОДКЛЮЧЕНЫ");
  }

  function testTypesRu(value) {
    var map = {
      REPLICATION: "повторяемость", REGRESSION: "регрессия", BLIND_SCORING: "слепая оценка", BLIND_CODING: "слепое кодирование",
      ADVERSARIAL_STRESS: "стресс-тест", METHODOLOGY: "методология", SOURCE_INTEGRITY: "целостность источников",
      IMPLEMENTATION: "реализация", DATA_SOURCE_INTEGRITY: "целостность данных", RETROSPECTIVE_TEMPORAL_BLIND: "ретроспективный тест без временного порядка",
      FORECAST_CALIBRATION: "калибровка прогнозов", ADVERSARIAL_LEAKAGE_AUDIT: "проверка на утечку информации", BASELINE_COMPARISON: "сравнение с базовой моделью",
      MULTI_CLIENT_EVM: "проверка EVM на нескольких клиентах", CROSS_CASE: "межкейсовая проверка", GENEALOGY: "генеалогия",
      POSTHOC_MECHANISM_DIAGNOSTIC: "постфактум-диагностика механизма", WEIGHTING_DECOMPOSITION: "декомпозиция взвешивания"
    };
    return String(value || "").split(",").filter(Boolean).map(function (x) { return map[x] || humanCode(x); }).join(" · ") || "—";
  }

  function testOutcomeRu(value) {
    var raw = String(value == null ? "" : value).trim();
    var exact = {
      PROCEDURE_PASS: "процедура пройдена",
      DOMAIN_ADJUDICATION_REQUIRED: "нужен содержательный разбор владеющей ветки",
      IMPLEMENTATION_PARTIALLY_VERIFIED: "реализация подтверждена частично",
      INSUFFICIENT_EVIDENCE: "доказательств недостаточно",
      INCONCLUSIVE_DUE_TO_INTER_RATER_DISAGREEMENT: "нет окончательного вывода из-за расхождения кодировщиков",
      BLOCKED_SOURCE_CUSTODY_NOT_SCIENTIFIC_FAIL: "заблокировано из-за неполного пакета исходных материалов; это не научный провал",
      "v0.2 ROUTE-ATTRIBUTION REPAIR = SYNTHETIC MECHANICAL PASS": "v0.2: исправление атрибуции маршрута — синтетическая механическая проверка пройдена"
    };
    if (exact[raw]) return exact[raw];
    if (raw.indexOf("BLOCKED_SOURCE_CUSTODY:") === 0) return "заблокировано: не хватает исходных материалов для независимой проверки";
    return researchTextRu(humanCode(raw));
  }

  function renderTesting(summary, runner) {
    var page = document.querySelector('[data-page-panel="testing"]');
    if (!page) return;
    if (!sourceState.testingSummary.ok || !summary) {
      ["waiting", "active", "adjudication", "rerun"].forEach(function (k) {
        var e = page.querySelector('[data-t="' + k + '"]'); if (e) e.textContent = "Недоступно";
      });
      var q = page.querySelector('[data-t="queue"]');
      if (q) q.innerHTML = unavailableHTML("Testing summary недоступен", "Очередь проверок не подтверждена.");
      pageBadge("testing", "unavailable", "ИСТОЧНИК НЕДОСТУПЕН");
    } else {
      var tests = allTests(summary);
      var waiting = tests.filter(function (t) { return ["REQUESTED", "READY"].indexOf(String(t.status || "").toUpperCase()) >= 0; });
      var adj = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "NEEDS_ADJUDICATION"; });
      var rerun = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "RERUN_REQUIRED"; });
      var active = asArray(summary.active);

      [["waiting", waiting.length], ["active", active.length], ["adjudication", adj.length], ["rerun", rerun.length]].forEach(function (kv) {
        var e = page.querySelector('[data-t="' + kv[0] + '"]'); if (e) e.textContent = String(kv[1]);
      });

      var q = page.querySelector('[data-t="queue"]');
      if (q) {
        tests.sort(function (a, b) { return String(b.updated_at || "").localeCompare(String(a.updated_at || "")); });
        q.innerHTML = tests.length ? tests.slice(0, 10).map(function (t) {
          return "<div class='testing-live-row'><b>" + esc(t.test_id || "—") + "<small>" + esc(t.object_id || "не определён") + "</small></b>" +
            "<span>" + esc(t.owning_branch || "—") + "</span><span>" + esc(testTypesRu(t.test_type)) + "</span>" +
            "<em>" + esc(ruStatus(t.status)) + "</em><span>" + esc(testOutcomeRu(t.next_action || t.scientific_outcome || "—")) + "</span></div>";
        }).join("") :
        "<div class='testing-empty compact'><strong>Очередь пуста</strong><span>Testing summary ответил без тестов.</span></div>";
      }

      var focus = page.querySelector('[data-t="focus"]');
      if (focus) {
        var primary = adj[0] || null;
        if (primary) {
          var types = testTypesRu(primary.test_type).split(" · ");
          var evidenceN = asArray(primary.evidence_refs).length;
          var proc = testOutcomeRu(primary.procedure_status || "процедурный статус не передан");
          var outcome = testOutcomeRu(primary.scientific_outcome || "научный исход не передан");
          var next = researchTextRu(primary.delivery_next_action || primary.next_action || "следующий ход не передан");
          focus.innerHTML =
            "<div class='testing-focus-head'><div><small>РЕЗУЛЬТАТ ЖДЁТ СОДЕРЖАТЕЛЬНОГО РАЗБОРА</small><b>" + esc(primary.test_id || "проверка без ID") + "</b><span>" + esc(primary.owning_branch || "владеющая ветка не указана") + "</span></div><a href='#research'>Открыть исследования →</a></div>" +
            "<div class='testing-focus-chain'>" +
              "<div class='pass'><small>01 · Процедура</small><strong>" + esc(proc) + "</strong><span>техническое качество прогона</span></div>" +
              "<i>≠</i>" +
              "<div class='review'><small>02 · Научный исход</small><strong>" + esc(outcome) + "</strong><span>не повышается до PASS автоматически</span></div>" +
              "<i>→</i>" +
              "<div><small>03 · Следующий ход</small><strong>" + esc(next) + "</strong><span>решение остаётся у владеющей ветки</span></div>" +
            "</div>" +
            "<div class='testing-focus-meta'><span><small>Что проверялось</small><b>" + esc(types.join(" · ") || "—") + "</b></span><span><small>Доказательств прогона</small><b>" + esc(evidenceN) + " ссылок</b></span><span><small>Публикация результата</small><b>" + esc(primary.delivery_state ? researchTextRu(humanCode(primary.delivery_state)) : "—") + (primary.delivery_revision != null ? " · ревизия " + esc(primary.delivery_revision) : "") + "</b></span><span><small>Обновлено</small><b>" + esc(primary.updated_at ? ago(primary.updated_at) : "—") + "</b></span></div>" +
            "<div class='testing-focus-rule'>Процедурный PASS подтверждает исполнение протокола, а не исследовательскую гипотезу. До разбора владеющей веткой Панель сохраняет научный исход как незавершённый.</div>";
        } else {
          focus.innerHTML = "<div class='testing-focus-calm'><strong>Нет результатов, ожидающих содержательного разбора</strong><span>По текущему Testing summary состояние NEEDS_ADJUDICATION отсутствует.</span></div>";
        }
      }

      var att = page.querySelector('[data-t="attention"]');
      if (att) {
        var blocked = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "BLOCKED"; });
        var n = adj.length + rerun.length + blocked.length;
        att.innerHTML = "<div class='testing-attention-main'><span class='testing-signal-ring'>" + esc(n) + "</span><div><strong>" +
          (n ? "Есть проверки, требующие реакции" : "Нет тестов, требующих реакции") + "</strong><p>" +
          (n ? "Разбор: " + adj.length + " · повтор: " + rerun.length + " · заблокировано: " + blocked.length :
               "Текущая проекция не содержит NEEDS_ADJUDICATION, RERUN_REQUIRED или BLOCKED.") +
          "</p></div></div><div class='testing-attention-rule'>Техническое завершение прогона не становится автоматически научным выводом.</div>";
      }

      var recentBox = page.querySelector('[data-t="recent"]');
      if (recentBox) {
        var recent = asArray(summary.recent).slice(0, 6);
        recentBox.innerHTML = recent.length ? "<div class='testing-mini-list'>" + recent.map(function (t) {
          return "<div class='testing-mini-item'><b>" + esc(t.test_id || "—") + "</b><span>" +
            esc(testOutcomeRu(t.procedure_status || "процедура не указана")) + " · " + esc(testOutcomeRu(t.scientific_outcome || "научный исход не указан")) +
            " · " + esc(ago(t.updated_at)) + "</span></div>";
        }).join("") + "</div>" :
        "<div class='testing-empty compact'><strong>Завершённых результатов нет</strong><span>По текущему Testing summary.</span></div>";
      }

      var adjBox = page.querySelector('[data-t="adjudication-list"]');
      if (adjBox) {
        adjBox.innerHTML = adj.length ? "<div class='testing-mini-list'>" + adj.slice(0, 6).map(function (t) {
          return "<div class='testing-mini-item'><b>" + esc(t.test_id || "—") + "</b><span>" +
            esc(t.owning_branch || "владеющая ветка не указана") + " · " + esc(testOutcomeRu(t.scientific_outcome || "нужен разбор")) + "</span></div>";
        }).join("") + "</div>" :
        "<div class='testing-empty compact'><strong>Разбор сейчас не требуется</strong><span>Нет тестов в состоянии NEEDS_ADJUDICATION.</span></div>";
      }

      pageBadge("testing", sourceState.testingRunner.ok ? "live" : "warn", sourceState.testingRunner.ok ? "ДАННЫЕ ПОДКЛЮЧЕНЫ" : "ДАННЫЕ ЧАСТИЧНО");
    }

    var state = page.querySelector('[data-t="runner-state"]');
    var note = page.querySelector('[data-t="runner-note"]');
    var providers = page.querySelector('[data-t="runner-providers"]');
    var healthAt = page.querySelector('[data-t="runner-health-at"]');
    if (!sourceState.testingRunner.ok || !runner) {
      if (state) state.textContent = "Недоступно";
      if (note) note.textContent = "раннер не подтвердил состояние";
      if (providers) providers.textContent = "—";
      if (healthAt) healthAt.textContent = "—";
    } else {
      var names = Array.isArray(runner.providers)
        ? runner.providers.filter(function (p) { return runner[p + "_configured"]; })
        : Object.keys(runner).filter(function (k) { return /_configured$/.test(k) && runner[k]; }).map(function (k) { return k.replace(/_configured$/, ""); });
      if (state) state.textContent = "Раннер отвечает";
      if (note) note.textContent = "конфигурация прочитана; доступность внешних провайдеров этим не проверена";
      if (providers) providers.textContent = String(names.length);
      if (healthAt) healthAt.textContent = sourceState.testingRunner.at ? new Date(sourceState.testingRunner.at).toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"}) : "—";
    }
  }


  function researchObjectTitle(o) {
    var raw = String(o && (o.name || o.object_id) || "");
    var map = {
      "Twin / Synthetic Worlds Program": "Двойники / программа синтетических миров",
      "ICAM Research Program": "Исследовательская программа ICAM",
      "Scientific Reputation Engine / External Scientific Contour": "Научная репутация / внешний научный контур",
      "HSA — Corridors of the Possible: Economic Mobility": "HSA — «Коридоры возможного»: экономическая мобильность"
    };
    return map[raw] || raw;
  }

  function researchTextRu(value) {
    var raw = String(value == null ? "" : value).trim();
    var exact = {
      "founder adjudication completed — restricted signal accepted; weighting mechanism unresolved": "разбор Основателя завершён — ограниченный сигнал принят; механизм взвешивания не разрешён",
      "Founder chooses APPROVE, REJECT, or DEFER for GVF002A-2019-RUN-001.": "Требуется явное решение Основателя: одобрить, отклонить или отложить GVF002A-2019-RUN-001.",
      "Close four owning-branch identity slots, then run RD1-P2 safe portfolio sweep": "Закрыть четыре незавершённых слота идентичности владеющих веток, затем запустить безопасный портфельный проход RD1-P2.",
      "await acknowledgement or public-comment follow-up; continue publication-window sprint": "Ждать подтверждение или продолжение по публичному комментарию; продолжать работу в публикационном окне.",
      "Supply the complete authorized packet containing the execution lock, execution script, parent artifacts, and frozen source data before re-initiating the diagnostic test.": "Перед повторным диагностическим тестом передать полный разрешённый пакет: фиксацию запуска, сценарий выполнения, родительские артефакты и замороженные исходные данные.",
      "Flow Manager selects/implements convenient Continuity/Steward extraction + Founder outcome signal + Twin read-model synchronization with rebuilt Founder Panel; then return integration report and run server PTC-R0": "Flow Manager должен подключить извлечение Continuity/Steward, сигнал исхода решения Основателя и синхронизацию read-model Двойника с обновлённой Панелью; затем вернуть отчёт об интеграции и запустить серверный PTC-R0.",
      "Owning branch adjudication": "разбор владеющей ветки",
      "SYSTEM / Testing Governance": "система / управление тестированием",
      "Digital Institute / Research Registry": "Digital Institute / исследовательский реестр",
      "Owning branch reviews frozen outputs.": "Владеющая ветка разбирает замороженные результаты.",
      "PUBLISHED": "опубликовано",
      "active priority / foundation freeze / g0 amber": "приоритетное направление · основание заморожено · G0 amber",
      "published / public": "опубликовано · публично",
      "blocked single source pair a j364486": "заблокировано: единственная пара источников A/J364486",
      "Accepted a bounded methodological transfer from ATLAS-SS001 into Personal Twin runtime v0.3: Sensor Semantic Gate, Semantic Validity Clock, UNKNOWN/abstain on unidentified channels, prediction-exposure contamination guard/Observer Causal Footprint, minimum sufficient observability, and explicit experimental lineage. No SS001 synthetic accuracy or world-model claim is imported as human evidence.": "Принят ограниченный методологический перенос из ATLAS-SS001 в runtime Personal Twin v0.3: смысловой шлюз сенсоров, часы смысловой валидности, UNKNOWN/воздержание для неопознанных каналов, защита от загрязнения раскрытием прогноза и Observer Causal Footprint, минимально достаточная наблюдаемость и явное происхождение эксперимента. Синтетическая точность SS001 и утверждения о модели мира не переносятся как доказательства о людях.",
      "Founder approved bounded action: Orchestrator (CMP-000008) observed local route reach status=DONE: \"HSA — дочистить два тома и обновить публикацию\". Recommends recording this as a real observation on H008. Route remains Orchestrator's own local product memory either way -- this proposal does not promote it to canonical truth by itself, only Founder approval does.": "Основатель одобрил ограниченное действие: Оркестратор (CMP-000008) зафиксировал локальный статус маршрута DONE по задаче «HSA — дочистить два тома и обновить публикацию». Рекомендуется записать это как реальное наблюдение по H008. Сам маршрут остаётся локальной памятью продукта Оркестратора и не становится канонической истиной без отдельного подтверждения Основателя."
    };
    if (exact[raw]) return exact[raw];
    return projectionTextRu(raw);
  }

  function renderResearch(objectsResp, blockersResp, testingSummary, hubHealth, founderProjection) {
    var page = document.querySelector('[data-page-panel="research"]');
    if (!page) return Promise.resolve();
    if (!sourceState.objects.ok || !objectsResp) {
      pageBadge("research", "unavailable", "ИСТОЧНИК НЕДОСТУПЕН");
      ["active-count", "founder-count", "waiting-count", "identity-count"].forEach(function (k) {
        var e = page.querySelector('[data-r="' + k + '"]'); if (e) e.textContent = "Недоступно";
      });
      var lines = page.querySelector('[data-r="lines"]');
      if (lines) lines.innerHTML = unavailableHTML("Continuity objects недоступны", "Исследовательская карта очищена до нового успешного чтения.");
      sourceState.researchRD1 = { ok: false, at: new Date().toISOString(), error: "objects unavailable" };
      return Promise.resolve();
    }

    var items = asArray(objectsResp.items);
    var attempted = items.length;
    var successes = 0;
    var now = new Date().toISOString();

    return Promise.all(items.map(function (o) {
      var url = API + "/continuity/rd1-projection/" + encodeURIComponent(o.object_id || "");
      return fetch(url, { credentials: "same-origin", cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (p) { successes += 1; return p || { object_id: o.object_id, available: false }; })
        .catch(function () { return { object_id: o.object_id, available: false, __fetch_error: true }; });
    })).then(function (projections) {
      sourceState.researchRD1 = {
        ok: attempted === 0 ? true : successes > 0,
        at: now,
        error: successes === attempted ? null : (attempted - successes) + " projection read(s) failed"
      };

      var byId = {};
      projections.forEach(function (p) { if (p && p.object_id) byId[String(p.object_id)] = p; });
      if (lastSnapshot) lastSnapshot.rd1 = byId;

      // Research line exists only when the RD1 projection itself exposes meaningful semantics
      // or the canonical object explicitly declares a research status.
      var lines = items.filter(function (o) {
        var p = byId[String(o.object_id)] || {};
        var type = String(o.object_type || "").toLowerCase();
        var explicitResearch = /research|scientific/.test(type) || /RESEARCH/.test(String(o.declared_status || "").toUpperCase());
        var projected = p.available !== false && !!(p.stage || p.status || p.next_move || p.next_gate || p.semantic_freshness);
        return explicitResearch && projected;
      }).map(function (o) {
        return { object: o, projection: byId[String(o.object_id)] || {} };
      });

      var active = lines.filter(function (x) {
        return /^ACTIVE/.test(String(x.object.declared_status || x.projection.status || "").toUpperCase());
      });
      var founder = lines.filter(function (x) { return !!(x.object.needs_nika || x.object.needs_founder); });
      var formalDecisions = asArray(founderProjection && founderProjection.today && founderProjection.today.founder_decisions);
      var founderNote = page.querySelector('[data-r="founder-note"]');
      if (founderNote) founderNote.textContent = founder.length + " привязано к исследовательской линии" +
        (formalDecisions.length ? " · " + formalDecisions.length + " формальное решение без привязки к объекту" : "");
      var waiting = lines.filter(function (x) {
        var declared = String(x.object.declared_status || "").toUpperCase();
        var projected = String(x.projection.status || "").toUpperCase();
        var owner = String(x.projection.owner || "").toUpperCase();
        // Waiting is source-stated, not inferred from PREPARING/active design.
        return /PARKED|WAITING|AWAITING/.test(declared) || /PARKED|WAITING|AWAITING/.test(projected) || /EXTERNAL/.test(owner);
      });
      // Missing semantic_freshness is a freshness-observability gap, not identity debt.
      var noSemanticFreshness = lines.filter(function (x) { return !x.projection.semantic_freshness; });

      function put(k, v) { var e = page.querySelector('[data-r="' + k + '"]'); if (e) e.textContent = String(v); }
      put("active-count", active.length);
      put("founder-count", founder.length + (formalDecisions.length ? " + " + formalDecisions.length : ""));
      put("waiting-count", waiting.length);
      put("identity-count", noSemanticFreshness.length);

      var linesBox = page.querySelector('[data-r="lines"]');
      if (linesBox) {
        linesBox.innerHTML = lines.length ? lines.map(function (x) {
          var o = x.object, p = x.projection;
          var stageRaw = p.stage || "этап не указан";
          var nextRaw = p.next_gate || p.next_move || "не определён";
          return "<div class='research-live-row'><b>" + esc(researchObjectTitle(o)) +
            "<small>" + esc(o.object_id || "ID не определён") + "</small></b>" +
            "<span title='" + esc(stageRaw) + "'>" + esc(researchTextRu(humanCode(stageRaw))) + "</span>" +
            "<span>" + esc(researchTextRu(p.owner || "не назначен")) + "</span>" +
            "<span title='" + esc(nextRaw) + "'>" + esc(researchTextRu(humanCode(nextRaw))) + "</span>" +
            "<small>" + esc(researchTextRu(humanCode(ruStatus(p.status || o.declared_status || "—")))) + "</small></div>";
        }).join("") :
        "<div class='research-empty'><strong>Исследовательских линий в текущей RD1-проекции нет</strong><span>Continuity ответил, но ни один объект не удовлетворил явному research/RD1-контракту.</span></div>";
      }

      function mini(container, rows, emptyTitle, emptyText) {
        if (!container) return;
        container.innerHTML = rows.length ? "<div class='research-mini-list'>" + rows.join("") + "</div>" :
          "<div class='research-empty compact'><strong>" + esc(emptyTitle) + "</strong><span>" + esc(emptyText) + "</span></div>";
      }

      var founderAttentionRows = founder.slice(0, 6).map(function (x) {
        var o = x.object, p = x.projection;
        return "<div class='research-mini-item'><b>" + esc(researchObjectTitle(o)) + "</b><span>" +
          esc(researchTextRu(p.next_move || o.last_summary || "требуется решение")) + " · " + esc(o.object_id || "ID не определён") + "</span></div>";
      });
      formalDecisions.slice(0, Math.max(0, 6 - founderAttentionRows.length)).forEach(function (d) {
        founderAttentionRows.push("<div class='research-mini-item formal-unbound'><b>Формальное решение Основателя · без привязки к линии</b><span>" +
          esc(d.question || "Вопрос решения не передан") + (d.why_now ? " · " + esc(d.why_now) : "") +
          "</span><small>Founder Projection не передаёт object_id / memory_id. Панель не связывает решение с исследовательской линией по похожему тексту.</small></div>");
      });
      mini(page.querySelector('[data-r="attention"]'), founderAttentionRows,
        "Решений Основателя в исследовательском контуре нет", "Ни объектная/RD1-проекция, ни Founder Projection не передали текущего решения.");

      mini(page.querySelector('[data-r="waiting"]'), waiting.slice(0, 6).map(function (x) {
        var o = x.object, p = x.projection;
        return "<div class='research-mini-item'><b>" + esc(researchObjectTitle(o)) + "</b><span>" +
          "ждём: " + esc(researchTextRu(p.next_gate || p.next_move || "условие не описано")) + " · ход: " + esc(researchTextRu(p.owner || "не назначен")) + "</span></div>";
      }), "Линий в ожидании не найдено", "Нет явного PARKED / WAITING / AWAITING или внешнего владельца хода.");

      var MATERIAL = ["GATE_RESULT", "DECISION", "STATUS_CHANGE", "STAGE_CHANGE", "TEST_RESULT", "EXTERNAL_EVENT"];
      var material = lines.filter(function (x) {
        return MATERIAL.indexOf(String(x.object.last_meaning_kind || "").toUpperCase()) >= 0 && x.object.last_summary;
      }).sort(function (a, b) {
        return String(b.object.last_event_at || "").localeCompare(String(a.object.last_event_at || ""));
      });

      var bridge = page.querySelector('[data-r="system-bridge"]');
      if (bridge) {
        var tests = sourceState.testingSummary.ok ? allTests(testingSummary) : [];
        var adjudication = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "NEEDS_ADJUDICATION"; });
        var blockedTests = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "BLOCKED"; });
        var openTestStates = asArray(testingSummary && testingSummary.active);
        var rq = sourceState.hubHealth.ok && hubHealth ? (hubHealth.review_queue || {}) : {};
        var reviewN = rq.manual_review_required;
        var leadTest = adjudication[0] || blockedTests[0] || openTestStates[0] || null;
        var latest = material[0] || null;
        var testTitle = leadTest ? (leadTest.test_id || "проверка без ID") : "нет проверки, требующей реакции";
        var testNote = leadTest ? researchTextRu(humanCode(leadTest.scientific_outcome || leadTest.next_action || leadTest.status || "состояние не передано")) : "по текущему Testing summary";
        var latestTitle = latest ? researchObjectTitle(latest.object) : "материальных изменений нет";
        var latestNote = latest ? researchTextRu(latest.object.last_summary || latest.object.last_meaning_kind || "") : "по текущей RD1-проекции";
        bridge.innerHTML =
          "<div class='research-bridge-head'><div><small>ИССЛЕДОВАТЕЛЬСКИЙ ПУЛЬС</small><b>Вопрос → доказательство → независимая проверка → следующий переход</b></div><span>источники не смешиваются</span></div>" +
          "<div class='research-bridge-grid'>" +
          "<a href='#research' class='research-bridge-cell'><small>Портфель</small><strong>" + esc(active.length) + " объявлены активными</strong><span>" + esc(waiting.length) + " ждут условия · участие Основателя: " + esc(founder.length) + " привязано" + (formalDecisions.length ? " · " + esc(formalDecisions.length) + " формально без объектной связи" : "") + "</span></a>" +
          "<a href='#testing' class='research-bridge-cell " + (adjudication.length || blockedTests.length ? "attention" : "") + "'><small>Независимая проверка</small><strong>" + esc(openTestStates.length) + " открытых состояний · " + esc(adjudication.length) + " на разборе</strong><span>active[] не означает текущее исполнение · " + esc(testTitle) + " · " + esc(testNote) + "</span></a>" +
          "<a href='#research' class='research-bridge-cell'><small>Последнее материальное изменение</small><strong>" + esc(latestTitle) + "</strong><span>" + esc(cut(latestNote, 120)) + (latest ? " · " + esc(ago(latest.object.last_event_at)) : "") + "</span></a>" +
          "<a href='#documents' class='research-bridge-cell'><small>Доказательный контур компании</small><strong>" + esc(reviewN == null ? "нет счётчика" : reviewN + " на ручном разборе") + "</strong><span>общесистемная очередь Hub; не приписывается исследованию без связи с объектом</span></a>" +
          "</div><div class='research-bridge-rule'>Панель не превращает завершённый прогон в научный вывод и не считает общую очередь документов доказательствами конкретной исследовательской линии без явной связи.</div>";
      }

      mini(page.querySelector('[data-r="result"]'), material.slice(0, 5).map(function (x) {
        var o = x.object;
        return "<div class='research-mini-item'><b>" + esc(researchObjectTitle(o)) + "</b><span>" +
          esc(researchTextRu(o.last_summary)) + " · " + esc(o.last_meaning_kind || "изменение") + " · " + esc(ago(o.last_event_at)) + "</span></div>";
      }), "Существенного результата не найдено", "Нет материального GATE_RESULT / DECISION / STATUS_CHANGE / STAGE_CHANGE / TEST_RESULT / EXTERNAL_EVENT.");

      var nextGates = lines.filter(function (x) { return !!x.projection.next_gate; });
      mini(page.querySelector('[data-r="next-gates"]'), nextGates.slice(0, 6).map(function (x) {
        return "<div class='research-mini-item'><b>" + esc(researchObjectTitle(x.object)) + "</b><span>" +
          esc(researchTextRu(x.projection.next_gate)) + " · следующий ход: " + esc(researchTextRu(x.projection.next_move || "не указан")) + "</span></div>";
      }), "Следующая проверка не определена", "Ни одна текущая RD1-проекция не отдала next_gate.");

      mini(page.querySelector('[data-r="changes"]'), material.slice(0, 6).map(function (x) {
        var o = x.object;
        return "<div class='research-mini-item'><b>" + esc(o.object_id || "ID не определён") + " · " + esc(researchObjectTitle(o)) + "</b><span>" +
          esc(researchTextRu(o.last_summary)) + " · " + esc(ago(o.last_event_at)) + "</span></div>";
      }), "Материальных изменений нет", "Текущая проекция не содержит материальных событий по исследовательским линиям.");

      var blockersOk = sourceState.blockers.ok;
      pageBadge("research",
        sourceState.researchRD1.ok ? (blockersOk ? "live" : "warn") : "unavailable",
        sourceState.researchRD1.ok ? (blockersOk ? "ДАННЫЕ ПОДКЛЮЧЕНЫ" : "ДАННЫЕ ЧАСТИЧНО") : "RD1-ПРОЕКЦИЯ НЕДОСТУПНА"
      );
    });
  }



  function renderFoundation(health, hub, objectsResp, inbox) {
    var page = document.querySelector('[data-page-panel="foundation"]');
    if (!page) return;

    var healthOk = sourceState.continuityHealth.ok && health;
    var hubOk = sourceState.hubHealth.ok && hub;
    var objectsOk = sourceState.objects.ok && objectsResp;
    var inboxOk = sourceState.inbox.ok && inbox;

    function put(k, v) {
      var e = page.querySelector('[data-fnd="' + k + '"]');
      if (e) e.textContent = String(v);
    }

    put("readiness", (healthOk || hubOk || objectsOk) ? "Не доказано" : "Недоступно");
    put("continuity", !healthOk ? "Недоступно" : (health.ok === false ? "Деградация" : "Доступен"));
    put("recovery", "Не подтверждено");

    var systemOpen = null;
    if (healthOk && health.system_attention_open != null) systemOpen = health.system_attention_open;
    else if (inboxOk && inbox.summary && inbox.summary.system_attention != null) systemOpen = inbox.summary.system_attention;
    put("system", systemOpen == null ? "—" : systemOpen);

    var readiness = page.querySelector('[data-fnd="readiness-card"]');
    if (readiness) {
      var state = !healthOk && !hubOk && !objectsOk ? "Источники основания недоступны" : "Полная готовность основания не доказана";
      readiness.innerHTML =
        "<div class='foundation-source-summary warn'><strong>" + esc(state) + "</strong>" +
        "<p>Панель подтверждает отдельные read-состояния Continuity и Hub, но не имеет единого источника, " +
        "который одновременно доказывает recovery/readback, целостность полномочий и полный Foundation readiness. " +
        "Поэтому зелёный PASS здесь не выводится.</p></div>";
    }

    var attention = page.querySelector('[data-fnd="attention"]');
    if (attention) {
      if (systemOpen == null) {
        attention.innerHTML = unavailableHTML("SYSTEM-вопросы не подтверждены", "Continuity health / Входящие Основателя не дали текущего счётчика.");
      } else if (Number(systemOpen) === 0) {
        attention.innerHTML =
          "<div class='foundation-source-summary'><strong>0 открытых SYSTEM-вопросов по Continuity</strong>" +
          "<p>Это подтверждает только текущий счётчик Continuity health и не является доказательством общей готовности Foundation.</p></div>";
      } else {
        attention.innerHTML =
          "<div class='foundation-source-summary bad'><strong>" + esc(systemOpen) + " SYSTEM-вопрос(ов) требуют разбора</strong>" +
          "<p>Источник подтверждает количество, но не даёт этому экрану права придумывать подробности инцидентов.</p></div>";
      }
    }

    var continuity = page.querySelector('[data-fnd="backbone-continuity"]');
    if (continuity) {
      if (!healthOk) continuity.innerHTML = unavailableHTML("Continuity health недоступен", "Операционная истина не получила подтверждённого health-read.");
      else continuity.innerHTML =
        "<div class='foundation-live-list'>" +
        "<div class='foundation-live-item'><b>Health endpoint</b><span>" + (health.ok === false ? "сообщает о деградации" : "ответил успешно") + "</span></div>" +
        "<div class='foundation-live-item'><b>Системное внимание</b><span>" + esc(systemOpen == null ? "не указано" : systemOpen) + "</span></div></div>";
    }

    var durability = page.querySelector('[data-fnd="backbone-durability"]');
    if (durability) {
      if (!hubOk) durability.innerHTML = unavailableHTML("Hub / Durability недоступен", "Нет подтверждённого чтения sync-health.");
      else {
        var rq = hub.review_queue || {};
        durability.innerHTML =
          "<div class='foundation-live-list'>" +
          "<div class='foundation-live-item'><b>Durable / indexed</b><span>" + esc(hub.objects_on_disk == null ? "—" : hub.objects_on_disk) + " объектов на диске</span></div>" +
          "<div class='foundation-live-item'><b>Ручной разбор</b><span>" + esc(rq.manual_review_required == null ? "—" : rq.manual_review_required) + "</span></div>" +
          "<div class='foundation-live-item'><b>Граница доказательства</b><span>sync-health не доказывает сам по себе byte-for-byte readback/recovery PASS.</span></div></div>";
      }
    }

    var approval = page.querySelector('[data-fnd="backbone-approval"]');
    if (approval) {
      if (!inboxOk) approval.innerHTML = unavailableHTML("Входящие Основателя недоступны", "Наличие или отсутствие Founder-only решений не подтверждено.");
      else {
        var nf = Array.isArray(inbox.needs_founder) ? inbox.needs_founder.length : 0;
        approval.innerHTML =
          "<div class='foundation-live-list'>" +
          "<div class='foundation-live-item'><b>Решения уровня Основателя</b><span>" + esc(nf) + " в текущем inbox</span></div>" +
          "<div class='foundation-live-item'><b>Граница доказательства</b><span>inbox подтверждает очередь решений, но не является аудитом всей A0/A1/A2 authority chain.</span></div></div>";
      }
    }

    var projection = page.querySelector('[data-fnd="backbone-projection"]');
    if (projection) {
      var names = ["routes","summary","metrics","inbox","objects","blockers","testingSummary","testingHealth","testingRunner","hubHealth","continuityHealth"];
      var ok = names.filter(function (k) { return sourceState[k] && sourceState[k].ok; }).length;
      projection.innerHTML =
        "<div class='foundation-live-list'>" +
        "<div class='foundation-live-item'><b>Текущий цикл чтения</b><span>" + esc(ok) + "/" + esc(names.length) + " известных базовых GET-проекций ответили</span></div>" +
        "<div class='foundation-live-item'><b>Граница доказательства</b><span>успешный fetch не доказывает семантическую корректность всего источника.</span></div></div>";
    }

    var durableDetail = page.querySelector('[data-fnd="durability-detail"]');
    if (durableDetail) {
      if (!hubOk) durableDetail.innerHTML = unavailableHTML("Durability read-model недоступен", "Ни запись, ни обратное чтение не объявляются успешными по отсутствию ошибки на экране.");
      else {
        var rq2 = hub.review_queue || {};
        durableDetail.innerHTML =
          "<div class='foundation-live-list'>" +
          "<div class='foundation-live-item'><b>Сохранено / индексировано</b><span>" + esc(hub.objects_on_disk == null ? "—" : hub.objects_on_disk) + "</span></div>" +
          "<div class='foundation-live-item'><b>Неизвестная классификация</b><span>" + esc(rq2.unknown_classification == null ? "—" : rq2.unknown_classification) + "</span></div>" +
          "<div class='foundation-live-item'><b>Byte-for-byte readback</b><span>отдельный подтверждённый контракт в v2 пока не подключён</span></div></div>";
      }
    }

    var change = page.querySelector('[data-fnd="last-change"]');
    if (change) {
      if (!objectsOk) change.innerHTML = unavailableHTML("Continuity objects недоступны", "Последнее изменение Foundation не выводится из истории чата.");
      else {
        var fnd = asArray(objectsResp.items).find(function (o) { return String(o.object_id || "") === "FND-001"; });
        if (!fnd) change.innerHTML =
          "<div class='foundation-source-summary warn'><strong>FND-001 не найден в текущей object projection</strong><p>Панель не подставляет другой объект по имени или сходству.</p></div>";
        else change.innerHTML =
          "<div class='foundation-live-list'><div class='foundation-live-item'><b>" + esc(fnd.name || "FND-001") + "</b>" +
          "<span>" + esc(fnd.last_summary || "последнее summary не указано") + "</span>" +
          "<small>FND-001 · " + esc(ruStatus(fnd.declared_status || "—")) + " · " + esc(ago(fnd.last_event_at)) + "</small></div></div>";
      }
    }

    var any = healthOk || hubOk || objectsOk || inboxOk;
    pageBadge("foundation", any ? "warn" : "unavailable",
      any ? "ЧАСТИЧНЫЕ ДАННЫЕ · ОБЩАЯ ГОТОВНОСТЬ НЕ ДОКАЗАНА" : "ИСТОЧНИКИ НЕДОСТУПНЫ");
  }

  function signalKindRu(kind) {
    var m = {
      GATE_RESULT:"Результат гейта",
      DECISION:"Решение",
      STATUS_CHANGE:"Изменение статуса",
      STAGE_CHANGE:"Изменение этапа",
      TEST_RESULT:"Результат проверки",
      EXTERNAL_EVENT:"Внешнее событие",
      NEW_FILE:"Новый артефакт"
    };
    return m[String(kind || "").toUpperCase()] || "Материальное изменение";
  }

  function renderSignals(objectsResp, blockersResp, inbox, testingSummary, marketSignals, organizationalIntelligence) {
    var page = document.querySelector('[data-page-panel="signals"]');
    if (!page) return;

    var objectsOk = sourceState.objects.ok && objectsResp;
    var blockersOk = sourceState.blockers.ok && blockersResp;
    var inboxOk = sourceState.inbox.ok && inbox;
    var testingOk = sourceState.testingSummary.ok && testingSummary;

    function put(k, value) {
      var e = page.querySelector('[data-s="' + k + '"]');
      if (e) e.textContent = String(value);
    }

    var founderItems = inboxOk && Array.isArray(inbox.needs_founder) ? inbox.needs_founder : [];
    var MATERIAL = ["GATE_RESULT", "DECISION", "STATUS_CHANGE", "STAGE_CHANGE", "TEST_RESULT", "EXTERNAL_EVENT", "NEW_FILE"];
    var changes = objectsOk ? asArray(objectsResp.items).filter(function (o) {
      var objectType = String(o.object_type || "").toUpperCase();
      var declared = String(o.declared_status || "").toUpperCase();
      var isTestFixture = objectType === "TEST" || declared === "TEST";
      return !isTestFixture && MATERIAL.indexOf(String(o.last_meaning_kind || "").toUpperCase()) >= 0 &&
             !!(o.last_summary || o.name || o.object_id);
    }).sort(function (a, b) {
      return String(b.last_event_at || "").localeCompare(String(a.last_event_at || ""));
    }) : [];

    var blockers = blockersOk ? asArray(blockersResp.items).filter(function (b) {
      return !b.is_test && String(b.status || "").toUpperCase() !== "CLEARED";
    }) : [];

    var riskyTests = testingOk ? allTests(testingSummary).filter(function (t) {
      return ["BLOCKED", "RERUN_REQUIRED"].indexOf(String(t.status || "").toUpperCase()) >= 0;
    }) : [];

    put("founder", inboxOk ? founderItems.length : "Недоступно");
    put("changes", objectsOk ? changes.length : "Недоступно");
    var riskKnown = blockers.length + riskyTests.length;
    var riskComplete = blockersOk && testingOk;
    put("risks", riskComplete ? riskKnown : ((blockersOk || testingOk) ? "≥ " + riskKnown : "Недоступно"));
    put("risks-detail", riskComplete ?
      (blockers.length + " открытых записей Continuity без оценки тяжести · " + riskyTests.length + " тест(а) BLOCKED/RERUN") :
      ((blockersOk || testingOk) ?
        ((blockersOk ? blockers.length + " Continuity" : "Continuity недоступен") + " · " + (testingOk ? riskyTests.length + " Testing" : "Testing недоступен") + " · итог неполный") :
        "источники недоступны"));
    var msKpiOk = sourceState.marketSignals.ok && marketSignals;
    var msSignals = msKpiOk ? asArray(marketSignals.signals) : [];
    var msCoverage = msKpiOk ? (marketSignals.source_coverage || {}) : {};
    put("opportunities", msKpiOk ? msSignals.length : "Недоступно");
    var marketKpiNote = page.querySelector('[data-s="market-kpi-note"]');
    if (marketKpiNote) {
      if (!msKpiOk) marketKpiNote.textContent = "внешний сигнальный источник сейчас недоступен";
      else if (msCoverage.total_sources != null) marketKpiNote.textContent = "показано из хранилища · текущее покрытие " + Number(msCoverage.ok_count || 0) + "/" + Number(msCoverage.total_sources || 0) + " источников";
      else marketKpiNote.textContent = "сохранённые внешние наблюдения; текущее покрытие не подтверждено";
    }

    var founderBox = page.querySelector('[data-s="founder-list"]');
    if (founderBox) {
      if (!inboxOk) {
        founderBox.innerHTML = unavailableHTML("Входящие Основателя недоступны", "Панель не может подтвердить, есть ли сейчас запросы на ваше участие.");
      } else if (!founderItems.length) {
        founderBox.innerHTML = "<div class='signals-empty compact'><strong>Сейчас запросов на ваше участие нет</strong><span>Текущие Входящие Основателя не содержат `needs_founder`.</span></div>";
      } else {
        founderBox.innerHTML = "<div class='signals-live-list'>" + founderItems.slice(0, 6).map(function (x) {
          return "<div class='signals-live-item attention'><b>Запрос к Основателю</b>" +
            "<span>" + esc(x.object_id || "объект не указан") + "</span>" +
            "<small>Входящие Основателя · " + esc(ago(x.opened_at || x.created_at || x.updated_at)) + "</small></div>";
        }).join("") + "</div>";
      }
    }

    var changesBox = page.querySelector('[data-s="changes-list"]');
    if (changesBox) {
      if (!objectsOk) {
        changesBox.innerHTML = unavailableHTML("Continuity objects недоступны", "Материальные изменения не выводятся из прошлых данных.");
      } else if (!changes.length) {
        changesBox.innerHTML = "<div class='signals-empty compact'><strong>Материальных изменений нет в текущей проекции</strong><span>Ни один объект не содержит последнего события разрешённого материального типа.</span></div>";
      } else {
        changesBox.innerHTML = "<div class='signals-live-list'>" + changes.slice(0, 8).map(function (o) {
          return "<div class='signals-live-item change'><b>" + esc(o.name || o.object_id || "Изменение") + "</b>" +
            "<span>" + esc(signalKindRu(o.last_meaning_kind)) + "</span>" +
            "<small>" + esc(o.object_id || "ID не указан") + " · " + esc(ago(o.last_event_at)) + "</small></div>";
        }).join("") + "</div>";
      }
    }

    var risksBox = page.querySelector('[data-s="risks-list"]');
    if (risksBox) {
      if (!blockersOk && !testingOk) {
        risksBox.innerHTML = unavailableHTML("Источники риска недоступны", "Панель не вычисляет собственный риск без подтверждённого источника.");
      } else {
        var rows = blockers.slice(0, 6).map(function (b) {
          return "<div class='signals-live-item risk'><b>Открытая запись блокера</b>" +
            "<span>" + esc(b.object_id || "объект не указан") + " · " + esc(ruStatus(b.status || "OPEN")) + "</span>" +
            "<small>Continuity · источник не передал оценку тяжести; наличие OPEN-записи не означает автоматически критический риск</small></div>";
        });
        riskyTests.slice(0, 6).forEach(function (t) {
          rows.push("<div class='signals-live-item risk'><b>" + esc(t.test_id || "Проверка") + "</b>" +
            "<span>" + esc(t.owning_branch || "владеющая ветка не указана") + " · " + esc(ruStatus(t.status)) + "</span>" +
            "<small>Testing · " + esc(t.blocker || t.next_action || "нужна реакция владеющей ветки") + "</small></div>");
        });
        if (rows.length) {
          risksBox.innerHTML = "<div class='signals-live-list'>" + rows.join("") + "</div>" +
            (!riskComplete ? "<div class='signals-partial-note warn'>Показаны только доступные источники; полный контур риска сейчас не подтверждён.</div>" : "");
        } else if (!riskComplete) {
          risksBox.innerHTML = unavailableHTML("Контур риска прочитан частично",
            "Доступный источник не содержит BLOCKED/RERUN или открытых блокеров, но второй источник недоступен — нулевой общий риск не подтверждён.");
        } else {
          risksBox.innerHTML = "<div class='signals-empty compact'><strong>Открытых записей блокеров сейчас нет</strong><span>Текущие Continuity blockers и Testing summary не содержат открытых нетестовых блокеров, BLOCKED или RERUN_REQUIRED.</span></div>";
        }
      }
    }

    function marketSignalStateRu(value) {
      var raw = String(value || "").trim().toLowerCase();
      var m = { watch: "наблюдать", opportunity: "возможность", act: "требует действия", monitor: "наблюдать", blocked: "заблокировано" };
      return m[raw] || (raw ? humanCode(raw) : "статус не указан");
    }

    function marketCardHTML(sig) {
      var enr = sig.enrichment;
      var summaryRu = (enr && enr.summary_ru) || sig.summary_ru || "";
      var whyRu = (enr && enr.why_it_matters_ru) || sig.why_it_matters_ru || "";
      var axes = Array.isArray(sig.axis) ? sig.axis : [];
      var evidence = Array.isArray(sig.evidence) ? sig.evidence : [];
      var sourceName = (sig.source && (sig.source.name || sig.source.url)) || "источник не указан";
      var sourceUrl = sig.source && sig.source.url;
      var sigIdAttr = esc(sig.signal_id || "");
      // Read-only inspector: exactly the source/evidence the signal already
      // carries, nothing computed or invented. Collapsed by default; toggled
      // inline, no drawer/panel framework needed for one small block.
      var drawerBody = "<div class='market-card-drawer-body'>" +
        "<div class='market-card-drawer-row'><span>Источник</span><b>" + esc((sig.source && sig.source.name) || "—") + "</b></div>" +
        "<div class='market-card-drawer-row'><span>Адрес источника</span><b>" + (sourceUrl ? esc(sourceUrl) : "—") + "</b></div>" +
        "<div class='market-card-drawer-row'><span>Свидетельства (" + esc(evidence.length) + ")</span></div>" +
        (evidence.length ?
          "<ul class='market-card-evidence-list'>" + evidence.map(function (e) {
            return "<li>" + esc(typeof e === "string" ? e : JSON.stringify(e)) + "</li>";
          }).join("") + "</ul>" :
          "<div class='market-card-drawer-row'><span>Свидетельства в сигнале не переданы</span></div>") +
        "</div>";
      return "<div class='signals-live-item change market-card' data-market-card='" + sigIdAttr + "'>" +
        "<div class='market-card-head'><b>" + esc(sig.entity || "Источник не указан") + "</b>" +
        "<span class='market-card-type'>" + esc(sig.signal_type || "тип не указан") + "</span>" +
        "<span class='market-card-relevance'>релевантность " + esc(sig.relevance_score != null ? sig.relevance_score : "—") + "</span></div>" +
        "<p class='market-card-title'>" + esc(cut(sig.title || "", 140)) + "</p>" +
        (summaryRu ? "<p class='market-card-summary'>" + esc(summaryRu) + "</p>" : "") +
        (whyRu ? "<p class='market-card-why'>" + esc(whyRu) + "</p>" : "") +
        "<div class='market-card-meta'>" +
        (axes.length ? "<span>" + esc(axes.join(", ")) + "</span>" : "") +
        "<span>свидетельств: " + esc(evidence.length) + "</span>" +
        "<span>" + esc(sourceName) + "</span>" +
        "<span>" + esc(ago(sig.observed_at)) + "</span>" +
        "<span>" + esc(marketSignalStateRu((enr && enr.recommended_action) || sig.status)) + "</span>" +
        "</div>" +
        "<button type='button' class='market-card-drawer-toggle' data-drawer-toggle>источник / свидетельства ▾</button>" +
        "<div class='market-card-drawer' data-drawer-body hidden>" + drawerBody + "</div>" +
        "</div>";
    }

    function wireMarketCardDrawers(container) {
      var toggles = container.querySelectorAll("[data-drawer-toggle]");
      toggles.forEach(function (btn) {
        btn.addEventListener("click", function () {
          var card = btn.closest(".market-card");
          var body = card && card.querySelector("[data-drawer-body]");
          if (!body) return;
          var willOpen = body.hidden;
          body.hidden = !willOpen;
          btn.textContent = willOpen ? "источник / свидетельства ▴" : "источник / свидетельства ▾";
        });
      });
    }

    var opportunitiesBox = page.querySelector('[data-s="opportunities-list"]');
    if (opportunitiesBox) {
      var msOk = sourceState.marketSignals.ok && marketSignals;
      var activation = msOk ? marketSignals.activation_state : null;
      var coverage = msOk ? marketSignals.source_coverage : null;
      var coverageNote = "";
      if (coverage) {
        var kdCount = (coverage.failing || []).filter(function (f) { return f.known_degraded; }).length;
        var freshCount = (coverage.failing || []).length - kdCount;
        var covOk = Number(coverage.ok_count || 0), covTotal = Number(coverage.total_sources || 0);
        var degraded = String(coverage.status || "").indexOf("DEGRADED") === 0 || (covTotal && covOk < covTotal);
        coverageNote = "<div class='signals-partial-note market-coverage-note" + (degraded ? " warn" : "") + "'>Текущее покрытие внешних источников: <b>" +
          esc(covOk) + " / " + esc(covTotal) + "</b>" +
          (kdCount ? " · известных деградаций " + esc(kdCount) : "") +
          (freshCount ? " · <b>необъяснённых сбоев " + esc(freshCount) + "</b>" : "") +
          (degraded ? "<br><span>Карточки ниже — уже сохранённые наблюдения. Они не доказывают, что соответствующий внешний источник доступен сейчас.</span>" : "") + "</div>";
      }

      if (!msOk) {
        opportunitiesBox.innerHTML =
          "<div class='signals-empty compact'><strong>Market Scanner недоступен</strong>" +
          "<span>Источник не ответил. Панель не подменяет его старыми данными.</span></div>";
      } else if (activation === "NOT_ACTIVATED") {
        opportunitiesBox.innerHTML =
          "<div class='signals-empty compact'><strong>Поток рыночных сигналов ещё не активирован</strong>" +
          "<span>" + esc(marketSignals.degraded_reason || "Flow не активирован.") + "</span></div>" + coverageNote;
      } else if (activation === "ACTIVATED_EMPTY") {
        opportunitiesBox.innerHTML =
          "<div class='signals-empty compact'><strong>В хранилище нет новых сигналов</strong>" +
          "<span>Поток активирован, но текущее состояние внешнего покрытия оценивается отдельно ниже.</span></div>" + coverageNote;
      } else {
        var msRows = (marketSignals.signals || []).slice(0, 6).map(marketCardHTML).join("");
        opportunitiesBox.innerHTML = (msRows ?
          "<div class='signals-live-list'>" + msRows + "</div>" :
          "<div class='signals-empty compact'><strong>Поток активирован, сохранённых сигналов пока нет</strong><span>Текущее состояние внешних источников показано отдельно и не выводится из факта активации потока.</span></div>")
          + coverageNote;
        if (msRows) wireMarketCardDrawers(opportunitiesBox);
      }
    }

    var orgBox = page.querySelector('[data-s="org-observations"]');
    if (orgBox) {
      var oiOk = sourceState.organizationalIntelligence.ok && organizationalIntelligence;
      var oiClass = {
        DEPENDENCY_CONCENTRATION_CANDIDATE: "Концентрация использования капитала",
        COMPOUNDING_LOOP: "Повторное использование капитала",
        CANONICAL_ROUTE_GAP: "Разрыв канонического маршрута",
        FOUNDER_AUTHORITY_GATE: "Шлюз полномочий Основателя"
      };
      var oiSubjects = {
        "Founder approval required: authorize the already-frozen GVF-002A 2019 run of 120 isolated forecasts. Preflight PASS; 0/120 forecast calls executed.": "Нужно решение Основателя: разрешить уже замороженный прогон GVF-002A 2019 из 120 изолированных прогнозов. Предварительная проверка пройдена; выполнено 0 из 120 прогнозных вызовов.",
        "Commercial audit case experience": "Опыт коммерческих аудитов",
        "Historical market learning": "Накопленное рыночное обучение",
        "Public proof assets": "Материалы публичного доказательства",
        "External validation protocols": "Протоколы внешней валидации",
        "Institutional opportunity learning": "Опыт по институциональным возможностям"
      };
      var oiCeilings = {
        "Concentration of recorded use only; not evidence of fragility, value, or risk.": "Зафиксирована только концентрация использования; это не доказательство хрупкости, ценности или риска.",
        "Recorded reuse across multiple lines; does not establish causal performance improvement.": "Зафиксировано повторное использование в нескольких линиях; это не доказывает причинное улучшение результата.",
        "Recorded capital-route gap only; no inference about business quality or urgency.": "Зафиксирован только разрыв между капиталом и каноническим маршрутом; выводов о качестве бизнеса или срочности нет.",
        "Current OPEN Founder Decision Lifecycle only.": "Только текущий открытый жизненный цикл решения Основателя."
      };
      if (!oiOk) {
        orgBox.innerHTML = unavailableHTML("Organizational Intelligence недоступен", "Структурные наблюдения не восстанавливаются по косвенным данным.");
      } else {
        var oiSignals = Array.isArray(organizationalIntelligence.signals) ? organizationalIntelligence.signals : [];
        var oiRows = oiSignals.map(function (sig) {
          var cls = oiClass[sig.class] || humanCode(sig.class || "наблюдение");
          var subj = oiSubjects[sig.subject] || sig.subject || "объект не указан";
          var lines = Array.isArray(sig.affected_lines) ? sig.affected_lines : [];
          var ceiling = oiCeilings[sig.evidence_ceiling] || sig.evidence_ceiling || "доказательный потолок не передан";
          return "<div class='signals-live-item " + (sig.founder_action_required ? "attention" : "change") + "'><b>" + esc(cls) + "</b>" +
            "<span>" + esc(subj) + "</span><small>" +
            (lines.length ? "затронутые линии: " + esc(lines.join(" · ")) + " · " : "") + esc(ceiling) + "</small></div>";
        });
        orgBox.innerHTML = oiRows.length ? "<div class='signals-partial-note'>" + esc(oiSignals.length) + " наблюдений · источник не превращает их в рейтинг риска или приоритета</div><div class='signals-live-list'>" + oiRows.join("") + "</div>" :
          "<div class='signals-empty compact'><strong>Структурных наблюдений сейчас нет</strong><span>Источник доступен и вернул пустой список.</span></div>";
      }
    }

    var watchBox = page.querySelector('[data-s="watch-list"]');
    if (watchBox) {
      watchBox.innerHTML =
        "<div class='signals-empty compact'><strong>Полка «Наблюдать» не формируется автоматически</strong>" +
        "<span>Без явной классификации WATCH / наблюдать Панель не понижает важность события по собственной эвристике.</span></div>";
    }

    var hero = page.querySelector('[data-s="hero"]');
    if (hero) {
      var heroRows = [];
      founderItems.slice(0, 2).forEach(function (x) {
        heroRows.push("<div class='signals-live-item attention'><b>Запрос к Основателю</b>" +
          "<span>" + esc(x.object_id || "объект не указан") + "</span><small>Founder inbox · запрос на участие</small></div>");
      });
      blockers.slice(0, 2).forEach(function (b) {
        heroRows.push("<div class='signals-live-item risk'><b>Открытая запись блокера</b>" +
          "<span>" + esc(b.object_id || "объект не указан") + "</span><small>Continuity подтверждает OPEN · тяжесть источником не передана</small></div>");
      });
      changes.slice(0, 2).forEach(function (o) {
        heroRows.push("<div class='signals-live-item change'><b>" + esc(o.name || o.object_id || "Изменение") + "</b>" +
          "<span>" + esc(signalKindRu(o.last_meaning_kind)) + "</span><small>" + esc(ago(o.last_event_at)) + "</small></div>");
      });
      if (!objectsOk && !blockersOk && !inboxOk) {
        hero.innerHTML = unavailableHTML("Внутренние источники сигналов недоступны", "Панель не сохраняет старую ленту как текущую.");
      } else if (!heroRows.length) {
        hero.innerHTML = "<div class='signals-empty hero'><strong>По текущим внутренним источникам сигналов для этого блока нет</strong><p>Это ничего не говорит о состоянии внешнего рынка. Внешнее наблюдение и текущее покрытие Scanner показываются отдельно ниже.</p></div>";
      } else {
        hero.innerHTML = "<div class='signals-live-list'>" + heroRows.join("") + "</div>" +
          "<div class='signals-partial-note'>Между типами сигналов Панель не строит собственный рейтинг. OPEN-запись блокера не повышается до критического риска без оценки источника. Внешнее наблюдение показано отдельно ниже.</div>";
      }
    }

    var anyInternal = objectsOk || blockersOk || inboxOk || testingOk;
    var msBadgeOk = sourceState.marketSignals.ok && marketSignals;
    var cov = msBadgeOk ? (marketSignals.source_coverage || {}) : {};
    var covTotal = Number(cov.total_sources || 0), covOk = Number(cov.ok_count || 0);
    var covDegraded = covTotal > 0 && covOk < covTotal;
    var externalText = !msBadgeOk ? "ВНЕШНИЙ СИГНАЛЬНЫЙ ИСТОЧНИК НЕДОСТУПЕН" :
      (marketSignals.activation_state === "NOT_ACTIVATED" ? "ВНЕШНИЙ ПОТОК НЕ АКТИВИРОВАН" :
        (covTotal ? "ВНЕШНЕЕ ПОКРЫТИЕ " + covOk + "/" + covTotal : "ВНЕШНЕЕ ПОКРЫТИЕ НЕ ПОДТВЕРЖДЕНО"));
    pageBadge("signals",
      anyInternal ? (covDegraded ? "warn" : "live") : "unavailable",
      anyInternal ? ("ВНУТРЕННИЕ ДАННЫЕ ПОДКЛЮЧЕНЫ · " + externalText) : "ВНУТРЕННИЕ ИСТОЧНИКИ НЕДОСТУПНЫ"
    );
  }

  var FIELD_MOVEMENT_TREND_ICON = {
    up3: "↑↑↑", up2: "↑↑", up1: "↑", flat: "→", down1: "↓", down2: "↓↓"
  };

  function renderFieldMovement(fieldMovement) {
    var badge = document.querySelector('[data-fm="badge"]');
    var fmOk = sourceState.fieldMovement.ok && fieldMovement;

    if (!fmOk || fieldMovement.status !== "AVAILABLE") {
      if (badge) {
        badge.className = "state unavailable";
        badge.textContent = !fmOk ? "АГРЕГАТ НЕДОСТУПЕН" : "АГРЕГАТ ЕЩЁ НЕ СФОРМИРОВАН";
      }
      (fieldMovement && fieldMovement.axes || []).forEach(function (a) {
        var el = document.querySelector('[data-fm="' + a.axis + '"]');
        var note = document.querySelector('[data-fm-note="' + a.axis + '"]');
        if (el) el.textContent = "—";
        if (note) note.textContent = "к предыдущим 7 дням";
      });
      return;
    }

    if (badge) { badge.className = "state live"; badge.textContent = "АГРЕГАТ ДОСТУПЕН"; }
    fieldMovement.axes.forEach(function (a) {
      var el = document.querySelector('[data-fm="' + a.axis + '"]');
      var note = document.querySelector('[data-fm-note="' + a.axis + '"]');
      if (el) el.textContent = a.trend ? (FIELD_MOVEMENT_TREND_ICON[a.trend] || a.trend) : "—";
      if (note) note.textContent = a.trend ? ("вес " + a.current_weight + " / было " + a.prior_weight) : "нет данных за 14 дней";
    });
  }

  function renderScannerDiagnostics(diag) {
    var diagOk = sourceState.scannerDiagnostics.ok && diag;
    function put(sel, val) {
      var e = document.querySelector('[data-scan="' + sel + '"]');
      if (e) e.textContent = val;
    }
    if (!diagOk) {
      put("freshness", "Недоступно");
      put("last-run", "Недоступно");
      put("coverage", "Недоступно");
      put("enrichment", "Недоступно");
      put("ingest", "Недоступно");
      return;
    }
    var sc = diag.scanner || {};
    put("freshness", sc.freshness_state === "FRESH" ? "Свежий" : sc.freshness_state === "STALE" ? "Устарел" : "Недоступно");
    put("last-run", sc.last_run_at ? ago(sc.last_run_at) : "Недоступно");
    var cov = diag.source_coverage || {};
    put("coverage", cov.status === "UNAVAILABLE" ? "Недоступно" :
      esc(cov.ok_count) + " / " + esc(cov.total_sources) + " ok" + (cov.status !== "OK" ? " · " + esc(cov.status) : ""));
    var enr = diag.enrichment || {};
    put("enrichment", diag.flow_activated ?
      (esc(enr.enriched_signals) + " / " + esc(enr.stored_signals) + " обогащено") : "Flow не активирован");
    put("ingest", (diag.ingest && diag.ingest.key_configured) ? "Настроен · PATCH выключен" : "Не настроен");

    var failBox = document.querySelector('[data-scan="failing-list"]');
    if (failBox) {
      var failing = cov.failing || [];
      failBox.innerHTML = failing.length ? failing.map(function (f) {
        return "<div class='runtime-kv'><span>" + esc(f.source_id) + "</span><b>" +
          esc(f.known_degraded ? "known degraded" : "необъяснённый сбой") + " · " + esc(f.error || "") + "</b></div>";
      }).join("") : "";
    }
  }

  function liveMode(status) {
    var s=String(status||"").toUpperCase();
    if (["READY","AVAILABLE","FRESH","PASS"].indexOf(s)>=0) return "live";
    if (["UNAVAILABLE","FAIL","ERROR","BLOCKED","UNKNOWN"].indexOf(s)>=0) return "bad";
    return "warn";
  }
  function chip(status) {
    var s=String(status||"—");
    return "<span class='live-chip " + liveMode(s) + "'>" + esc(s) + "</span>";
  }
  function kv(label,value) {
    return "<div class='live-kv-clean'><span>"+esc(label)+"</span><b>"+esc(value==null||value===""?"—":value)+"</b></div>";
  }
  function ownerDisplay(o) {
    var v=o&&o.ball_owner;
    return (typeof v==="string" && v.trim() && v!=="UNAVAILABLE") ? v.trim() : "Недоступно";
  }
  function activateNormalized(pageKey, sourceStatus, badgeText) {
    var page=document.querySelector('[data-page-panel="'+pageKey+'"]');
    if (!page) return null;
    page.classList.add("normalized-live-active");
    pageBadge(pageKey, liveMode(sourceStatus)==="live"?"live":(liveMode(sourceStatus)==="bad"?"unavailable":"warn"), badgeText);
    return page.querySelector('[data-normalized-live="'+pageKey+'"] .panel-body');
  }
  function cleanFailure(pageKey,label,stateName) {
    var body=activateNormalized(pageKey,"UNAVAILABLE","ИСТОЧНИК НЕДОСТУПЕН");
    if (!body) return;
    body.innerHTML="<div class='live-status-box bad'><strong>"+esc(label)+" — недоступно</strong><p>Серверная проекция не ответила. Текущее состояние не подменяется старыми данными.</p></div>";
  }

  function operationSummaryRu(o) {
    var key = String(o && o.commitment_key || "");
    var m = {
      "event:2ad26cc7-de1f-4960-b723-f0a3bedfd424": "Замороженная диагностика декомпозиции веса для диапазона 3–<6 передана в Testing; пять исходных артефактов приняты, активная ревизия 4 ожидает компиляции.",
      "event:3283fda9-7608-4c25-b85c-63cc15fa65b7": "До построения исхода заморожен новый четырёхкогортный перенос reference-M для Q25: моменты M берутся только из исходных случаев CDS-I вне замороженной родительской выборки N=1795.",
      "event:8291d876-2434-4bde-b580-39ae324d10aa": "До подгонки модели заморожен новый ограниченный эксперимент EXP-H008-Q25-FOUR-COHORT-TRANSPORT: четыре оцениваемых диапазона сохранены без изменений, возраст 12+ явно исключён из оцениваемого эффекта.",
      "event:52763b6a-dcd8-4f02-b9cd-cfa1a0244e70": "Зафиксирована точная спецификация уже зарегистрированного кросс-когортного теста H008: порог Q25, базовые переменные, возрастные диапазоны и семейство модели не меняются; основная проверка — перенос с последовательным исключением одного возрастного диапазона без перенастройки.",
      "event:3d737300-f68c-4cd1-9e94-746f28002dcc": "Запечатано первое реальное проспективное решение Personal Twin D0001. Цель — следующий существенный объект ICAM, направляемый Основателем; прогнозы клона и базовой модели скрыты до исхода, наружу показывается только SHA-256 обязательства.",
      "event:cf76cb06-4faf-4e70-88e7-7d1ce2c2c80a": "Отложенный, но обязательный блок запуска BrazilPortal: после выбора сигналов Radar и начала первого цикла «контент → выручка» нужно пересобрать welcome/onboarding-письма на основе состояния пользователя, событий и логики Router, а не как отдельную универсальную рассылку.",
      "FND-007-FIRST7D-LIVE-SNAPSHOT": "Обязательство для Клима: до любой переработки продуктового опыта получить read-only снимок живого продукта First 7 Days и компактную инвентаризацию остальных активных пакетов BrazilPortal.",
      "event:f7f33851-362e-4b28-ab7f-c6c618a76f7b": "Personal Orchestrator должен пройти примерно 1–2 месяца полевого использования до продуктовой упаковки. В этот период оболочку не перестраивать: собирать реальное трение и делать только исправления ошибок и стабильности.",
      "event:c0adfdd3-33c3-45ac-91a7-abc94f896475": "Анализ O1 EEG, подгонка модели, выбор окон по данным и подтверждающее извлечение признаков запрещены до второй методологической проверки Aayush и зафиксированного Analysis Lock владеющей ветки.",
      "event:e68e399c-1754-4d3c-a3ad-c87b0f5449a8": "Оркестратор проходит 2–3 месяца закрытого тестирования до вывода в production; текущие тестировщики — Основатель и очень небольшой приглашённый круг.",
      "event:dab5d041-2af7-40b5-a96c-9c8d07cf94ec": "Ревизия артефактов поставлена в очередь до доступности серверного моста/библиотеки: нужно сверить рабочие файлы, долговечные зеркала и исторические пакеты, не делая Google Drive обязательным условием.",
      "event:4e272d4c-c19a-4c64-bd99-d354fa78a46b": "Следующий кросс-когортный гейт фальсификации должен оставаться замороженным; исполнение намеренно отложено до завершения проверки bootstrap и синхронизации."
    };
    if (m[key]) return m[key];
    var raw = projectionTextRu(o && o.title || "");
    if (/[A-Za-z]{4,}/.test(raw) && !/[А-Яа-яЁё]/.test(raw)) return "Источник передал описание только в техническом английском тексте; смысловая русская проекция для этого нового обязательства ещё не определена.";
    return raw || "Без краткого описания";
  }

  function renderOperationsProjection(data) {
    if (!sourceState.opsProjection.ok || !data) return cleanFailure("operations","Операции","opsProjection");
    var body=activateNormalized("operations",data.source_status,
      "ОПЕРАЦИИ · "+humanCode(data.source_status)+" · "+humanCode(data.freshness_state));
    if(!body)return;
    var c=data.counts||{}, ops=asArray(data.operations);
    var isClosedCommitment=function(o){return ["DONE","CLOSED","ARCHIVED","CANCELLED"].indexOf(String(o.status||"").toUpperCase())>=0;};
    var openOps=ops.filter(function(o){return !isClosedCommitment(o);});
    var closedOps=ops.filter(isClosedCommitment);
    var ownedOpen=openOps.filter(function(o){return ownerDisplay(o)!=="Недоступно";}).length;
    var factualKnown=ops.filter(function(o){return o.factual_result && String(o.factual_result).toUpperCase()!=="UNAVAILABLE";}).length;
    var ordered=openOps.concat(closedOps);
    var summary="<div class='live-status-box "+liveMode(data.source_status)+"'><strong>Операционная проекция — "+esc(humanCode(data.source_status))+"</strong>"+
      "<p>"+(String(data.freshness_state).toUpperCase()==="STALE"?"Проекция устарела по собственному контракту: нового движения обязательств в окне свежести не было. Это не означает, что обязательства автоматически отменены или просрочены.":"Состояние прочитано из серверной проекции.")+"</p></div>"+
      "<div class='live-summary'>"+
      "<div class='metric'><small>Открытые обязательства</small><strong>"+esc(openOps.length)+"</strong><span>из "+esc(ops.length)+" записей проекции</span></div>"+
      "<div class='metric'><small>Владелец известен</small><strong>"+esc(ownedOpen)+" / "+esc(openOps.length)+"</strong><span>только среди открытых обязательств</span></div>"+
      "<div class='metric'><small>Свежесть</small><strong>"+esc(humanCode(data.freshness_state))+"</strong><span>последнее движение "+esc(data.last_movement_at?ago(data.last_movement_at):"не передано")+"</span></div>"+
      "<div class='metric'><small>Фактический результат</small><strong>"+esc(factualKnown)+" / "+esc(ops.length)+"</strong><span>закрытие само по себе не считается результатом</span></div></div>"+
      "<div class='operations-proof-boundary'><b>Граница доказанного:</b> все "+esc(openOps.length)+" открытых обязательств сейчас не имеют владельца хода в этой проекции. Поле фактического результата также не заполнено; `closed_at` доказывает закрытие записи, но не бизнес-исход.</div>";
    var rows=ordered.slice(0,6).map(function(o){
      var owner=ownerDisplay(o);
      var factual=(o.factual_result && String(o.factual_result).toUpperCase()!=="UNAVAILABLE")?projectionTextRu(o.factual_result):"не передан источником";
      return "<div class='live-item-clean'><div class='live-item-clean-head'><h3>"+esc(o.object_id||"Обязательство")+"</h3>"+chip(o.status)+"</div>"+
        "<p>"+esc(cut(operationSummaryRu(o),220))+"</p>"+
        "<div class='live-kv-grid'>"+kv("Ключ обязательства",o.commitment_key)+kv("Открыто",o.opened_at?ago(o.opened_at):"—")+kv("Последнее изменение",o.updated_at?ago(o.updated_at):"—")+kv("Владелец хода",owner)+kv("Условие активации",projectionTextRu(o.activation_condition||"не передано"))+kv("Фактический результат",factual)+"</div>"+
        (owner==="Недоступно"?"<small>Источник: "+esc(projectionTextRu(o.ball_owner_reason||"владелец хода не передан"))+"</small>":"")+
        (asArray(o.object_level_blockers).length?"<small>У связанного объекта есть "+esc(asArray(o.object_level_blockers).length)+" открытых blocker-записей. Источник прямо запрещает считать их блокерами именно этого обязательства.</small>":"")+"</div>";
    }).join("");
    body.innerHTML=summary+"<div class='live-list-clean'>"+rows+"</div>"+(ordered.length>6?"<div class='live-more'>Сначала показаны открытые обязательства. Ещё "+(ordered.length-6)+" записей скрыты из обзора.</div>":"");
  }

  function renderBrazilPortalProjection(data) {
    if (!sourceState.brazilPortal.ok || !data) return cleanFailure("brazilportal","BrazilPortal","brazilPortal");
    var sv=data.status_views||{}, id=data.identity||{};
    var body=activateNormalized("brazilportal",data.source_status,
      "BRAZILPORTAL · "+(String(data.source_status||"").toUpperCase()==="DEGRADED"?"ЧАСТИЧНО ОГРАНИЧЕНО":humanCode(data.source_status)));
    if(!body)return;
    function val(x){return x&&x.value!=null?x.value:"—";}
    function bpCodeRu(v){
      var raw=String(v||"");
      var m={
        ACTIVE_BUILD:"активная сборка",
        RESTORE_TARGET_SET:"цель восстановления зафиксирована",
        UNRESOLVED:"не разрешена",
        READ_ONLY_RECONCILIATION_FIRST:"сначала сверка в режиме только чтения",
        CLEAN_PRE_SERVER_FACTORY_RESTORE_PASS:"подтвердить чистое восстановление досерверной фабрики",
        DIFFERENT_NAMESPACES_SAME_SYSTEM:"одна система, разные пространства имён",
        STALE:"устарело", DEGRADED:"частично ограничено"
      };
      return m[raw]||humanCode(raw||"—");
    }
    var unresolved=String(sv.projected_status_canonical_relation||"").toUpperCase()==="UNRESOLVED";
    var stale=String(data.freshness_state||"").toUpperCase()==="STALE";
    var blockersN=(data.open_blockers||{}).count;
    body.innerHTML=
      "<div class='live-status-box "+liveMode(data.source_status)+"'><strong>BrazilPortal — "+esc(bpCodeRu(data.source_status))+ (stale?" · данные устарели":"") +"</strong>"+
      "<p>"+(stale?"Последнее материальное движение: "+esc(data.last_movement_at?ago(data.last_movement_at):"не передано")+". ":"")+(unresolved?"Спроецированный статус пока не связан с каноном; объявленный статус сохраняется отдельно.":"Состояние прочитано из нормализованной проекции.")+"</p></div>"+
      "<div class='live-summary'>"+
      "<div class='metric'><small>Объявленный статус</small><strong>"+esc(bpCodeRu(sv.declared_status))+"</strong><span>что объект объявляет о себе</span></div>"+
      "<div class='metric'><small>Спроецированный статус</small><strong>"+esc(bpCodeRu(sv.projected_status))+"</strong><span>что вывело последнее смысловое событие</span></div>"+
      "<div class='metric'><small>Связь статуса с каноном</small><strong>"+esc(bpCodeRu(sv.projected_status_canonical_relation))+"</strong><span>относится только к спроецированному статусу</span></div>"+
      "<div class='metric'><small>Этап</small><strong>"+esc(bpCodeRu(val(data.stage)))+"</strong><span>подтверждён источником как факт</span></div></div>"+
      "<div class='bp-identity-proof'><b>Идентичность не является этой проблемой.</b><span>Компонент "+esc(id.component_id||"—")+" и операционный объект "+esc(id.operational_object_id||"—")+" связаны источником как «"+esc(bpCodeRu(id.relation))+"». Ключ чтения Continuity: "+esc(id.canonical_read_key||"—")+".</span></div>"+
      "<div class='live-item-clean'><div class='live-item-clean-head'><h3>Следующий ход</h3>"+chip(data.source_status)+"</div>"+
      "<div class='live-kv-grid'>"+kv("Владелец",val(data.owner))+kv("Следующий рубеж",bpCodeRu(val(data.next_gate)))+kv("Следующий ход",projectionTextRu(val(data.next_move)))+kv("Открытые blocker-записи объекта",blockersN)+kv("Открытые обязательства",(data.open_commitments||{}).count)+kv("Последнее материальное событие",data.last_material_event&&data.last_material_event.last_event_at?ago(data.last_material_event.last_event_at):"—")+"</div>"+
      "<small>"+esc(blockersN)+" blocker-записей связаны с объектом FND-007. Источник не доказывает test-фильтрацию и не передаёт единую оценку тяжести, поэтому Панель не называет их "+(blockersN===1?"одним препятствием":"одинаково критическими препятствиями")+".</small></div>";
  }

  function renderFoundationAggregateClean(data) {
    if (!sourceState.foundationAgg.ok || !data) return cleanFailure("foundation","Фундамент","foundationAgg");
    var body=activateNormalized("foundation",data.source_status,
      "ФУНДАМЕНТ · "+humanCode(data.source_status));
    if(!body)return;
    var names={
      continuity_source_health:"Контур Continuity",
      artifact_durability_readback:"Долговечность / readback",
      authority_action_path:"Путь полномочий",
      testing_execution_integrity:"Исполнение Testing"
    };
    var dims=asArray(data.dimensions);
    var cards=dims.map(function(d){
      var extra = "";
      if (d.dimension === "artifact_durability_readback") {
        var det = d.detail || {};
        extra = "<div class='foundation-proof-grid'>" +
          "<span><small>На диске</small><b>" + esc(det.objects_on_disk != null ? det.objects_on_disk : "—") + "</b></span>" +
          "<span><small>Расхождения хэшей</small><b>" + esc(det.hash_mismatches != null ? det.hash_mismatches : "—") + "</b></span>" +
          "<span><small>Потерянные артефакты</small><b>" + esc(det.artifacts_missing != null ? det.artifacts_missing : "—") + "</b></span>" +
          "<span><small>Осиротевшие расписки</small><b>" + esc(det.orphan_receipts != null ? det.orphan_receipts : "—") + "</b></span></div>" +
          "<div class='foundation-proof-note'><b>Что именно доказано:</b> источник не сообщает о потерянных артефактах или несовпадении хэшей. FAIL вызван несогласованностью «расписка STORED ↔ объект на диске». Идентификатор конкретной расписки текущая проекция чтения не раскрывает, поэтому Панель его не угадывает.</div>";
      }
      return "<div class='live-item-clean'><div class='live-item-clean-head'><h3>"+esc(names[d.dimension]||d.dimension)+"</h3>"+chip(d.state)+"</div>"+
        (d.blocking_reason?"<div class='live-warning'>"+esc(projectionTextRu(d.blocking_reason))+"</div>":"")+ extra +
        "<small>Доказано: "+esc(d.proven_by_source||"источник не указан")+"</small></div>";
    }).join("");
    var blocking=asArray(data.blocking_reasons);
    body.innerHTML=
      "<div class='live-status-box "+liveMode(data.source_status)+"'><strong>Готовность основания — "+esc(humanCode(data.source_status))+"</strong>"+
      "<p>"+(blocking.length?"Есть подтверждённый блокирующий дефект. Зелёный READY не показывается.":"Все обязательные измерения должны быть доказаны текущими источниками.")+"</p></div>"+
      "<div class='live-summary'>"+
      "<div class='metric'><small>Общий статус</small><strong>"+esc(humanCode(data.source_status))+"</strong><span>серверная агрегированная проекция — единственный источник готовности</span></div>"+
      "<div class='metric'><small>Свежесть</small><strong>"+esc(humanCode(data.freshness_state))+"</strong><span>последний успешный срез</span></div>"+
      "<div class='metric'><small>PASS</small><strong>"+esc(dims.filter(function(d){return String(d.state).toUpperCase()==="PASS";}).length)+" / "+esc(dims.length)+"</strong><span>обязательные измерения</span></div>"+
      "<div class='metric'><small>Блокирующие причины</small><strong>"+esc(blocking.length)+"</strong><span>подтверждены источниками</span></div></div>"+
      (blocking.length?"<div class='live-warning'>"+blocking.map(function(x){return esc(projectionTextRu(x));}).join("<br>")+"</div>":"")+
      "<div class='live-list-clean'>"+cards+"</div>" +
      "<div class='foundation-ready-rule'><b>Условие возврата в READY:</b> каждое обязательное измерение должно снова иметь PASS от живого источника. Прошлый PASS или сохранённый отчёт не заменяет текущее доказательство.</div>";
  }

  function renderAtlasStateClean(data) {
    if (!sourceState.atlasState.ok || !data) return cleanFailure("atlas","Атлас","atlasState");
    var body=activateNormalized("atlas",data.source_status,
      "АТЛАС · BLOCKED_UPSTREAM");
    if(!body)return;
    body.innerHTML=
      "<div class='live-status-box bad'><strong>Атлас — канонический источник состояния ещё не существует</strong>"+
      "<p>Проекция Панели подключена и отвечает, но ей неоткуда получить каноническое состояние ATLAS. Поэтому текущее состояние намеренно не строится из документов или косвенных признаков.</p></div>"+
      "<div class='live-summary'>"+
      "<div class='metric'><small>Проекция чтения Панели</small><strong>Подключена</strong><span>серверный endpoint отвечает</span></div>"+
      "<div class='metric'><small>Канонический источник состояния</small><strong>Отсутствует</strong><span title='формальный код: "+esc(data.error_class||"NO_ATLAS_STATE_SOURCE")+"'>состояние ATLAS неоткуда читать</span></div>"+
      "<div class='metric'><small>Текущее состояние</small><strong>Не строится</strong><span>документы Hub не превращаются в каноничность</span></div>"+
      "<div class='metric'><small>Следующий системный шаг</small><strong>Создать источник состояния</strong><span>канонический объект Continuity или постоянный сервис состояния</span></div></div>";
  }

  function renderAtlasSignalLab(data) {
    var card = document.querySelector("[data-atlas-siglab]");
    if (!card) return;
    var body = card.querySelector(".panel-body");
    var badge = card.querySelector("[data-atlas-siglab-state]");
    if (!body) return;
    if (!sourceState.signalLabStatus.ok || !data) {
      if (badge) { badge.className = "state unavailable"; badge.textContent = "НЕДОСТУПНО"; }
      body.innerHTML = "<div class='live-status-box warn'><strong>Signal Lab сейчас не прочитан</strong><p>Панель не показывает прошлое значение как текущее.</p></div>";
      return;
    }
    var running = String(data.health || "").toUpperCase() === "RUNNING";
    if (badge) { badge.className = "state " + (running ? "live" : "warn"); badge.textContent = running ? "НАБЛЮДЕНИЕ ИДЁТ" : humanCode(data.health || "—"); }
    var stage=data.current_stage||{}, live=data.live||{}, control=live.control||{}, treatment=live.treatment||{};
    var observations=Number(control.observations||0)+Number(treatment.observations||0);
    var confirmed=Number(control.confirmed||0)+Number(treatment.confirmed||0);
    var regions=asArray(data.scope&&data.scope.regions), sectors=asArray(data.scope&&data.scope.sectors), review=data.latest_review||{};
    var restarts=[data.last_restart&&data.last_restart.control,data.last_restart&&data.last_restart.treatment].filter(Boolean);
    var restart=restarts.length?restarts.sort(function(a,b){return new Date(b)-new Date(a);})[0]:null;
    var label=function(v){var m={GLOBAL_COMPARATIVE_EXPANSION:"глобальное сравнительное расширение",GLOBAL_UNIVERSE_FREEZE:"заморозка глобальной выборки",REVIEW_READY_NO_PREDECLARED_PASS_FAIL_THRESHOLD:"обзор готов; заранее заданного порога PASS/FAIL нет",IN_PROGRESS:"в работе",PENDING:"ожидает"};return m[String(v||"")]||humanCode(v||"—");};
    var dt=function(v){return v?new Date(v).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—";};
    body.innerHTML =
      "<div class='live-status-box "+(running?"ok":"warn")+"'><strong>ATLAS Signal Lab — "+esc(label(data.phase))+"</strong><p>Это наблюдаемый исследовательский процесс. Он не заполняет поля канонической модели ATLAS и не повышает доказательный статус результатов.</p></div>"+
      "<div class='live-summary atlas-siglab-summary'>"+
      "<div class='metric'><small>Этап</small><strong>"+esc(stage.index&&stage.total?stage.index+" / "+stage.total:"—")+"</strong><span>"+esc(stage.label||label(stage.name))+"</span></div>"+
      "<div class='metric'><small>Наблюдений</small><strong>"+esc(observations||"—")+"</strong><span>контрольный + смысловой потоки</span></div>"+
      "<div class='metric'><small>Счётчик confirmed</small><strong>"+esc(confirmed||"—")+"</strong><span>1 поле control + treatment; не приравнивается к подтверждённым выводам ATLAS</span></div>"+
      "<div class='metric'><small>Следующий цикл</small><strong>"+esc(dt(data.next_cycle))+"</strong><span>"+esc(label(data.next_gate))+"</span></div></div>"+
      "<div class='live-item-clean atlas-siglab-objective'><div class='live-item-clean-head'><h3>Цель текущего расширения</h3><span class='live-chip "+liveMode(stage.status||data.health||"—")+"'>"+esc(label(stage.status||data.health||"—"))+"</span></div><p>"+esc(data.objective||"Цель не передана источником.")+"</p>"+
      "<div class='live-kv-grid'>"+kv("Охват",regions.length?regions.length+" регионов":"—")+kv("Целевая выборка",data.scope&&data.scope.target_systems||"—")+kv("Классы отраслей",sectors.length||"—")+kv("Последний перезапуск",dt(restart))+"</div></div>"+
      "<div class='live-item-clean'><div class='live-item-clean-head'><h3>Два живых потока</h3><small>показываются раздельно, чтобы не скрывать различия</small></div><div class='atlas-siglab-streams'>"+
      "<div><small>Контрольный поток</small><b>"+esc(control.observations!=null?control.observations+" наблюдений":"—")+"</b><span>confirmed: "+esc(control.confirmed!=null?control.confirmed:"—")+(control.degraded!=null?" · degraded: "+esc(control.degraded):"")+"</span></div>"+
      "<div><small>Смысловой поток</small><b>"+esc(treatment.observations!=null?treatment.observations+" наблюдений":"—")+"</b><span>confirmed: "+esc(treatment.confirmed!=null?treatment.confirmed:"—")+(treatment.degraded!=null?" · degraded: "+esc(treatment.degraded):"")+"</span></div></div><small>Поля confirmed/degraded показаны как счётчики источника без собственной научной интерпретации Панели.</small></div>"+
      (Object.keys(review).length?"<div class='live-item-clean'><div class='live-item-clean-head'><h3>Последний обзор</h3><small>"+esc(label(review.gate_status))+"</small></div><div class='live-kv-grid'>"+kv("Длительность",review.duration_hours!=null?Number(review.duration_hours).toFixed(1)+" ч":"—")+kv("Кандидатов",review.candidate_count_union!=null?review.candidate_count_union:"—")+kv("Строгих расхождений пары",review.strict_pair_divergences!=null?review.strict_pair_divergences:"—")+kv("Файл обзора",review.file||"—")+"</div></div>":"");
  }

  // Founder-safe prediction-state labels only. Never render clone
  // probabilities, ranked candidates, or any text that would let the
  // predicted choice be inferred before outcome -- per
  // PANEL_TWIN_BRIDGE_CONTRACT_v0_3.md this list is exhaustive.
  var TWIN_PREDICTION_LABELS = {
    SEALED: "Запечатано (до исхода)",
    NO_LIVE_SEAL: "Нет активной печати",
    ABSTAIN: "Воздержание (недостаточно данных)",
    ABSTAIN_CONTAMINATED: "Воздержание (эпизод контаминирован)",
    PREPARING: "Подготовка"
  };

  function renderTwinStateClean(data) {
    if (!sourceState.twinState.ok || !data) return cleanFailure("digital-twin","DT","twinState");
    var status = data.source_status;
    if (status === "OFFLINE" || status === "UNAVAILABLE") {
      // liveMode() doesn't classify OFFLINE as "bad" -- force it explicitly
      // rather than let an unrecognized status fall through to the "warn"
      // default, which would visually understate a fully unreachable Twin.
      var failBody = activateNormalized("digital-twin", "UNAVAILABLE", "DT · " + esc(status));
      if (!failBody) return;
      failBody.innerHTML =
        "<div class='live-status-box bad'><strong>Personal Twin — " + esc(status) + "</strong>" +
        "<p>" + esc(data.degraded_reason || "Twin-процесс не ответил.") + "</p></div>";
      return;
    }

    var body = activateNormalized("digital-twin", status, "DT · " + esc(status));
    if (!body) return;

    var po = data.program_object || {};
    var inv = data.safety_invariants_status || {};
    var predLabel = TWIN_PREDICTION_LABELS[data.current_prediction] || "Недоступно";
    var needsConf = data.needs_confirmation || 0;
    var scoredN = Number(data.prospective_scored_n || 0);
    var invNames = {
      C0_C3_exact_controls: "Точные контрольные варианты C0–C3",
      experimental_lineage: "Экспериментальное происхождение",
      pre_action_seal: "Запечатывание до действия",
      prediction_exposure_guard: "Защита от раскрытия прогноза",
      prediction_hidden_pre_outcome: "Прогноз скрыт до исхода",
      score_before_update: "Оценка до обновления модели",
      semantic_validity_clock: "Часы смысловой валидности",
      sensor_semantic_gate: "Смысловой фильтр входных каналов",
      unknown_channel_policy: "Политика неизвестных каналов"
    };
    function invValueRu(v) {
      var x = String(v || "").toUpperCase();
      if (x === "ENFORCED") return "обязательно соблюдается";
      if (x === "ABSTAIN") return "воздержание при неопределённости";
      return humanCode(v || "—");
    }
    var invRows = Object.keys(inv).length ? Object.keys(inv).map(function (k) {
      return kv(invNames[k] || humanCode(k), invValueRu(inv[k]));
    }).join("") : "";
    var modeLabel = String(data.mode || "").toUpperCase() === "WARM_START" ? "тёплый запуск" : humanCode(data.mode || "—");
    var transferLabel = String(data.ss001_transfer_boundary || "").toUpperCase() === "ENGINEERING_METHODOLOGY_ONLY__NO_EMPIRICAL_TRANSFER" ?
      "перенесена только инженерная методология; эмпирические результаты SS001 не переносятся" : humanCode(data.ss001_transfer_boundary || "—");

    body.innerHTML =
      "<div class='live-status-box " + liveMode(status) + "'><strong>Personal Twin — вычислительный контур доступен</strong>" +
      "<p>Панель получает только безопасную проекцию чтения: вероятности клонов и ранжированные варианты до исхода сюда не поступают.</p></div>" +
      "<div class='live-summary'>" +
      "<div class='metric'><small>Объект программы</small><strong>" + esc((po && po.object_id) || "FND-005") + "</strong><span>" + esc(humanCode((po && po.declared_status) || "")) + "</span></div>" +
      "<div class='metric'><small>Режим</small><strong>" + esc(modeLabel) + "</strong><span>режим выполнения, не оценка качества прогноза</span></div>" +
      "<div class='metric'><small>Активных клонов</small><strong>" + esc(data.clones_active != null ? data.clones_active : "—") + "</strong><span>вычислительные варианты C0–C7</span></div>" +
      "<div class='metric'><small>Оценено проспективных прогнозов</small><strong>" + esc(data.prospective_scored_n != null ? data.prospective_scored_n : "—") + "</strong><span>исходы, по которым уже можно измерять качество</span></div></div>" +
      "<div class='twin-proof-boundary'><b>Граница доказанного:</b> состояние LIVE/OK подтверждает доступность вычислительного контура, но не точность прогноза. " +
        (scoredN === 0 ? "Пока оценено 0 проспективных исходов — предсказательная способность и лучший клон не определены." : "Оценённые исходы существуют, но их качество должно читаться из отдельной доказательной проекции.") + "</div>" +
      "<div class='live-item-clean'><div class='live-item-clean-head'><h3>Текущее состояние прогноза</h3>" + chip(data.current_prediction || "—") + "</div>" +
      "<div class='live-kv-grid'>" +
      kv("Статус", predLabel) +
      kv("SHA-256 запечатанного обязательства", data.current_commitment ? cut(data.current_commitment, 24) + "…" : "—") +
      kv("Печать создана", data.seal_created_at ? ago(data.seal_created_at) : "—") +
      kv("Последний исход", data.last_outcome || "исходов пока нет") +
      "</div>" +
      (needsConf > 0 ?
        "<div class='live-status-box warn' style='margin-top:8px'><strong>Ожидает подтверждения: " + esc(needsConf) + "</strong>" +
        "<p>Исход неоднозначен. Панель только показывает ожидание — подтверждение здесь не выполняется.</p></div>" : "") +
      "</div>" +
      "<div class='live-item-clean'><div class='live-item-clean-head'><h3>Предохранители эксперимента</h3>" + chip("ENFORCED") + "</div>" +
      "<div class='live-kv-grid'>" + invRows + "</div>" +
      "<small>Граница переноса SS001: " + esc(transferLabel) + ".</small></div>";
  }

  function HumanFoundationStatus(value) {
    var s = String(value || "").toUpperCase();
    if (s === "DEGRADED") return "частично ограничено";
    if (s === "READY" || s === "OK") return "готово";
    if (s === "UNAVAILABLE") return "недоступно";
    return humanCode(value || "не передано");
  }

  function renderDiagnostics(foundationAgg, scannerDiagnostics, hubHealth) {
    var page = document.querySelector('[data-page-panel="diagnostics"]');
    if (!page) return;
    var keys = Object.keys(sourceState);
    var ok = keys.filter(function (k) { return sourceState[k].ok; }).length;
    var failed = keys.length - ok;

    var total = page.querySelector('[data-x="trust"]'); if (total) total.textContent = ok + "/" + keys.length;
    var un = page.querySelector('[data-x="unavailable"]'); if (un) un.textContent = String(failed);
    var stale = page.querySelector('[data-x="stale"]'); if (stale) stale.textContent = "раздельно";
    var err = page.querySelector('[data-x="errors"]'); if (err) err.textContent = String(failed);

    var trust = page.querySelector('[data-x="trust-chain"]');
    if (trust) {
      var f = foundationAgg || {};
      var dims = asArray(f.dimensions);
      var passN = dims.filter(function (d) { return String(d && d.state || "").toUpperCase() === "PASS"; }).length;
      var mandatoryN = dims.filter(function (d) { return d && d.mandatory; }).length;
      var dur = dims.filter(function (d) { return d && d.dimension === "artifact_durability_readback"; })[0] || {};
      var dd = dur.detail || {};
      var scan = scannerDiagnostics || {};
      var cov = scan.source_coverage || {};
      var scanTotal = Number(cov.total_sources || 0), scanOk = Number(cov.ok_count || 0);
      var scanFail = asArray(cov.failing).length;
      var scanUnknown = asArray(cov.failing).filter(function (x) { return x && !x.known_degraded; }).length;
      var hub = hubHealth || {};
      var readTone = failed ? "warn" : "ok";
      var foundationTone = String(f.source_status || "").toUpperCase() === "DEGRADED" ? "warn" : (String(f.source_status || "").toUpperCase() === "READY" ? "ok" : "neutral");
      var durabilityTone = String(dur.state || "").toUpperCase() === "PASS" ? "ok" : (String(dur.state || "").toUpperCase() === "FAIL" ? "bad" : "neutral");
      var scannerTone = scanTotal && scanOk === scanTotal ? "ok" : (scanFail ? "bad" : "neutral");
      trust.innerHTML =
        "<div class='diag-boundary-intro'><div><small>НЕ ЕДИНЫЙ РЕЙТИНГ, А ГРАНИЦЫ ДОКАЗАННОГО</small><b>Доступность интерфейса ≠ здоровье всех источников мира</b><span>Каждое измерение сохраняет собственный источник и область действия.</span></div></div>" +
        "<div class='diag-boundary-grid'>" +
          "<div class='" + readTone + "'><small>Чтение панели</small><b>" + esc(ok + " / " + keys.length) + "</b><span>проекций ответили · ошибок чтения " + esc(failed) + "</span><em>влияет на доступность экранов</em></div>" +
          "<div class='" + foundationTone + "'><small>Системное основание</small><b>" + esc(passN + " / " + (mandatoryN || dims.length || "—")) + "</b><span>обязательных измерений пройдено · состояние: " + esc(HumanFoundationStatus(f.source_status)) + "</span><em>влияет на утверждение «основание готово»</em></div>" +
          "<div class='" + durabilityTone + "'><small>Долговечность артефактов</small><b>" + esc(dd.objects_on_disk != null ? dd.objects_on_disk + " объектов на диске" : "—") + "</b><span>хэши: " + esc(dd.hash_mismatches || 0) + " расхождений · потеряно: " + esc(dd.artifacts_missing || 0) + " · осиротевших расписок: " + esc(dd.orphan_receipts || 0) + "</span><em>наличие на диске не равно доказанному полному readback</em></div>" +
          "<div class='" + scannerTone + "'><small>Внешнее рыночное покрытие</small><b>" + esc(scanTotal ? scanOk + " / " + scanTotal : "—") + "</b><span>источников отвечают · отказов " + esc(scanFail) + " · ещё не объяснено " + esc(scanUnknown) + "</span><em>ограничивает внешние рыночные сигналы, а не внутреннее состояние компании</em></div>" +
        "</div>" +
        "<div class='diag-boundary-freshness'><b>Свежесть не сводится к одному таймеру.</b><span>Фундамент: " + esc(f.freshness_state ? humanCode(f.freshness_state) : "контракт не прочитан") + " · Market Scanner: " + esc(scan.scanner && scan.scanner.freshness_state ? humanCode(scan.scanner.freshness_state) : "контракт не прочитан") + ". Остальные источники не объявляются свежими только потому, что HTTP-чтение успешно.</span></div>" +
        "<div class='diag-boundary-rule'>Панель может одновременно иметь 26/26 успешных чтений и показывать деградацию отдельного upstream-контура. Это не противоречие: первое описывает доступность проекций, второе — состояние данных за ними.</div>";
    }

    var map = {
      continuity: ["continuityHealth", "objects", "blockers", "inbox"],
      "research-rd1": ["researchRD1"],
      orchestrator: ["routes", "summary", "metrics"],
      testing: ["testingSummary", "testingHealth", "testingRunner"],
      hub: ["hubHealth"],
      scanner: ["marketSignals", "fieldMovement", "scannerDiagnostics"],
      "founder-universe": ["temporalUniverse", "portfolioAdmission"],
      "founder-command": ["founderProjection", "organizationalIntelligence", "stewardReconciliation"],
      specialized: ["foundationAgg", "opsProjection", "atlasState", "twinState", "brazilPortal", "signalLabStatus"]
    };
    Object.keys(map).forEach(function (group) {
      var row = page.querySelector('[data-x-source="' + group + '"]');
      if (!row) return;
      var em = row.querySelectorAll("em");
      if (!map[group].length) {
        if (em[0]) em[0].textContent = "НЕ ПОДКЛЮЧЁН";
        if (em[1]) em[1].textContent = "—";
        return;
      }
      var states = map[group].map(function (k) { return sourceState[k]; });
      var count = states.filter(function (s) { return s.ok; }).length;
      if (em[0]) em[0].textContent = count === states.length ? "ЧТЕНИЕ ДОСТУПНО" : (count ? "ЧТЕНИЕ ЧАСТИЧНО" : "ЧТЕНИЕ НЕДОСТУПНО");
      var ats = states.filter(function (s) { return s.at; }).map(function (s) { return s.at; }).sort();
      if (em[1]) em[1].textContent = ats.length ? new Date(ats[ats.length - 1]).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}) : "—";
    });

    var module = page.querySelector('[data-x-runtime="module"]'); if (module) module.textContent = "G15";
    var refresh = page.querySelector('[data-x-runtime="refresh"]');
    var good = page.querySelector('[data-x-runtime="last-good"]');
    var errors = page.querySelector('[data-x-runtime="errors"]');
    var current = page.querySelector('[data-x-runtime="page"]');
    var ats = keys.filter(function (k) { return sourceState[k].at; }).map(function (k) { return sourceState[k].at; }).sort();
    var goods = keys.filter(function (k) { return sourceState[k].ok && sourceState[k].at; }).map(function (k) { return sourceState[k].at; }).sort();
    if (refresh) refresh.textContent = ats.length ? new Date(ats[ats.length - 1]).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}) : "—";
    if (good) good.textContent = goods.length ? new Date(goods[goods.length - 1]).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}) : "—";
    if (errors) errors.textContent = String(failed);
    if (current) {
      var active = document.querySelector(".page.active .topbar h1");
      current.textContent = active ? active.textContent.trim() : "—";
    }

    pageBadge("diagnostics", failed ? (ok ? "warn" : "unavailable") : "live", failed ? (ok ? "ПРОЕКЦИИ ЧТЕНИЯ ЧАСТИЧНО" : "ПРОЕКЦИИ ЧТЕНИЯ НЕДОСТУПНЫ") : "ПРОЕКЦИИ ЧТЕНИЯ ДОСТУПНЫ");
  }

  function boot() {
    injectLiveStyles();

    Promise.all([
      fetchJSON("routes", ENDPOINTS.routes),
      fetchJSON("summary", ENDPOINTS.summary),
      fetchJSON("metrics", ENDPOINTS.metrics),
      fetchJSON("inbox", ENDPOINTS.inbox),
      fetchJSON("objects", ENDPOINTS.objects),
      fetchJSON("blockers", ENDPOINTS.blockers),
      fetchJSON("testingSummary", ENDPOINTS.testingSummary),
      fetchJSON("testingHealth", ENDPOINTS.testingHealth),
      fetchJSON("testingRunner", ENDPOINTS.testingRunner),
      fetchJSON("hubHealth", ENDPOINTS.hubHealth),
      fetchJSON("continuityHealth", ENDPOINTS.continuityHealth),
      fetchJSON("opsProjection", ENDPOINTS.opsProjection),
      fetchJSON("brazilPortal", ENDPOINTS.brazilPortal),
      fetchJSON("foundationAgg", ENDPOINTS.foundationAgg),
      fetchJSON("atlasState", ENDPOINTS.atlasState),
      fetchJSON("twinState", ENDPOINTS.twinState),
      fetchJSON("marketSignals", ENDPOINTS.marketSignals),
      fetchJSON("fieldMovement", ENDPOINTS.fieldMovement),
      fetchJSON("scannerDiagnostics", ENDPOINTS.scannerDiagnostics),
      fetchJSON("founderProjection", ENDPOINTS.founderProjection, UNIVERSE_TIMEOUT_MS),
      fetchJSON("organizationalIntelligence", ENDPOINTS.organizationalIntelligence, UNIVERSE_TIMEOUT_MS),
      fetchJSON("stewardReconciliation", ENDPOINTS.stewardReconciliation, UNIVERSE_TIMEOUT_MS),
      fetchJSON("signalLabStatus", ENDPOINTS.signalLabStatus, UNIVERSE_TIMEOUT_MS),
      fetchJSON("temporalUniverse", ENDPOINTS.temporalUniverse, UNIVERSE_TIMEOUT_MS),
      fetchJSON("portfolioAdmission", ENDPOINTS.portfolioAdmission, UNIVERSE_TIMEOUT_MS)
    ]).then(function (res) {
      var routesJSON = res[0];
      var summaryJSON = res[1];
      var metricsJSON = res[2];
      var inbox = res[3];
      var objects = res[4];
      var blockers = res[5];
      var testingSummary = res[6];
      var testingHealth = res[7];
      var testingRunner = res[8];
      var hubHealth = res[9];
      var continuityHealth = res[10];
      var opsProjection = res[11];
      var brazilPortal = res[12];
      var foundationAgg = res[13];
      var atlasState = res[14];
      var twinState = res[15];
      var marketSignals = res[16];
      var fieldMovement = res[17];
      var scannerDiagnostics = res[18];
      var founderProjection = res[19];
      var organizationalIntelligence = res[20];
      var stewardReconciliation = res[21];
      var signalLabStatus = res[22];
      var temporalUniverse = res[23];
      var portfolioAdmission = res[24];

      var routes = routesJSON && Array.isArray(routesJSON.routes) ? routesJSON.routes : [];
      var summary = summaryJSON && summaryJSON.summary ? summaryJSON.summary : null;
      var metrics = metricsJSON && metricsJSON.metrics ? metricsJSON.metrics : null;
      setObjectNameMap(objects);
      var depModel = dependencyModel(routes);
      lastSnapshot = {
        routes: routes, summary: summary, metrics: metrics, inbox: inbox,
        objects: objects, blockers: blockers, testingSummary: testingSummary, hubHealth: hubHealth,
        opsProjection: opsProjection, brazilPortal: brazilPortal,
        foundationAgg: foundationAgg, atlasState: atlasState, twinState: twinState,
        marketSignals: marketSignals, fieldMovement: fieldMovement, scannerDiagnostics: scannerDiagnostics,
        founderProjection: founderProjection, organizationalIntelligence: organizationalIntelligence,
        stewardReconciliation: stewardReconciliation, signalLabStatus: signalLabStatus, temporalUniverse: temporalUniverse,
        portfolioAdmission: portfolioAdmission, rd1: {}
      };

      setOrchestratorHeader(sourceState.routes.ok, sourceState.summary.ok, sourceState.metrics.ok);
      renderHomeKPIs(routes, inbox);
      renderHomeTesting(testingSummary);

      if (sourceState.routes.ok) {
        renderOrchestratorKPIs(routes, summary, metrics, depModel);
        renderOrchestratorRoutes(routes, depModel);
        renderVisualBoard(routes, depModel);
        renderHomeRoutes(routes, depModel);
        renderHomeRisk(routes, depModel);
      } else {
        renderRoutesUnavailable();
      }

      if (sourceState.inbox.ok) renderHomeNeeds(inbox);
      else renderInboxUnavailable();

      renderRegistry(objects, blockers);
      renderDocuments(hubHealth, testingSummary);
      renderTesting(testingSummary, testingRunner);
      renderSignals(objects, blockers, inbox, testingSummary, marketSignals, organizationalIntelligence);
      renderFieldMovement(fieldMovement);
      renderScannerDiagnostics(scannerDiagnostics);
      renderOperationsProjection(opsProjection);
      renderBrazilPortalProjection(brazilPortal);
      renderFoundationAggregateClean(foundationAgg);
      renderAtlasStateClean(atlasState);
      renderAtlasSignalLab(signalLabStatus);
      renderTwinStateClean(twinState);
      renderDiagnostics(foundationAgg, scannerDiagnostics, hubHealth);

      renderResearch(objects, blockers, testingSummary, hubHealth, founderProjection).then(function () {
        renderDiagnostics(foundationAgg, scannerDiagnostics, hubHealth);
        updateTrust();
        if (lastSnapshot) lastSnapshot.sources = JSON.parse(JSON.stringify(sourceState));
        window.__PANEL_V2_DATA = lastSnapshot;
        window.dispatchEvent(new CustomEvent("panel-v2-live-ready", { detail: window.__PANEL_V2_LIVE }));
      });
    });
  }

  // Shared, side-effect-free helpers so command-center.js uses the exact same
  // naming, dependency and diagnostic-risk semantics as the rest of the panel.
  window.__PANEL_V2_HELPERS = {
    esc: esc, cut: cut, asArray: asArray, daysSince: daysSince, ago: ago,
    routeName: routeName, routeKey: routeKey, humanCode: humanCode, ruStatus: ruStatus,
    isClosed: isClosed, isFounderOwner: isFounderOwner, blockerCount: blockerCount,
    explicitDependencies: explicitDependencies, dependencyModel: dependencyModel,
    riskInfo: riskInfo, signalKindRu: signalKindRu, allTests: allTests,
    STALE_DAYS: STALE_DAYS, CRITICAL_DAYS: CRITICAL_DAYS
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  setInterval(boot, REFRESH_MS);
})();
