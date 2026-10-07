// Founder Panel v2 — Live Read Wiring G22
// Scope: READ ONLY.
// Sources: existing same-происхождение Orchestrator + Continuity GET projections.
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
    atlasState: API + "/atlas-state",
    twinState: API + "/panel/twin",
    marketSignals: API + "/signals",
    fieldMovement: API + "/signals/field-movement",
    scannerDiagnostics: API + "/signals/diagnostics",
    founderProjection: API + "/founder-projection",
    organizationalIntelligence: API + "/organizational-intelligence",
    stewardReconciliation: API + "/steward-reconciliation",
    signalLabStatus: API + "/signal-lab-status",
    agentProjection: API + "/agent-registry",
    agentLineage: API + "/agent-lineage",
    // Founder Universe read-only backend (separate service, same origin).
    temporalUniverse: "/founder-star-view/api/temporal-universe",
    portfolioAdmission: "/founder-star-view/api/portfolio-admission",
    radar: API + "/radar",
    manualCommercial: "/founder-ui-preview/commercial/manual-actions.json",
    commercialDashboard: "/founder-ui-preview/commercial/dashboard.json"
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
    agentProjection: { ok: false, at: null, error: null },
    agentLineage: { ok: false, at: null, error: null },
    temporalUniverse: { ok: false, at: null, error: null },
    portfolioAdmission: { ok: false, at: null, error: null },
    radar: { ok: false, at: null, error: null },
    manualCommercial: { ok: false, at: null, error: null },
    commercialDashboard: { ok: false, at: null, error: null }
  };

  function esc(value) {
    var d = document.createElement("div");
    d.textContent = String(value == null ? "" : value);
    return d.innerHTML;
  }

  function attr(value) {
    return esc(value).replace(/"/g, "&quot;").replace(/\'/g, "&#39;");
  }

  function cut(value, n) {
    var s = String(value == null ? "" : value);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function numberOrNull(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function founderFlagState(o) {
    o = o || {};
    var known = typeof o.needs_founder === "boolean" || typeof o.needs_nika === "boolean";
    return { known: known, value: o.needs_founder === true || o.needs_nika === true };
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

  function projectionFieldRu(value) {
    var raw=String(value==null?"":value).trim();
    var map={
      current_state:"текущее состояние",
      material_activity:"материальная активность",
      object_detail:"детали объекта",
      epistemic_role:"эпистемическая роль",
      learning_state:"состояние обучения",
      promotion_state:"повышение статуса",
      freshness_source_timestamp:"метка времени свежести источника",
      factual_result:"фактический результат"
    };
    return map[raw]||humanCode(raw);
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
      "Continuity has no factual-result field on commitments; closed_at records closure time only, not an outcome.": "В обязательствах Continuity нет поля фактического результата; closed_at фиксирует только время закрытия записи, а не результат.",
      "ATLAS has no state source: it is not a Continuity object, exposes no service or state store on this host, and exists in the Hub only as documents (ATLAS_UPDATE_* library artifacts). Those documents are not state and are deliberately not parsed as state.": "У ATLAS сейчас нет собственного источника состояния: он не представлен как объект Continuity и не отдаёт отдельный сервис или хранилище состояния. В Hub доступны только документы ATLAS_UPDATE_*, но документы не считаются текущим состоянием и намеренно не разбираются как состояние.",
      "ATLAS must expose its own state -- either as a Continuity object reporting projected fields, or as a service with a state store. Until then the panel should render UNAVAILABLE with this reason and must not infer role, promotion or learning state from library documents.": "Чтобы разблокировать живое состояние ATLAS, сам ATLAS должен начать отдавать состояние: либо как объект Continuity с нужными полями проекции, либо через отдельный сервис с хранилищем состояния. До этого Панель должна оставаться в состоянии «недоступно» и не выводить роль, повышение статуса или состояние обучения из документов библиотеки."
    };
    if (exact[raw]) return exact[raw];
    if (raw.indexOf("no projected-field or material event movement within freshness window") === 0) return "В окне свежести не было движения по спроецированным полям или материальным событиям; каноническая связь статуса остаётся неразрешённой.";
    return raw;
  }

  function routeKey(r) {
    return String(r.route_id || r.id || r.source_object_id || r.object_id || r.area || r.title || "");
  }

  var TERMINAL_STATES = {
    CLOSED:1, CLOSED_NO_GO:1, DONE:1, ARCHIVED:1, CANCELLED:1,
    COMPLETED:1, RESOLVED:1, RETIRED:1, DEPRECATED:1, INVALIDATED:1, SUPERSEDED:1
  };

  function isClosed(r) {
    var s = String((r && (r.status || r.state)) || "").toUpperCase();
    return !!TERMINAL_STATES[s];
  }

  function isFounderOwner(owner) {
    var s = String(owner || "").trim().toLowerCase();
    return ["me", "founder", "основатель", "nika", "ника"].indexOf(s) >= 0;
  }

  function blockerCount(r) {
    if (Array.isArray(r.blockers)) return r.blockers.length;
    if (typeof r.blockers === "number") return isFinite(r.blockers) ? r.blockers : null;
    if (r.blocker_count != null) {
      var n = Number(r.blocker_count);
      return isFinite(n) ? n : null;
    }
    return null;
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
    var blockersKnown = blockers != null;
    var downstream = depModel.downstream[routeKey(r)] || 0;
    var level = "stable";

    if ((stale != null && stale >= CRITICAL_DAYS) ||
        (stale != null && stale >= STALE_DAYS && downstream > 0) ||
        (blockersKnown && blockers >= 2)) {
      level = "critical";
    } else if ((stale != null && stale >= STALE_DAYS) || (blockersKnown && blockers > 0)) {
      level = "return";
    } else if (!blockersKnown) {
      level = "unknown";
    }

    return {
      stale: stale,
      blockers: blockers,
      blockersKnown: blockersKnown,
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

  function setOrchestratorHeader(routesOk, routesKnown, summaryOk, metricsOk) {
    var page = document.querySelector('[data-page-panel="orchestrator"]');
    if (!page) return;
    var badge = page.querySelector(".top-actions .state");
    if (!badge) return;
    badge.classList.remove("unavailable", "warn", "live");
    if (!routesOk) {
      badge.classList.add("unavailable");
      badge.textContent = "ИСТОЧНИК НЕДОСТУПЕН";
    } else if (!routesKnown || !summaryOk || !metricsOk) {
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

  function renderHomeKPIs(routes, inbox, routesKnown) {
    if (sourceState.routes.ok && routesKnown) {
      var active = routes.filter(function (r) { return !isClosed(r); });
      setHomeKPI("Маршруты", String(active.length), "маршруты без явного закрывающего статуса в текущем чтении Оркестратора");
    } else if (sourceState.routes.ok) {
      setHomeKPI("Маршруты", "—", "Оркестратор ответил, но поле routes[] не передано");
    } else {
      setHomeKPI("Маршруты", "Недоступно", "текущее чтение Оркестратора завершилось ошибкой");
    }

    if (sourceState.inbox.ok) {
      var needsKnown = !!(inbox && Array.isArray(inbox.needs_founder));
      var needs = needsKnown ? inbox.needs_founder : [];
      var summaryKnown = !!(inbox && inbox.summary && inbox.summary.needs_founder != null);
      var declared = summaryKnown ? inbox.summary.needs_founder : (needsKnown ? needs.length : null);
      setHomeKPI("Внимание Основателя", declared == null ? "—" : String(declared), summaryKnown ? "счётчик inbox.summary.needs_founder" : (needsKnown ? "по явному needs_founder[]" : "счётчик и needs_founder[] не переданы"));
    } else {
      setHomeKPI("Внимание Основателя", "Недоступно", "Founder inbox не подтвердил текущее состояние");
    }
  }

  function renderRoutesUnavailable(collectionMissing) {
    [
      '[data-page-panel="orchestrator"] .mine .panel-body',
      '[data-page-panel="orchestrator"] .waiting .panel-body',
      '[data-page-panel="orchestrator"] .orch-risk .panel-body'
    ].forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el) el.innerHTML = collectionMissing ?
        unavailableHTML("Маршруты не проверены", "Оркестратор ответил, но поле routes[] не передано; пустой список из этого не следует.") :
        unavailableHTML("Источник маршрутов недоступен", "Панель не сохраняет демонстрационные или прошлые маршруты как current state.");
    });

    var page = document.querySelector('[data-page-panel="orchestrator"]');
    if (page) {
      page.querySelectorAll(".strip .card").forEach(function (card) {
        var strong = card.querySelector("strong");
        var span = card.querySelector("span");
        if (strong) strong.textContent = collectionMissing ? "—" : "Недоступно";
        if (span) span.textContent = collectionMissing ? "routes[] не передан" : "текущее чтение маршрутов завершилось ошибкой";
      });
    }

    var board = document.querySelector('[data-page-panel="orchestrator"] .progress-board');
    var scale = document.querySelector('[data-page-panel="orchestrator"] .attention-scale');
    var graph = document.querySelector('[data-page-panel="orchestrator"] .dependency-graph');
    if (board) board.innerHTML = collectionMissing ? unavailableHTML("Маршрутные данные не проверены", "Поле routes[] не передано.") : unavailableHTML("Маршрутные данные недоступны", "Визуальная шкала очищена до нового успешного чтения.");
    if (scale) scale.innerHTML = "<h3>ШКАЛА ВНИМАНИЯ</h3>" + (collectionMissing ? unavailableHTML("Маршрутное состояние не проверено", "Поле routes[] не передано.") : unavailableHTML("Нет current state", "Диагностическая шкала не строится по прошлым или демонстрационным данным."));
    if (graph) graph.innerHTML = collectionMissing ? "<div class='dep-live-message'>Оркестратор ответил, но routes[] не передан.<br>Граф зависимостей не проверен.</div>" : "<div class='dep-live-message'>Источник маршрутов недоступен.<br>Граф очищен до нового успешного чтения.</div>";

    var homeNow = document.querySelector('[data-page-panel="home"] .home-panel.now .body');
    var homeRisk = document.querySelector('[data-page-panel="home"] .home-panel.risk .body');
    if (homeNow) homeNow.innerHTML = collectionMissing ? unavailableHTML("Маршруты не проверены", "Оркестратор ответил, но routes[] не передан.") : unavailableHTML("Оркестратор недоступен", "Главная не показывает старый порядок маршрутов как текущий.");
    if (homeRisk) homeRisk.innerHTML = collectionMissing ? unavailableHTML("Риск-модель не проверена", "Без явного routes[] Панель не вычисляет диагностический застой.") : unavailableHTML("Риск-модель недоступна", "Без current routes Панель не вычисляет диагностический застой.");
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
    } else if (!risk.blockersKnown) {
      badges.push("<span class='live-badge warn'>blocker-поле не передано</span>");
    }
    if (risk.downstream) {
      badges.push("<span class='live-badge hot'>задерживает " + risk.downstream + " зависим.</span>");
    }

    return "<div class='" + classes.join(" ") + "'>" +
      "<div class='live-route-head'><b>" + esc(cut(routeName(r), 48)) + "</b>" +
      "<span class='state " + (risk.level === "stable" ? "live" : "warn") + "'>" +
      esc(r.stage || r.status || "этап не передан") + "</span></div>" +
      "<div class='live-route-next'>" + esc(cut(r.next_move || r.title || "Следующий ход не передан", 120)) + "</div>" +
      "<div class='live-route-meta'>ход у: " + esc(r.ball_owner == null || r.ball_owner === "" ? "поле не передано" : r.ball_owner) +
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

    // "На моей стороне" is Founder work, not a generic ACTIVE list. Old Founder
    // assignments remain visible in diagnostics/history but are not promoted as current work.
    var founderFresh=active.filter(function(r){var age=daysSince(r.last_movement_at);return isFounderOwner(r.ball_owner)&&age!=null&&age<STALE_DAYS;});
    renderRoutePanel(
      '[data-page-panel="orchestrator"] .mine .panel-body',
      founderFresh.slice(0, 8),
      depModel,
      "Свежих маршрутов с явным ходом у Ники сейчас нет. Старые назначения не считаются текущей работой автоматически."
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
      board.innerHTML = "<div class='live-empty'>Нет маршрутов без явного закрывающего статуса для визуализации.</div>";
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

    var critical = [], returning = [], stable = [], unknown = [];
    active.forEach(function (r) {
      var info = riskInfo(r, depModel);
      var item = { r: r, info: info };
      if (info.level === "critical") critical.push(item);
      else if (info.level === "return") returning.push(item);
      else if (info.level === "unknown") unknown.push(item);
      else stable.push(item);
    });

    function attentionRows(items, cls, label) {
      if (!items.length) return "";
      return items.slice(0, 4).map(function (x, i) {
        var reason = [];
        if (x.info.stale != null && x.info.stale >= STALE_DAYS) reason.push("без движения " + x.info.stale + " дн.");
        if (x.info.blockers) reason.push("блокеров " + x.info.blockers);
        if (!x.info.blockersKnown) reason.push("blocker-поле не передано");
        if (x.info.downstream) reason.push("задерживает " + x.info.downstream);
        return "<div class='attention " + cls + "'><span>" + (i === 0 ? label : "") + "</span><b>" +
          esc(cut(routeName(x.r), 34)) + "</b><small>" + esc(reason.join(" · ") || "явных диагностических признаков нет") + "</small></div>";
      }).join("");
    }

    scale.innerHTML =
      "<h3>ШКАЛА ВНИМАНИЯ</h3>" +
      "<div class='attention-note'>Визуальная диагностика панели по давности/блокерам. Это не канонический приоритет Оркестратора.</div>" +
      attentionRows(critical, "critical", "Критично") +
      attentionRows(returning, "return", "Вернуться") +
      attentionRows(unknown, "unknown", "Не проверено") +
      attentionRows(stable, "stable", "Без явного сигнала");

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
    var fresh = active.filter(function(r){var age=daysSince(r.last_movement_at);return age!=null&&age<STALE_DAYS;});
    if (!fresh.length) {
      body.innerHTML = "<div class='live-empty'>Свежего движения по маршрутам сейчас нет. Старые ACTIVE-маршруты сохранены в Оркестраторе, но не показываются здесь как «сейчас».</div>";
      return;
    }

    body.innerHTML = "<div class='home-live-list'>" +
      fresh.slice(0, 5).map(function (r) {
        var info = riskInfo(r, depModel);
        return "<div class='home-live-item'><b>" + esc(cut(routeName(r), 40)) + " — " +
          esc(cut(r.next_move || r.title || "следующий ход не передан", 80)) + "</b>" +
          "<small>ход у: " + esc(r.ball_owner == null || r.ball_owner === "" ? "поле не передано" : r.ball_owner) +
          " · " + esc(info.stale == null ? "движение без даты" : "движение " + ago(r.last_movement_at)) +
          (info.blockers ? " · блокеров " + info.blockers : (!info.blockersKnown ? " · blocker-поле не передано" : "")) +
          "</small></div>";
      }).join("") +
      "</div><div class='source-note'>Показаны только маршруты со свежим подтверждённым движением. Порядок строк получен из Оркестратора; Панель не создаёт свой рейтинг.</div>";
  }

  function renderHomeNeeds(inbox) {
    var body = document.querySelector('[data-page-panel="home"] .home-panel.need .body');
    if (!body) return;
    var itemsKnown = !!(inbox && Array.isArray(inbox.needs_founder));
    var items = itemsKnown ? inbox.needs_founder : [];
    if (!itemsKnown) {
      body.innerHTML = unavailableHTML("Запросы к Основателю не проверены", "Founder inbox прочитан, но поле needs_founder[] не передано.");
      return;
    }
    if (!items.length) {
      body.innerHTML = "<div class='live-empty'>Источник явно передал пустой needs_founder[].</div>";
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

  function testCollectionState(summary) {
    return {
      activeKnown: !!(summary && Array.isArray(summary.active)),
      recentKnown: !!(summary && Array.isArray(summary.recent))
    };
  }

  function allTests(summary) {
    var by = {};
    if (!summary) return [];
    if (Array.isArray(summary.active)) summary.active.forEach(function (t) { if (t && t.test_id) by[t.test_id] = t; });
    if (Array.isArray(summary.recent)) summary.recent.forEach(function (t) { if (t && t.test_id) by[t.test_id] = t; });
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
    var testState = testCollectionState(summary);
    var testComplete = testState.activeKnown && testState.recentKnown;
    var attention = allTests(summary).filter(function (t) {
      return ["NEEDS_ADJUDICATION", "BLOCKED", "RERUN_REQUIRED"].indexOf(String(t.status || "").toUpperCase()) >= 0;
    });
    value.textContent = testComplete ? String(attention.length) : "≥ " + String(attention.length);
    note.textContent = attention.length ?
      ("из переданных тестов требуют реакции" + (testComplete ? "" : "; набор неполный")) :
      (testComplete ? "в полном active[] + recent[] таких тестов нет" : "общий ноль не подтверждён: active[] или recent[] не передан");
  }

  function renderRegistry(objectsResp, blockersResp, portfolioAdmission) {
    var page = document.querySelector('[data-page-panel="registry"]');
    if (!page) return;
    if (!sourceState.objects.ok || !objectsResp) {
      pageBadge("registry", "unavailable", "ИСТОЧНИК НЕДОСТУПЕН");
      ["count", "active", "unresolved", "founder"].forEach(function (k) {
        var el = page.querySelector('[data-g="' + k + '"]'); if (el) el.textContent = "Недоступно";
      });
      ["id","name","owner","status","event","founder"].forEach(function(k){var e=page.querySelector('[data-g-detail="'+k+'"]');if(e)e.textContent="Недоступно";});
      var list = page.querySelector('[data-g="objects"]');
      if (list) list.innerHTML = unavailableHTML("Объекты Continuity недоступны", "Реестр не показывает прошлый список как текущее состояние.");
      return;
    }

    var itemsKnown = Array.isArray(objectsResp.items);
    var items = itemsKnown ? objectsResp.items : [];
    var active = items.filter(function (o) { return /^ACTIVE/.test(String(o.declared_status || "").toUpperCase()); });
    var statusUnknown = items.filter(function (o) { return !Object.prototype.hasOwnProperty.call(o, "declared_status") || o.declared_status == null || o.declared_status === ""; }).length;
    // Explicit null/empty last_event_at is an event-history gap, not identity debt.
    // An absent field is weaker: the current projection did not provide the value.
    var noEventHistory = items.filter(function (o) { return Object.prototype.hasOwnProperty.call(o, "last_event_at") && !o.last_event_at; });
    var eventHistoryUnknown = items.filter(function (o) { return !Object.prototype.hasOwnProperty.call(o, "last_event_at"); }).length;
    var founder = items.filter(function (o) { return founderFlagState(o).value; });
    var founderUnknown = items.filter(function (o) { return !founderFlagState(o).known; }).length;

    var memoryScope=page.querySelector('[data-g="memory-scope"]');
    if(memoryScope){
      var paOk=!!(sourceState.portfolioAdmission.ok && portfolioAdmission && portfolioAdmission.counts);
      if(paOk){
        var pc=portfolioAdmission.counts||{};
        memoryScope.innerHTML="<b>Два слоя реестра</b><span>Continuity: "+esc(itemsKnown?items.length:"—")+" канонических объектов · Company Memory: "+esc(pc.memory==null?"—":pc.memory)+" записей · на Founder Map: "+esc(pc.placed==null?"—":pc.placed)+" · точных кандидатов владельца: "+esc(pc.exact_owner_candidates==null?"—":pc.exact_owner_candidates)+" · требуют сверки: "+esc(pc.review_required==null?"—":pc.review_required)+" · конфликтов владельца: "+esc(pc.owner_conflicts==null?"—":pc.owner_conflicts)+". Это разные уровни доказательности; Панель их не сливает. <a href='#placement'>Открыть размещение →</a></span>";
      }else{
        memoryScope.innerHTML="<b>Два слоя реестра</b><span>Continuity читается отдельно. Company Memory / Portfolio Admission сейчас не подтверждены; более широкий контур не достраивается по косвенным данным.</span>";
      }
    }

    function put(k, v) { var e = page.querySelector('[data-g="' + k + '"]'); if (e) e.textContent = String(v); }
    put("count", itemsKnown ? items.length : "—"); put("active", itemsKnown ? (statusUnknown ? "≥ " + active.length : active.length) : "—"); put("unresolved", itemsKnown ? (eventHistoryUnknown ? "≥ " + noEventHistory.length : noEventHistory.length) : "—"); put("founder", itemsKnown ? (founderUnknown ? "≥ " + founder.length : founder.length) : "—");
    var core = page.querySelector('[data-g="identity-core"]'); if (core) core.textContent = String(itemsKnown ? (eventHistoryUnknown ? "≥ " + noEventHistory.length : noEventHistory.length) : "—");

    function fillRegistryDetail(o) {
      function detail(k,v){var e=page.querySelector('[data-g-detail="'+k+'"]');if(e)e.textContent=v;}
      if (!o) { ["id","name","owner","status","event","founder"].forEach(function(k){detail(k,"—");}); return; }
      detail("id", o.object_id || "не передан");
      detail("name", o.name || "не передано");
      detail("owner", o.owning_branch || o.owner || "не передана");
      detail("status", Object.prototype.hasOwnProperty.call(o,"declared_status") ? (o.declared_status==null||o.declared_status===""?"передано пустое значение":ruStatus(o.declared_status)) : "поле не передано");
      if (!Object.prototype.hasOwnProperty.call(o,"last_event_at")) detail("event","поле не передано");
      else if (!o.last_event_at) detail("event","дата события не передана");
      else { var dt=new Date(o.last_event_at); detail("event", isNaN(dt)?String(o.last_event_at):dt.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})); }
      var ff=founderFlagState(o); detail("founder", ff.known ? (ff.value?"да":"нет") : "поле не передано");
      var ctx=page.querySelector('[data-g="identity-context"]');
      if(ctx)ctx.textContent=(o.name||o.object_id||"Объект")+" · "+(o.object_id||"ID не передан")+" · источник Continuity";
      var ask=page.querySelector('[data-g="ask-navigator"]');
      if(ask)ask.setAttribute("data-cc-steward-context",JSON.stringify({kind:"registry_object",title:o.name||o.object_id||"Объект",sub:o.object_id||"ID не передан",layer:"registry",source:"Continuity / continuity/objects",why:"Показаны только факты текущего объекта, переданные проекцией. Company Memory и размещение не повышают статус этого Object ID автоматически.",details:"Владеющая ветка: "+(o.owning_branch||o.owner||"не передана")+" · состояние: "+(o.declared_status||"не передано")+" · последнее событие: "+(o.last_event_at||"не передано")}));
    }

    var list = page.querySelector('[data-g="objects"]');
    if (list) {
      if (!itemsKnown) {
        list.innerHTML = unavailableHTML("Коллекция объектов не проверена", "Endpoint ответил, но поле items[] не передано.");
        fillRegistryDetail(null);
      } else {
      var recent = items.slice().sort(function (a, b) {
        return String(b.last_event_at || "").localeCompare(String(a.last_event_at || ""));
      });
      var shown = recent.slice(0,12);
      var selectedId = String(page._registrySelectedObjectId || "");
      var selectedIndex = shown.findIndex(function(o){return String(o.object_id||"")===selectedId;});
      if (selectedIndex < 0) selectedIndex = shown.length ? 0 : -1;
      list.innerHTML = shown.length ? shown.map(function (o,idx) {
        return "<button type='button' class='registry-live-row"+(idx===selectedIndex?" selected":"")+"' data-g-select-index='"+idx+"'>" +
          "<b>" + esc(o.object_id || "не определён") + "</b>" +
          "<span>" + esc(o.name || "без названия") + "</span>" +
          "<span>" + esc(o.owning_branch || o.owner || "—") + "</span>" +
          "<span>" + esc(ruStatus(o.declared_status)) + "</span>" +
          "<small>" + esc(ago(o.last_event_at)) + "</small></button>";
      }).join("") : "<div class='registry-empty'><strong>Реестр пуст в текущем items[]</strong><span>Источник явно передал пустой массив объектов.</span></div>";
      if (selectedIndex >= 0) {
        page._registrySelectedObjectId = shown[selectedIndex].object_id || "";
        fillRegistryDetail(shown[selectedIndex]);
      } else fillRegistryDetail(null);
      list.querySelectorAll('[data-g-select-index]').forEach(function(btn){btn.addEventListener("click",function(){
        var idx=Number(btn.getAttribute("data-g-select-index")); if(!isFinite(idx)||!shown[idx])return;
        page._registrySelectedObjectId=shown[idx].object_id||""; fillRegistryDetail(shown[idx]);
        list.querySelectorAll('[data-g-select-index]').forEach(function(x){x.classList.toggle("selected",x===btn);});
      });});
      }
    }

    var founderBox = page.querySelector('[data-g="founder-list"]');
    if (founderBox) {
      if (!itemsKnown) founderBox.innerHTML = unavailableHTML("Founder-флаги объектов не проверены", "objects.items[] не передан.");
      else founderBox.innerHTML = founder.length ? "<div class='registry-mini-list'>" + founder.slice(0, 6).map(function (o) {
        return "<div class='registry-mini-item'><b>" + esc(o.name || o.object_id) + "</b><span>" +
          esc(o.object_id || "не определён") + " · " + esc(ruStatus(o.declared_status)) + "</span></div>";
      }).join("") + "</div>" + (founderUnknown ? "<div class='signals-partial-note warn'>Ещё у " + esc(founderUnknown) + " объект(ов) поля needs_founder / needs_nika не переданы; итог — нижняя граница.</div>" : "") :
      (founderUnknown ? unavailableHTML("Founder-флаги объектов переданы не полностью", "У " + founderUnknown + " объект(ов) needs_founder / needs_nika не переданы; нулевое состояние не подтверждено.") :
      "<div class='registry-empty compact'><strong>Нет объектов, явно помеченных как требующие участия Основателя</strong><span>Для всех объектов Founder-флаг передан, явных true нет.</span></div>");
    }

    var blockerBox = page.querySelector('[data-g="blockers-list"]');
    if (blockerBox) {
      if (!sourceState.blockers.ok || !blockersResp) {
        blockerBox.innerHTML = unavailableHTML("Блокеры недоступны", "Список не выводится по данным объектов или по догадке.");
      } else if (!Array.isArray(blockersResp.items)) {
        blockerBox.innerHTML = unavailableHTML("Коллекция blocker-записей не проверена", "Endpoint ответил, но поле items[] не передано.");
      } else {
        var blockerRecords = blockersResp.items.filter(function (b) {
          return !b.is_test && String(b.status || "").toUpperCase() !== "CLEARED";
        });
        var blockerGroups={};
        blockerRecords.forEach(function(b){
          var id=String(b.object_id||"объект не определён");
          if(!blockerGroups[id]) blockerGroups[id]={id:id,items:[],latest:null,age:null};
          blockerGroups[id].items.push(b);
          var at=b.updated_at||b.opened_at||null, age=daysSince(at);
          if(at && (!blockerGroups[id].latest || String(at)>String(blockerGroups[id].latest))){blockerGroups[id].latest=at;blockerGroups[id].age=age;}
        });
        var groupedBlockers=Object.keys(blockerGroups).map(function(k){return blockerGroups[k];}).sort(function(a,b){return String(b.latest||"").localeCompare(String(a.latest||""));});
        var recentBlockers=blockerRecords.filter(function(b){var a=daysSince(b.updated_at||b.opened_at);return a!=null&&a<STALE_DAYS;}).length;
        blockerBox.innerHTML = blockerRecords.length ? "<div class='registry-blocker-summary'><b>"+esc(groupedBlockers.length)+" объектов</b><span>"+esc(blockerRecords.length)+" открытых записей · "+esc(recentBlockers)+" с движением менее "+esc(STALE_DAYS)+" дней назад · "+esc(blockerRecords.length-recentBlockers)+" старых записей</span></div><div class='registry-mini-list'>" + groupedBlockers.slice(0, 6).map(function (g) {
          var latest=g.items.slice().sort(function(a,b){return String(b.updated_at||b.opened_at||"").localeCompare(String(a.updated_at||a.opened_at||""));})[0]||{};
          return "<div class='registry-mini-item'><b>" + esc(g.id) + " · " + esc(g.items.length) + " записей</b><span>" +
            esc(g.age==null?"дата последнего движения не передана":("последнее движение "+g.age+" дн. назад")) + "</span><small>"+esc(cut(latest.title||latest.blocker||"Описание не передано",150))+"</small></div>";
        }).join("") + "</div>" + (groupedBlockers.length>6?"<div class='signals-partial-note'>Ещё "+esc(groupedBlockers.length-6)+" объект(а) со blocker-записями скрыты из краткого обзора.</div>":"") :
        "<div class='registry-empty compact'><strong>Нет нетестовых blocker-записей без явного CLEARED</strong><span>Текущая проекция Continuity не содержит OPEN или записей с неизвестным lifecycle.</span></div>";
      }
    }

    var recentBox = page.querySelector('[data-g="recent-list"]');
    if (recentBox) {
      if (!itemsKnown) recentBox.innerHTML = unavailableHTML("История объектов не проверена", "objects.items[] не передан.");
      else {
      var changed = items.filter(function (o) { return o.last_event_at; }).sort(function (a, b) {
        return String(b.last_event_at).localeCompare(String(a.last_event_at));
      }).slice(0, 6);
      recentBox.innerHTML = changed.length ? "<div class='registry-mini-list'>" + changed.map(function (o) {
        return "<div class='registry-mini-item'><b>" + esc(o.name || o.object_id) + "</b><span>" +
          esc(ruStatus(o.declared_status)) + " · " + esc(ago(o.last_event_at)) + "</span></div>";
      }).join("") + "</div>" :
      "<div class='registry-empty compact'><strong>Нет событий с датой</strong><span>Текущий items[] не содержит last_event_at. Это не считается проблемой идентичности или доказательством отсутствия изменений.</span></div>";
      }
    }

    var blockersKnownForBadge = !!(sourceState.blockers.ok && blockersResp && Array.isArray(blockersResp.items));
    pageBadge("registry", itemsKnown && blockersKnownForBadge ? "live" : "warn", itemsKnown && blockersKnownForBadge ? "ДАННЫЕ ПОДКЛЮЧЕНЫ" : "ДАННЫЕ ЧАСТИЧНО");
  }

  function renderDocuments(health, testingSummary) {
    var page = document.querySelector('[data-page-panel="documents"]');
    if (!page) return;
    var keys = ["durable", "review", "quarantine", "unknown"];
    if (!sourceState.hubHealth.ok || !health) {
      keys.forEach(function (k) { var e = page.querySelector('[data-d="' + k + '"]'); if (e) e.textContent = "Недоступно"; });
      var q = page.querySelector('[data-d="queue"]');
      if (q) q.innerHTML = unavailableHTML("Hub / Durability недоступен", "Очередь ручного разбора не подтверждена.");
      pageBadge("documents", "unavailable", "ИСТОЧНИК НЕДОСТУПЕН");
      return;
    }
    var reviewQueueKnown = !!(health.review_queue && typeof health.review_queue === "object" && !Array.isArray(health.review_queue));
    var rq = reviewQueueKnown ? health.review_queue : {};
    var vals = {
      durable: health.objects_on_disk == null ? "—" : health.objects_on_disk,
      review: rq.actionable_review == null ? "—" : rq.actionable_review,
      quarantine: rq.unassigned_review_quarantine == null ? "—" : rq.unassigned_review_quarantine,
      unknown: rq.unknown_classification == null ? "—" : rq.unknown_classification
    };
    Object.keys(vals).forEach(function (k) { var e = page.querySelector('[data-d="' + k + '"]'); if (e) e.textContent = vals[k]; });
    [["durability-disk",health.objects_on_disk],["durability-orphans",health.orphan_receipts],["durability-hash",health.hash_mismatches],["durability-coverage",health.coverage]].forEach(function(kv){var e=page.querySelector('[data-d="'+kv[0]+'"]');if(e)e.textContent=kv[1]==null?"—":humanCode(kv[1]);});
    var durableNote = page.querySelector('[data-d="durable-note"]');
    if (durableNote) {
      var indexed = health.indexed_ok;
      var unindexed = health.unindexed;
      var orphan = health.orphan_receipts;
      var excludedTestOrphans = health.excluded_test_orphan_receipts;
      var hashMismatch = health.hash_mismatches;
      durableNote.textContent = "на диске: " + (health.objects_on_disk == null ? "—" : health.objects_on_disk) +
        " · индексировано: " + (indexed == null ? "—" : indexed) +
        " · не индексировано: " + (unindexed == null ? "—" : unindexed) +
        " · осиротевших расписок: " + (orphan == null ? "—" : orphan) +
        " · доказанно исключено self-test расписок: " + (excludedTestOrphans == null ? "—" : excludedTestOrphans) +
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
      var actionable = countOrNull(rq.actionable_review);
      var nonManual = countOrNull(rq.non_manual_pending);
      var unassigned = countOrNull(rq.unassigned_review_quarantine);
      var legacyQuarantine = countOrNull(rq.legacy_unassigned_quarantine);
      var newQuarantine = countOrNull(rq.new_unassigned_quarantine);
      var oldestLiveReview = rq.oldest_live_review_minutes == null ? "—" : ageMinutesLabel(rq.oldest_live_review_minutes);
      var op = countOrNull(rq.operational_evidence);
      var work = countOrNull(rq.working_reference);
      var canonical = countOrNull(rq.canonical_review);
      var canonicalActive = countOrNull(rq.canonical_review_active);
      var historical = countOrNull(rq.historical_testing_review);
      var unknown = countOrNull(rq.unknown_classification);
      var testingAvailable = !!(sourceState.testingSummary.ok && testingSummary);
      var testingState = testCollectionState(testingSummary);
      var testingComplete = testingAvailable && testingState.activeKnown && testingState.recentKnown;
      var tests = testingAvailable ? allTests(testingSummary) : [];
      var adjudication = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "NEEDS_ADJUDICATION"; });
      var reviewRowsKnown = Array.isArray(health.review_rows);
      var rows = reviewRowsKnown ? health.review_rows : [];
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
        "<div class='doc-integrity-boundary'><b>Граница сохранности:</b><span>Hub сообщает " + esc(health.objects_on_disk == null ? "—" : health.objects_on_disk) + " объектов на диске, из них индексировано " + esc(health.indexed_ok == null ? "—" : health.indexed_ok) + ", не индексировано " + esc(health.unindexed == null ? "—" : health.unindexed) + ". Осиротевших расписок: " + esc(health.orphan_receipts == null ? "—" : health.orphan_receipts) + "; доказанно исключённых self-test расписок: " + esc(health.excluded_test_orphan_receipts == null ? "—" : health.excluded_test_orphan_receipts) + "; расхождений хэшей: " + esc(health.hash_mismatches == null ? "—" : health.hash_mismatches) + ". Исключение self-test не удаляет исходную receipt и не распространяется на другие orphan. Наличие файла на диске не повышается до доказанного полного readback.</span></div>" +
        "<div class='doc-evidence-head'><div><small>КЛАССИФИКАЦИЯ НЕРАЗОБРАННОГО КОНТУРА</small><b>" + esc(roleTotal != null ? roleTotal + " артефактов распределены по переданным ролям" : (rq.still_unreviewed != null ? rq.still_unreviewed + " остаются неразобранными; полный role-breakdown не передан" : "разбивка по ролям не передана")) + "</b></div><span>назначено на разбор владельцам: <strong>" + esc(shownCount(actionable)) + "</strong> · гейт Основателя: <strong>" + esc(rq.founder_gate_required==null?"—":rq.founder_gate_required) + "</strong> · карантин без владельца: <strong>" + esc(shownCount(unassigned)) + "</strong> · неручной pending: <strong>" + esc(shownCount(nonManual)) + "</strong></span></div>" +
        "<div class='doc-role-grid'>" +
          "<div class='operational'><small>Операционные свидетельства</small><b>" + esc(shownCount(op)) + "</b><span>рабочий след; сам по себе не меняет канон</span></div>" +
          "<div class='working'><small>Рабочие ссылки</small><b>" + esc(shownCount(work)) + "</b><span>справочный материал</span></div>" +
          "<div class='canonical'><small>Канонический разбор</small><b>" + esc(shownCount(canonical)) + "</b><span>активны " + esc(shownCount(canonicalActive)) + " · исторические " + esc(shownCount(historical)) + "</span></div>" +
          "<div class='unknown'><small>Не классифицировано</small><b>" + esc(shownCount(unknown)) + "</b><span>нужен ручной разбор роли</span></div>" +
        "</div>" +
        (matched && matchedTest ?
          "<div class='doc-test-link'><div><small>ТОЧНАЯ СВЯЗЬ С ТЕКУЩЕЙ ПРОВЕРКОЙ</small><b>" + esc(matchedTest.test_id || "—") + "</b><span>Testing: " + esc(ruStatus(matchedTest.status)) + " · Hub: канонический разбор · ревизия " + esc(matched.revision != null ? matched.revision : "—") + "</span></div>" +
          "<div class='doc-test-state'><strong>" + esc(authorityRu) + "</strong><span>связь установлена только по точному test_id; доказательства прогона не приравниваются к принятию научного вывода</span></div></div>" :
          ((reviewRowsKnown && testingComplete) ?
            "<div class='doc-test-link calm'><div><small>СВЯЗЬ С ТЕКУЩЕЙ ПРОВЕРКОЙ</small><b>Точного совпадения test_id в текущих полных наборах не найдено</b><span>Панель не связывает артефакты с тестом по названию или похожему тексту.</span></div></div>" :
            "<div class='doc-test-link calm'><div><small>СВЯЗЬ С ТЕКУЩЕЙ ПРОВЕРКОЙ</small><b>Полнота сверки не подтверждена</b><span>" + esc(!reviewRowsKnown ? "review_rows не передан Hub." : "Testing active[] или recent[] не передан; отсутствие совпадения не доказано.") + "</span></div></div>")) +
        "<div class='doc-evidence-rule'>Текущая очередь действия задаётся полем actionable_review. В этом чтении manual_review_required="+esc(shownCount(manual))+" раскладывается на actionable="+esc(shownCount(actionable))+" и карантин без назначенного владельца="+esc(shownCount(unassigned))+(legacyQuarantine!=null?" (legacy "+esc(legacyQuarantine)+(newQuarantine!=null?", новые "+esc(newQuarantine):"")+")":"")+". Старейшая живая review-поверхность: "+esc(oldestLiveReview)+". Карантин и исторические тестовые разборы не становятся задачами Основателя автоматически.</div>";
    }
    var q = page.querySelector('[data-d="queue"]');
    if (q) {
      var reviewRowsKnown = Array.isArray(health.review_rows);
      var actionableRows = reviewRowsKnown ? health.review_rows.filter(function(r){return r&&r.still_pending!==false&&String(r.review_authority_state||"").toUpperCase()==="ACTIONABLE_REVIEW";}) : [];
      var manualQueueCount = numberOrNull(rq.actionable_review);
      var founderGate = numberOrNull(rq.founder_gate_required);
      var queueIntro = "<div class='documents-queue-truth'><b>"+esc(manualQueueCount==null?"Действующая очередь не передана":manualQueueCount+" разбора назначены конкретным владельцам")+"</b><span>"+esc("гейт Основателя: "+(founderGate==null?"не передан":founderGate)+". "+(rq.unassigned_review_quarantine==null?"Карантин не передан":rq.unassigned_review_quarantine+" записей находятся в карантине без владельца")+". Карантин не считается задачей Ники.")+"</span></div>";
      if (!reviewQueueKnown || !reviewRowsKnown) {
        q.innerHTML = unavailableHTML("Очередь ручного разбора не проверена полностью", !reviewQueueKnown?"Поле review_queue в Hub не передано.":"review_queue передан, но review_rows[] отсутствует; идентичность actionable review не подтверждена.");
      } else if (actionableRows.length) {
        q.innerHTML = queueIntro + actionableRows.map(function(r){
          var ageMin=r.received_at?Math.max(0,Math.round((Date.now()-new Date(r.received_at).getTime())/60000)):null;
          return "<div class='document-live-row'><b>"+esc(r.test_id||r.packet_file||"review без ID")+"<small>"+esc(r.artifact_class==="CANONICAL_REVIEW"?"канонический разбор":humanCode(r.artifact_class||"UNKNOWN"))+"</small></b><span>"+esc(r.review_owner_id||r.owning_branch||"владелец не передан")+"</span><span>"+esc("владелец: "+(r.review_owner_kind?humanCode(r.review_owner_kind):"не передан")+" · "+(r.review_authority_basis?humanCode(r.review_authority_basis):"основание полномочий не передано"))+"</span><small>"+esc(ageMinutesLabel(ageMin))+"</small></div>";
        }).join("");
      } else if (manualQueueCount===0) {
        q.innerHTML = queueIntro + "<div class='documents-empty compact'><strong>Назначенных разборов = 0</strong><span>Назначенных ручных review сейчас нет.</span></div>";
      } else {
        q.innerHTML = queueIntro + unavailableHTML("Счётчик и идентичные строки расходятся", "actionable_review ненулевой, но review_rows[] не содержит ACTIONABLE_REVIEW. Панель не подставляет oldest_5 вместо действующей очереди.");
      }
    }
    var recentBox = page.querySelector('[data-d="recent"]');
    if (recentBox) {
      var recentKnown = Array.isArray(health.recent_48h);
      var recent = recentKnown ? health.recent_48h.slice().sort(function(a,b){return String(b.received_at||"").localeCompare(String(a.received_at||""));}) : [];
      if (!recentKnown) {
        recentBox.innerHTML = unavailableHTML("Недавние поступления не проверены", "Hub не передал поле recent_48h[]. Панель не реконструирует историю по файловым именам.");
      } else if (!recent.length) {
        recentBox.innerHTML = "<div class='documents-empty compact'><strong>За последние 48 часов поступлений нет</strong><span>Hub явно передал пустой recent_48h[]. Это говорит только о приёме пакетов в этом окне.</span></div>";
      } else {
        var reviewRows = Array.isArray(health.review_rows) ? health.review_rows : [];
        var reviewByFile = {};
        reviewRows.forEach(function(x){var k=String(x&&x.packet_file||"");if(k&&!reviewByFile[k])reviewByFile[k]=x;});
        recentBox.innerHTML = recent.slice(0,8).map(function(r){
          var transport=[];
          if(r.server===true)transport.push("на сервере"); else if(r.server===false)transport.push("нет на сервере");
          if(r.index===true)transport.push("в индексе"); else if(r.index===false)transport.push("не в индексе");
          if(r.outbox===true)transport.push("виден в исходящей очереди");
          var review = r.review==null || r.review==="" ? "разбор не передан" : humanCode(r.review);
          var prov = reviewByFile[String(r.filename||"")] || null;
          var provText = prov ? ((prov.claimed_object_id||"Object ID не передан") + (prov.artifact_class?" · "+humanCode(prov.artifact_class):"") + (prov.sha256?" · SHA-256 "+String(prov.sha256).slice(0,12)+"…":"")) : "строка происхождения по точному имени файла не найдена";
          return "<div class='document-live-row'><b>"+esc(r.filename||"файл без имени")+"<small>"+esc(provText)+"</small></b><span>"+esc(r.branch||"ветка не указана")+"</span><span>"+esc((transport.length?transport.join(" · ")+" · ":"")+review)+"</span><small>"+esc(r.received_at?ago(r.received_at):"время не передано")+"</small></div>";
        }).join("")+"<p class='documents-note'>Происхождение добавляется только по точному совпадению filename = packet_file в review_rows[]. Отсутствие совпадения не заполняется по сходству названий. Поступление в Hub не доказывает публикацию, заморозку, замену версии или изменение канонической роли артефакта.</p>";
      }
    }

    var unresolvedBox = page.querySelector('[data-d="unresolved"]');
    if (unresolvedBox) {
      var unresolvedRowsKnown = Array.isArray(health.review_rows);
      var unresolvedRows = unresolvedRowsKnown ? health.review_rows.filter(function(r){return String(r&&r.artifact_class||"").toUpperCase()==="UNKNOWN" && r.still_pending!==false;}).sort(function(a,b){return String(b.received_at||"").localeCompare(String(a.received_at||""));}) : [];
      if (!unresolvedRowsKnown) {
        unresolvedBox.innerHTML = unavailableHTML("Неопределённые связи не проверены", "Hub не передал review_rows[]. Панель не строит список по именам файлов.");
      } else if (!unresolvedRows.length) {
        unresolvedBox.innerHTML = "<div class='documents-empty compact'><strong>Активных UNKNOWN-строк нет</strong><span>В переданном review_rows[] не найдено pending-артефактов с artifact_class=UNKNOWN.</span></div>";
      } else {
        unresolvedBox.innerHTML = unresolvedRows.slice(0,6).map(function(r){
          var claimed=String(r.claimed_object_id||"").trim();
          var obj = claimed && !/^unresolved$/i.test(claimed) ? claimed : "Object ID не разрешён";
          var reason = r.classification_reason ? humanCode(r.classification_reason) : "причина классификации не передана";
          return "<div class='document-live-row'><b>"+esc(r.packet_file||"артефакт без имени")+"</b><span>"+esc(obj)+"</span><span>"+esc(reason)+"</span><small>"+esc(r.received_at?ago(r.received_at):"время не передано")+"</small></div>";
        }).join("")+"<p class='documents-note'>Показаны только активные строки review_rows[] с artifact_class=UNKNOWN. Имя файла не используется для назначения объекта или канонической роли.</p>";
      }
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
      ["founder", "active", "adjudication", "rerun"].forEach(function (k) {
        var e = page.querySelector('[data-t="' + k + '"]'); if (e) e.textContent = "Недоступно";
      });
      var q = page.querySelector('[data-t="queue"]');
      if (q) q.innerHTML = unavailableHTML("Testing summary недоступен", "Очередь проверок не подтверждена.");
      ["lineage","evidence-chain"].forEach(function(k){var e=page.querySelector('[data-t="'+k+'"]');if(e)e.innerHTML=unavailableHTML("Testing summary недоступен", "Происхождение и доказательства результата не реконструируются из старых данных.");});
      pageBadge("testing", "unavailable", "ИСТОЧНИК НЕДОСТУПЕН");
    } else {
      var testState = testCollectionState(summary);
      var testComplete = testState.activeKnown && testState.recentKnown;
      var tests = allTests(summary);
      var waiting = tests.filter(function (t) { return ["REQUESTED", "READY"].indexOf(String(t.status || "").toUpperCase()) >= 0; });
      var founderItems = Array.isArray(summary.needs_founder) ? summary.needs_founder : [];
      var founderKnown = Array.isArray(summary.needs_founder);
      var adj = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "NEEDS_ADJUDICATION"; });
      var rerun = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "RERUN_REQUIRED"; });
      var active = testState.activeKnown ? summary.active : [];

      [["founder", founderItems.length, founderKnown], ["active", active.length, testState.activeKnown], ["adjudication", adj.length, testComplete], ["rerun", rerun.length, testComplete]].forEach(function (kv) {
        var e = page.querySelector('[data-t="' + kv[0] + '"]'); if (e) e.textContent = kv[2] ? String(kv[1]) : "≥ " + String(kv[1]);
      });

      var q = page.querySelector('[data-t="queue"]');
      if (q) {
        tests.sort(function (a, b) { return String(b.updated_at || "").localeCompare(String(a.updated_at || "")); });
        q.innerHTML = tests.length ? tests.slice(0, 10).map(function (t) {
          return "<div class='testing-live-row'><b>" + esc(t.test_id || "—") + "<small>" + esc(t.object_id || "не определён") + "</small></b>" +
            "<span>" + esc(t.owning_branch || "—") + "</span><span>" + esc(testTypesRu(t.test_type)) + "</span>" +
            "<em>" + esc(ruStatus(t.status)) + "</em><span>" + esc(testOutcomeRu(t.next_action || t.scientific_outcome || "—")) + "</span></div>";
        }).join("") + (!testComplete ? "<div class='signals-partial-note warn'>Показаны тесты только из переданных массивов; active[] или recent[] отсутствует, список неполный.</div>" : "") :
        (testComplete ? "<div class='testing-empty compact'><strong>Тестов в текущем summary нет</strong><span>Источник явно передал пустые active[] и recent[].</span></div>" : unavailableHTML("Набор тестов прочитан частично", "Переданный массив пуст, но active[] или recent[] отсутствует — общий ноль не подтверждён."));
      }

      var focus = page.querySelector('[data-t="focus"]');
      if (focus) {
        var primary = adj[0] || null;
        if (primary) {
          var types = testTypesRu(primary.test_type).split(" · ");
          var evidenceKnown = Array.isArray(primary.evidence_refs);
          var evidenceN = evidenceKnown ? primary.evidence_refs.length : null;
          var proc = testOutcomeRu(primary.procedure_status || "процедурный статус не передан");
          var outcome = testOutcomeRu(primary.scientific_outcome || "научный исход не передан");
          var next = researchTextRu(primary.delivery_next_action || primary.next_action || "следующий ход не передан");
          focus.innerHTML =
            "<div class='testing-focus-head'><div><small>РЕЗУЛЬТАТ ЖДЁТ РАЗБОРА ВЛАДЕЮЩЕЙ ВЕТКИ · НЕ ЗАДАЧА ОСНОВАТЕЛЯ</small><b>" + esc(primary.test_id || "проверка без ID") + "</b><span>" + esc(primary.owning_branch || "владеющая ветка не указана") + "</span></div><a href='#research'>Открыть исследования →</a></div>" +
            "<div class='testing-focus-chain'>" +
              "<div class='pass'><small>01 · Процедура</small><strong>" + esc(proc) + "</strong><span>техническое качество прогона</span></div>" +
              "<i>≠</i>" +
              "<div class='review'><small>02 · Научный исход</small><strong>" + esc(outcome) + "</strong><span>не повышается до PASS автоматически</span></div>" +
              "<i>→</i>" +
              "<div><small>03 · Следующий ход</small><strong>" + esc(next) + "</strong><span>решение остаётся у владеющей ветки</span></div>" +
            "</div>" +
            "<div class='testing-focus-meta'><span><small>Что проверялось</small><b>" + esc(types.join(" · ") || "—") + "</b></span><span><small>Доказательств прогона</small><b>" + esc(evidenceN == null ? "—" : evidenceN + " ссылок") + "</b></span><span><small>Публикация результата</small><b>" + esc(primary.delivery_state ? researchTextRu(humanCode(primary.delivery_state)) : "—") + (primary.delivery_revision != null ? " · ревизия " + esc(primary.delivery_revision) : "") + "</b></span><span><small>Обновлено</small><b>" + esc(primary.updated_at ? ago(primary.updated_at) : "—") + "</b></span></div>" +
            "<div class='testing-focus-rule'>Процедурный PASS подтверждает исполнение протокола, а не исследовательскую гипотезу. До разбора владеющей веткой Панель сохраняет научный исход как незавершённый.</div>";
        } else {
          focus.innerHTML = testComplete ?
            "<div class='testing-focus-calm'><strong>Нет результатов, ожидающих содержательного разбора</strong><span>Полные active[] + recent[] не содержат NEEDS_ADJUDICATION.</span></div>" :
            unavailableHTML("Отсутствие NEEDS_ADJUDICATION не подтверждено", "active[] или recent[] не передан; доступная часть не содержит такого состояния.");
        }
      }

      var att = page.querySelector('[data-t="attention"]');
      if (att) {
        var blocked = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "BLOCKED"; });
        var n = adj.length + rerun.length + blocked.length;
        att.innerHTML = "<div class='testing-attention-main'><span class='testing-signal-ring'>" + esc(testComplete ? n : "≥ " + n) + "</span><div><strong>" +
          (n ? "Есть проверки, требующие работы контура" : (testComplete ? "Нет тестов, требующих работы контура" : "Общий ноль не подтверждён")) + "</strong><p>" +
          (n ? "Системная работа: разбор владеющей ветки " + adj.length + " · технический повтор " + rerun.length + " · заблокировано входом/условиями " + blocked.length + " · действия Ники: " + (founderKnown ? founderItems.length : "не проверено") + (testComplete ? "" : " · набор неполный") :
               (testComplete ? "Полные active[] + recent[] не содержат NEEDS_ADJUDICATION, RERUN_REQUIRED или BLOCKED." : "Доступная часть не содержит этих состояний, но active[] или recent[] не передан.")) +
          "</p></div></div><div class='testing-attention-rule'>Системная или веточная работа не становится задачей Основателя автоматически. Техническое завершение прогона не является научным выводом.</div>";
      }

      var recentBox = page.querySelector('[data-t="recent"]');
      if (recentBox) {
        var recent = testState.recentKnown ? summary.recent.slice(0, 6) : [];
        recentBox.innerHTML = recent.length ? "<div class='testing-mini-list'>" + recent.map(function (t) {
          return "<div class='testing-mini-item'><b>" + esc(t.test_id || "—") + "</b><span>" +
            esc(testOutcomeRu(t.procedure_status || "процедура не указана")) + " · " + esc(testOutcomeRu(t.scientific_outcome || "научный исход не указан")) +
            " · " + esc(ago(t.updated_at)) + "</span></div>";
        }).join("") + "</div>" :
        (testState.recentKnown ? "<div class='testing-empty compact'><strong>recent[] пуст</strong><span>Это не доказывает отсутствие завершённых проверок вне этого списка.</span></div>" : unavailableHTML("Недавние результаты не проверены", "Поле recent[] в Testing summary не передано."));
      }

      var adjBox = page.querySelector('[data-t="adjudication-list"]');
      if (adjBox) {
        adjBox.innerHTML = adj.length ? "<div class='testing-mini-list'>" + adj.slice(0, 6).map(function (t) {
          return "<div class='testing-mini-item'><b>" + esc(t.test_id || "—") + "</b><span>" +
            esc(t.owning_branch || "владеющая ветка не указана") + " · " + esc(testOutcomeRu(t.scientific_outcome || "нужен разбор")) + "</span></div>";
        }).join("") + "</div>" :
        (testComplete ? "<div class='testing-empty compact'><strong>NEEDS_ADJUDICATION не найден</strong><span>Полные active[] + recent[] не содержат такого состояния.</span></div>" : unavailableHTML("Потребность в разборе не подтверждена", "Доступная часть не содержит NEEDS_ADJUDICATION, но набор тестов неполный."));
      }

      var lineageTest = adj[0] || tests[0] || null;
      var lineageBox = page.querySelector('[data-t="lineage"]');
      var evidenceChain = page.querySelector('[data-t="evidence-chain"]');
      function fileNameOnly(v){var s=String(v||"");return s?s.split("/").pop():"—";}
      if (lineageBox) {
        if (!lineageTest) lineageBox.innerHTML = testComplete ? "<div class='testing-empty compact'><strong>Нет теста для цепочки происхождения</strong><span>Полный Testing summary не содержит активного или недавнего теста.</span></div>" : unavailableHTML("Цепочка происхождения не подтверждена", "Набор тестов неполный.");
        else {
          var requestSha=String(lineageTest.request_sha||"");
          var evidenceKnown=Array.isArray(lineageTest.evidence_refs), evidenceN=evidenceKnown?lineageTest.evidence_refs.length:null;
          lineageBox.innerHTML="<div class='lineage-chain'>"+
            "<div><span>1</span><b>Запрос</b><small>"+esc(lineageTest.test_id||"test ID не передан")+(requestSha?" · SHA "+esc(requestSha.slice(0,12))+"…":" · SHA не передан")+"</small></div><i>→</i>"+
            "<div><span>2</span><b>Текущий гейт</b><small>"+esc(lineageTest.current_gate||"не передан")+"</small></div><i>→</i>"+
            "<div><span>3</span><b>Результат</b><small>"+esc(fileNameOnly(lineageTest.result_path))+"</small></div><i>→</i>"+
            "<div><span>4</span><b>Доказательства</b><small>"+esc(evidenceKnown?evidenceN+" ссылок":"evidence_refs[] не передан")+"</small></div><i>→</i>"+
            "<div><span>5</span><b>Доставка</b><small>"+esc(lineageTest.delivery_state?humanCode(lineageTest.delivery_state):"не передана")+(lineageTest.delivery_revision!=null?" · ревизия "+esc(lineageTest.delivery_revision):"")+"</small></div></div>"+
            "<p class='testing-note'>Владеющая ветка: "+esc(lineageTest.owning_branch||"не передана")+". Отдельные protocol_id / run_id Testing summary не передаёт; Панель не выводит их из путей request_path/result_path.</p>";
        }
      }
      if (evidenceChain) {
        if (!lineageTest) evidenceChain.innerHTML = testComplete ? "<div class='testing-empty compact'><strong>Нет результата для доказательной карточки</strong></div>" : unavailableHTML("Доказательства не проверены", "Набор тестов неполный.");
        else {
          var ers=Array.isArray(lineageTest.evidence_refs)?lineageTest.evidence_refs:[];
          evidenceChain.innerHTML="<div class='testing-evidence-grid'>"+
            "<div><small>Файл результата</small><strong data-t-evidence='result'>"+esc(fileNameOnly(lineageTest.result_path))+"</strong><span>только имя файла из result_path; путь на сервере не показывается</span></div>"+
            "<div><small>SHA запроса</small><strong data-t-evidence='request-sha'>"+esc(lineageTest.request_sha?String(lineageTest.request_sha).slice(0,12)+"…":"—")+"</strong><span>request_sha из Testing summary</span></div>"+
            "<div><small>Ссылки на доказательства</small><strong data-t-evidence='refs'>"+esc(Array.isArray(lineageTest.evidence_refs)?ers.length:"—")+"</strong><span>количество evidence_refs; содержание не повышается до принятого вывода</span></div></div>";
        }
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

    if (!Array.isArray(objectsResp.items)) {
      pageBadge("research", "warn", "OBJECTS ENDPOINT ОТВЕТИЛ · items[] НЕ ПЕРЕДАН");
      ["active-count", "founder-count", "waiting-count", "identity-count"].forEach(function (k) {
        var e = page.querySelector('[data-r="' + k + '"]'); if (e) e.textContent = "—";
      });
      var missingItems = page.querySelector('[data-r="lines"]');
      if (missingItems) missingItems.innerHTML = unavailableHTML("Исследовательский портфель не проверен", "Continuity objects ответил, но поле items[] не передано. Пустой портфель из этого не следует.");
      sourceState.researchRD1 = { ok: false, complete: false, at: new Date().toISOString(), error: "objects.items missing" };
      return Promise.resolve();
    }

    var items = objectsResp.items;
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
      var rd1Complete = successes === attempted;
      sourceState.researchRD1 = {
        ok: attempted === 0 ? true : successes > 0,
        complete: rd1Complete,
        at: now,
        error: rd1Complete ? null : (attempted - successes) + " projection read(s) failed"
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
      var activeStatusComplete = lines.every(function (x) {
        return !!(x.object.declared_status || x.projection.status);
      });
      var founder = lines.filter(function (x) { return founderFlagState(x.object).value; });
      var founderFlagsComplete = lines.every(function (x) { return founderFlagState(x.object).known; });
      var founderAssigned = lines.filter(function (x) { return /^(NIKA|НИКА|FOUNDER|ОСНОВАТЕЛ)/i.test(String(x.projection.owner || "").trim()); });
      var founderAssignedFresh = founderAssigned.filter(function (x) { var d=daysSince(x.projection.semantic_freshness); return d!=null && d<STALE_DAYS; });
      var founderAssignedStale = founderAssigned.filter(function (x) { var d=daysSince(x.projection.semantic_freshness); return d!=null && d>=STALE_DAYS; });
      var founderProjectionRead = !!(sourceState.founderProjection.ok && founderProjection);
      var founderDecisionsKnown = !!(founderProjectionRead && founderProjection.today && Array.isArray(founderProjection.today.founder_decisions));
      var formalDecisions = founderDecisionsKnown ? founderProjection.today.founder_decisions : [];
      var founderNote = page.querySelector('[data-r="founder-note"]');
      var waiting = lines.filter(function (x) {
        var declared = String(x.object.declared_status || "").toUpperCase();
        var projected = String(x.projection.status || "").toUpperCase();
        var owner = String(x.projection.owner || "").toUpperCase();
        // Waiting is source-stated, not inferred from PREPARING/active design.
        return /PARKED|WAITING|AWAITING/.test(declared) || /PARKED|WAITING|AWAITING|PENDING_.*_ACK/.test(projected) || /EXTERNAL/.test(owner);
      });
      var blocked = lines.filter(function (x) { return /BLOCKED/.test(String(x.projection.status || "").toUpperCase()); });
      var freshRD1 = lines.filter(function (x) { var d=daysSince(x.projection.semantic_freshness); return d!=null && d<STALE_DAYS; });
      var freshActive = active.filter(function (x) { var d=daysSince(x.projection.semantic_freshness); return d!=null && d<STALE_DAYS; });
      var staleActive = active.filter(function (x) { var d=daysSince(x.projection.semantic_freshness); return d!=null && d>=STALE_DAYS; });
      var activeFreshnessUnknown = active.length-freshActive.length-staleActive.length;
      var activeNote = page.querySelector('[data-r="active-note"]');
      if (activeNote) activeNote.textContent = (rd1Complete && activeStatusComplete ? active.length : "≥ " + active.length) + " формально ACTIVE* · " + freshActive.length + " со свежим RD1 · " + staleActive.length + " без движения 7+ дней" + (activeFreshnessUnknown ? " · " + activeFreshnessUnknown + " без даты свежести" : "");
      if (founderNote) founderNote.textContent = "явных назначений хода в RD1: " + (rd1Complete ? founderAssigned.length : "≥ " + founderAssigned.length) + " · свежих: " + founderAssignedFresh.length + " · старых: " + founderAssignedStale.length +
        (founderDecisionsKnown ? " · текущих формальных решений: " + formalDecisions.length : " · формальные решения не проверены") +
        (founderFlagsComplete ? " · специальных флагов участия Основателя: " + founder.length : " · специальные флаги участия Основателя переданы не для всех линий");

      function put(k, v) { var e = page.querySelector('[data-r="' + k + '"]'); if (e) e.textContent = String(v); }
      put("active-count", rd1Complete && activeStatusComplete ? freshActive.length : "≥ " + freshActive.length);
      put("founder-count", rd1Complete ? founderAssignedFresh.length : "≥ " + founderAssignedFresh.length);
      put("waiting-count", rd1Complete ? waiting.length : "≥ " + waiting.length);
      put("identity-count", rd1Complete ? blocked.length : "≥ " + blocked.length);

      var linesBox = page.querySelector('[data-r="lines"]');
      if (linesBox) {
        var orderedResearchLines=lines.slice().sort(function(a,b){return String(b.projection.semantic_freshness||"").localeCompare(String(a.projection.semantic_freshness||""));});
        linesBox.innerHTML = orderedResearchLines.length ? orderedResearchLines.map(function (x) {
          var o = x.object, p = x.projection;
          var stageRaw = p.stage || "этап не указан";
          var nextRaw = p.next_gate || p.next_move || "не определён";
          var rd1Age=daysSince(p.semantic_freshness);
          return "<div class='research-live-row'><b>" + esc(researchObjectTitle(o)) +
            "<small>" + esc(o.object_id || "ID не определён") + " · объект: " + esc(ruStatus(o.declared_status || "—")) + "</small></b>" +
            "<span title='" + esc(stageRaw) + "'>" + esc(researchTextRu(humanCode(stageRaw))) + "</span>" +
            "<span>" + esc(researchTextRu(p.owner || "владелец хода не передан")) + "</span>" +
            "<span title='" + esc(nextRaw) + "'>" + esc(researchTextRu(humanCode(nextRaw))) + "</span>" +
            "<small>" + esc(researchTextRu(humanCode(ruStatus(p.status || o.declared_status || "—")))) + (rd1Age==null?" · свежесть не передана":" · RD1 "+rd1Age+" дн.") + "</small></div>";
        }).join("") :
        (rd1Complete ?
          "<div class='research-empty'><strong>Исследовательских линий в текущей RD1-проекции нет</strong><span>Все RD1-проекции прочитаны; ни один объект не удовлетворил явному research/RD1-контракту.</span></div>" :
          unavailableHTML("Исследовательский портфель прочитан частично", "Часть RD1-проекций недоступна; общий ноль исследовательских линий не подтверждён."));
      }

      function mini(container, rows, emptyTitle, emptyText) {
        if (!container) return;
        container.innerHTML = rows.length ? "<div class='research-mini-list'>" + rows.join("") + "</div>" :
          "<div class='research-empty compact'><strong>" + esc(emptyTitle) + "</strong><span>" + esc(emptyText) + "</span></div>";
      }

      var founderAttentionRows = founderAssignedFresh.slice(0, 6).map(function (x) {
        var o = x.object, p = x.projection, age=daysSince(p.semantic_freshness);
        return "<div class='research-mini-item'><b>" + esc(researchObjectTitle(o)) + "</b><span>" +
          "свежий явный владелец хода в RD1 · " + esc(researchTextRu(p.next_move || o.last_summary || "следующий ход не передан")) +
          (age==null?" · свежесть не передана":" · состояние обновлено "+age+" дн. назад") + " · " + esc(o.object_id || "ID не определён") + "</span></div>";
      });
      founderAssignedStale.slice(0, Math.max(0, 6-founderAttentionRows.length)).forEach(function(x){
        var o=x.object,p=x.projection,age=daysSince(p.semantic_freshness);
        founderAttentionRows.push("<div class='research-mini-item stale-assignment'><b>"+esc(researchObjectTitle(o))+"</b><span>старое назначение хода в RD1 · "+esc(researchTextRu(p.next_move||o.last_summary||"следующий ход не передан"))+" · последнее смысловое обновление "+esc(age==null?"не датировано":age+" дн. назад")+" · "+esc(o.object_id||"ID не определён")+"</span><small>Назначение не отменяется автоматически, но не считается свежей задачей Основателя.</small></div>");
      });
      formalDecisions.slice(0, Math.max(0, 6 - founderAttentionRows.length)).forEach(function (d) {
        founderAttentionRows.push("<div class='research-mini-item formal-unbound'><b>Формальное решение Основателя · без привязки к линии</b><span>" +
          esc(d.question || "Вопрос решения не передан") + (d.why_now ? " · " + esc(d.why_now) : "") +
          "</span><small>Founder Projection не передаёт object_id / memory_id. Панель не связывает решение с исследовательской линией по похожему тексту.</small></div>");
      });
      var attentionComplete = rd1Complete && founderDecisionsKnown;
      mini(page.querySelector('[data-r="attention"]'), founderAttentionRows,
        attentionComplete ? "Явных ходов или решений Основателя в исследовательском контуре нет" : "Контур участия Основателя прочитан частично",
        attentionComplete ? "Полные RD1-проекции не назначили следующий ход Нике, а Founder Projection не передал текущего формального решения." : "Часть RD1-проекций или founder_decisions[] не подтверждена; общий ноль не выводится.");

      mini(page.querySelector('[data-r="waiting"]'), waiting.slice(0, 6).map(function (x) {
        var o = x.object, p = x.projection;
        return "<div class='research-mini-item'><b>" + esc(researchObjectTitle(o)) + "</b><span>" +
          "ждём: " + esc(researchTextRu(p.next_gate || p.next_move || "условие не описано")) + " · ход: " + esc(researchTextRu(p.owner || "владелец хода не передан")) + "</span></div>";
      }), rd1Complete ? "Линий в ожидании не найдено" : "Контур ожидания прочитан частично",
        rd1Complete ? "Нет явного PARKED / WAITING / AWAITING / PENDING_*_ACK или внешнего владельца хода." : "Часть RD1-проекций недоступна; общий ноль ожидания не подтверждён.");

      var MATERIAL = ["GATE_RESULT", "DECISION", "STATUS_CHANGE", "STAGE_CHANGE", "TEST_RESULT", "EXTERNAL_EVENT"];
      var material = lines.filter(function (x) {
        return MATERIAL.indexOf(String(x.object.last_meaning_kind || "").toUpperCase()) >= 0 && x.object.last_summary;
      }).sort(function (a, b) {
        return String(b.object.last_event_at || "").localeCompare(String(a.object.last_event_at || ""));
      });

      var bridge = page.querySelector('[data-r="system-bridge"]');
      if (bridge) {
        var testingRead = !!(sourceState.testingSummary.ok && testingSummary);
        var researchTestState = testCollectionState(testingSummary);
        var testingAny = !!(testingRead && (researchTestState.activeKnown || researchTestState.recentKnown));
        var testingComplete = !!(testingRead && researchTestState.activeKnown && researchTestState.recentKnown);
        var tests = testingAny ? allTests(testingSummary) : [];
        var adjudication = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "NEEDS_ADJUDICATION"; });
        var blockedTests = tests.filter(function (t) { return String(t.status || "").toUpperCase() === "BLOCKED"; });
        var openTestStates = researchTestState.activeKnown ? testingSummary.active : [];
        var rq = sourceState.hubHealth.ok && hubHealth ? (hubHealth.review_queue || {}) : {};
        var reviewN = rq.actionable_review;
        var reviewQuarantine = rq.unassigned_review_quarantine;
        var leadTest = adjudication[0] || blockedTests[0] || openTestStates[0] || null;
        var latest = material[0] || null;
        var testTitle = leadTest ? (leadTest.test_id || "проверка без ID") : (testingComplete ? "нет проверки, требующей реакции" : "набор Testing неполный");
        var testNote = leadTest ? researchTextRu(humanCode(leadTest.scientific_outcome || leadTest.next_action || leadTest.status || "состояние не передано")) :
          (testingComplete ? "по полному active[] + recent[]" : (testingRead ? "active[] / recent[] переданы не полностью" : "Testing summary недоступен"));
        var latestTitle = latest ? researchObjectTitle(latest.object) : (rd1Complete ? "материальных изменений нет" : "материальные изменения не проверены полностью");
        var latestNote = latest ? researchTextRu(latest.object.last_summary || latest.object.last_meaning_kind || "") :
          (rd1Complete ? "по полной RD1-проекции" : "часть RD1-проекций недоступна");
        bridge.innerHTML =
          "<div class='research-bridge-head'><div><small>ИССЛЕДОВАТЕЛЬСКИЙ ПУЛЬС</small><b>Вопрос → доказательство → независимая проверка → следующий переход</b></div><span>источники не смешиваются</span></div>" +
          "<div class='research-bridge-grid'>" +
          "<a href='#research' class='research-bridge-cell'><small>Портфель</small><strong>" + esc(rd1Complete ? freshActive.length : "≥ " + freshActive.length) + " свежих ACTIVE* · " + esc(rd1Complete ? active.length : "≥ " + active.length) + " формально ACTIVE*</strong><span>" + esc(rd1Complete ? waiting.length : "≥ " + waiting.length) + " ждут условия · " + esc(rd1Complete ? blocked.length : "≥ " + blocked.length) + " явно заблокировано · свежий ход у Ники: " + esc(rd1Complete ? founderAssignedFresh.length : "≥ " + founderAssignedFresh.length) + (founderAssignedStale.length ? " · старых назначений " + esc(founderAssignedStale.length) : "") + (founderDecisionsKnown ? " · текущих формальных решений " + esc(formalDecisions.length) : " · формальные решения не проверены") + "</span></a>" +
          "<a href='#testing' class='research-bridge-cell " + (adjudication.length || blockedTests.length ? "attention" : "") + "'><small>Независимая проверка</small><strong>" + esc(researchTestState.activeKnown ? openTestStates.length : "—") + " в active[] · " + esc(testingComplete ? adjudication.length : "≥ " + adjudication.length) + " на разборе</strong><span>active[] не означает текущее исполнение · " + esc(testTitle) + " · " + esc(testNote) + "</span></a>" +
          "<a href='#research' class='research-bridge-cell'><small>Последнее материальное изменение</small><strong>" + esc(latestTitle) + "</strong><span>" + esc(cut(latestNote, 120)) + (latest ? " · " + esc(ago(latest.object.last_event_at)) : "") + "</span></a>" +
          "<a href='#documents' class='research-bridge-cell'><small>Доказательный контур компании</small><strong>" + esc(reviewN == null ? "действующая очередь не передана" : reviewN + " действительно требуют действия") + "</strong><span>" + esc(reviewQuarantine==null?"карантин не передан":reviewQuarantine+" в карантине без владельца") + " · общесистемный Hub не приписывается исследованию без явной связи с объектом</span></a>" +
          "</div><div class='research-bridge-rule'>Панель не превращает завершённый прогон в научный вывод и не считает общую очередь документов доказательствами конкретной исследовательской линии без явной связи.</div>";
      }

      mini(page.querySelector('[data-r="result"]'), material.slice(0, 5).map(function (x) {
        var o = x.object;
        return "<div class='research-mini-item'><b>" + esc(researchObjectTitle(o)) + "</b><span>" +
          esc(researchTextRu(o.last_summary)) + " · " + esc(o.last_meaning_kind || "изменение") + " · " + esc(ago(o.last_event_at)) + "</span></div>";
      }), rd1Complete ? "Существенного результата не найдено" : "Результаты прочитаны частично",
        rd1Complete ? "Нет материального GATE_RESULT / DECISION / STATUS_CHANGE / STAGE_CHANGE / TEST_RESULT / EXTERNAL_EVENT." : "Часть RD1-проекций недоступна; отсутствие материального результата не подтверждено.");

      var nextGates = lines.filter(function (x) { return !!x.projection.next_gate; });
      mini(page.querySelector('[data-r="next-gates"]'), nextGates.slice(0, 6).map(function (x) {
        return "<div class='research-mini-item'><b>" + esc(researchObjectTitle(x.object)) + "</b><span>" +
          esc(researchTextRu(x.projection.next_gate)) + " · следующий ход: " + esc(researchTextRu(x.projection.next_move || "не указан")) + "</span></div>";
      }), rd1Complete ? "Следующая проверка не передана" : "Следующие проверки прочитаны частично",
        rd1Complete ? "Ни одна полностью прочитанная RD1-проекция не отдала next_gate." : "Часть RD1-проекций недоступна; общий вывод о next_gate не делается.");

      mini(page.querySelector('[data-r="changes"]'), material.slice(0, 6).map(function (x) {
        var o = x.object;
        return "<div class='research-mini-item'><b>" + esc(o.object_id || "ID не определён") + " · " + esc(researchObjectTitle(o)) + "</b><span>" +
          esc(researchTextRu(o.last_summary)) + " · " + esc(ago(o.last_event_at)) + "</span></div>";
      }), rd1Complete ? "Материальных изменений нет" : "Изменения прочитаны частично",
        rd1Complete ? "Полная текущая RD1-проекция не содержит материальных событий по исследовательским линиям." : "Часть RD1-проекций недоступна; общий ноль материальных изменений не подтверждён.");

      var blockersComplete = !!(sourceState.blockers.ok && blockersResp && Array.isArray(blockersResp.items));
      var researchComplete = !!(sourceState.researchRD1.ok && sourceState.researchRD1.complete && blockersComplete && founderDecisionsKnown);
      pageBadge("research",
        sourceState.researchRD1.ok ? (researchComplete ? "live" : "warn") : "unavailable",
        sourceState.researchRD1.ok ? (researchComplete ? "ИССЛЕДОВАТЕЛЬСКИЙ КОНТУР ПОЛОН" : "ИССЛЕДОВАТЕЛЬСКИЕ ДАННЫЕ ЧАСТИЧНЫ") : "RD1-ПРОЕКЦИЯ НЕДОСТУПНА"
      );
      refreshDirectionInspector("research");
    });
  }



  function renderFoundation(health, hub, objectsResp, inbox) {
    var page = document.querySelector('[data-page-panel="foundation"]');
    if (!page) return;

    var healthOk = sourceState.continuityHealth.ok && health;
    var hubOk = sourceState.hubHealth.ok && hub;
    var objectsOk = sourceState.objects.ok && objectsResp;
    var objectsItemsKnown = !!(objectsOk && Array.isArray(objectsResp.items));
    var inboxOk = sourceState.inbox.ok && inbox;
    var inboxNeedsKnown = !!(inboxOk && Array.isArray(inbox.needs_founder));

    function put(k, v) {
      var e = page.querySelector('[data-fnd="' + k + '"]');
      if (e) e.textContent = String(v);
    }

    put("readiness", (healthOk || hubOk || objectsOk) ? "Не доказано" : "Недоступно");
    put("continuity", !healthOk ? "Недоступно" : (health.ok === true ? "Источник сообщает OK" : (health.ok === false ? "Источник сообщает деградацию" : "Статус health.ok не передан")));
    put("recovery", "Не подтверждено");

    var systemOpenRaw = null;
    if (healthOk && health.system_attention_open != null) systemOpenRaw = health.system_attention_open;
    else if (inboxOk && inbox.summary && inbox.summary.system_attention != null) systemOpenRaw = inbox.summary.system_attention;
    var systemOpen = numberOrNull(systemOpenRaw);
    var systemItemsKnown = !!(inboxOk && Array.isArray(inbox.system_attention));
    var systemItems = systemItemsKnown ? inbox.system_attention : [];
    var systemGroups = {};
    systemItems.forEach(function(x){var k=String(x.issue_type||"UNKNOWN");(systemGroups[k]=systemGroups[k]||[]).push(x);});
    var systemRecent = systemItems.filter(function(x){var d=daysSince(x.last_seen_at||x.opened_at);return d!=null&&d<STALE_DAYS;});
    var systemOld = systemItems.filter(function(x){var d=daysSince(x.last_seen_at||x.opened_at);return d!=null&&d>=STALE_DAYS;});
    var systemTestDerived = systemItems.filter(function(x){return /TEST|FIXTURE/i.test([x.source_system,x.reason,x.title].filter(Boolean).join(" "));});
    put("system", systemOpen == null ? "—" : systemOpen);

    var readiness = page.querySelector('[data-fnd="readiness-card"]');
    if (readiness) {
      var state = !healthOk && !hubOk && !objectsOk ? "Источники основания недоступны" : "Полная готовность основания не доказана";
      readiness.innerHTML =
        "<div class='foundation-source-summary warn'><strong>" + esc(state) + "</strong>" +
        "<p>Панель подтверждает отдельные состояния чтения Continuity и Hub, но не имеет единого источника, " +
        "который одновременно доказывает восстановление и обратное чтение, целостность полномочий и полную готовность основания. " +
        "Поэтому состояние «полностью готово» здесь не выводится.</p></div>";
    }

    var attention = page.querySelector('[data-fnd="attention"]');
    if (attention) {
      if (systemOpen == null) {
        attention.innerHTML = unavailableHTML("Системные записи внимания не подтверждены", "Continuity health / Входящие Основателя не дали текущего счётчика.");
      } else if (systemOpen === 0) {
        attention.innerHTML =
          "<div class='foundation-source-summary'><strong>0 открытых системных записей внимания по Continuity</strong>" +
          "<p>Это подтверждает только текущий счётчик Continuity и не является доказательством общей готовности основания.</p></div>";
      } else if (!systemItemsKnown) {
        attention.innerHTML =
          "<div class='foundation-source-summary warn'><strong>" + esc(systemOpen) + " открытых системных записей</strong>" +
          "<p>Детали system_attention[] не переданы, поэтому Панель не группирует их и не делает вывод о числе независимых проблем.</p></div>";
      } else {
        var systemLabels={SYNC_HEALTH_DEGRADED:"Деградация синхронизации / свежести",MEANING_ASSESSMENT_REJECTED:"Отклонённая смысловая оценка",INGRESS_PACKET_NOT_INGESTED:"Пакеты входа не доведены до состояния объекта",PROJECTION_REJECTED:"Отклонённая проекция"};
        var groupRows=Object.keys(systemGroups).map(function(k){
          var xs=systemGroups[k], latest=xs.slice().sort(function(a,b){return String(b.last_seen_at||b.opened_at||"").localeCompare(String(a.last_seen_at||a.opened_at||""));})[0]||{};
          var age=daysSince(latest.last_seen_at||latest.opened_at);
          var testN=xs.filter(function(x){return /TEST|FIXTURE/i.test([x.source_system,x.reason,x.title].filter(Boolean).join(" "));}).length;
          return "<div class='foundation-live-item'><b>"+esc(systemLabels[k]||humanCode(k))+"</b><span>"+esc(xs.length)+" записей"+(testN?" · "+esc(testN)+" явно тестового происхождения":"")+(age==null?"":" · последнее появление "+esc(age)+" дн. назад")+"</span></div>";
        }).join("");
        attention.innerHTML =
          "<div class='foundation-source-summary warn'><strong>" + esc(systemOpen) + " открытых записей · " + esc(Object.keys(systemGroups).length) + " класса</strong>" +
          "<p>"+esc(systemRecent.length)+" записей появлялись менее "+esc(STALE_DAYS)+" дней назад; "+esc(systemOld.length)+" давно не повторялись. "+esc(systemTestDerived.length)+" записей явно происходят из тестовых идентификаторов/фикстур и не считаются отдельными производственными авариями.</p></div>" +
          "<div class='foundation-live-list'>"+groupRows+"</div>";
      }
    }

    var continuity = page.querySelector('[data-fnd="backbone-continuity"]');
    if (continuity) {
      if (!healthOk) continuity.innerHTML = unavailableHTML("Проверка здоровья Continuity недоступна", "Операционная истина не получила подтверждённого чтения состояния.");
      else continuity.innerHTML =
        "<div class='foundation-live-list'>" +
        "<div class='foundation-live-item'><b>Проверка здоровья Continuity</b><span>" + (health.ok === true ? "источник сообщает OK" : (health.ok === false ? "источник сообщает деградацию" : "поле health.ok не передано")) + "</span></div>" +
        "<div class='foundation-live-item'><b>Системное внимание</b><span>" + esc(systemOpen == null ? "не указано" : systemOpen + " записей" + (systemItemsKnown ? " · " + Object.keys(systemGroups).length + " класса" : "")) + "</span></div></div>";
    }

    var durability = page.querySelector('[data-fnd="backbone-durability"]');
    if (durability) {
      if (!hubOk) durability.innerHTML = unavailableHTML("Hub / Durability недоступен", "Нет подтверждённого чтения sync-health.");
      else {
        var rq = hub.review_queue || {};
        durability.innerHTML =
          "<div class='foundation-live-list'>" +
          "<div class='foundation-live-item'><b>Объекты на диске</b><span>" + esc(hub.objects_on_disk == null ? "—" : hub.objects_on_disk) + "</span></div>" +
          "<div class='foundation-live-item'><b>Действующая очередь разбора</b><span>" + esc(rq.actionable_review == null ? "—" : rq.actionable_review) + "</span></div>" +
          "<div class='foundation-live-item'><b>Карантин без владельца</b><span>" + esc(rq.unassigned_review_quarantine == null ? "—" : rq.unassigned_review_quarantine) + "</span></div>" +
          "<div class='foundation-live-item'><b>Граница доказательства</b><span>Состояние синхронизации само по себе не доказывает побайтовое обратное чтение и успешное восстановление.</span></div></div>";
      }
    }

    var approval = page.querySelector('[data-fnd="backbone-approval"]');
    if (approval) {
      if (!inboxOk) approval.innerHTML = unavailableHTML("Входящие Основателя недоступны", "Наличие или отсутствие Founder-only решений не подтверждено.");
      else if (!inboxNeedsKnown) approval.innerHTML = unavailableHTML("Очередь решений не проверена", "Founder inbox ответил, но needs_founder[] не передан.");
      else {
        var nf = inbox.needs_founder.length;
        approval.innerHTML =
          "<div class='foundation-live-list'>" +
          "<div class='foundation-live-item'><b>Решения уровня Основателя</b><span>" + esc(nf) + " в явном needs_founder[]</span></div>" +
          "<div class='foundation-live-item'><b>Граница доказательства</b><span>inbox подтверждает эту очередь решений, но не является аудитом всей A0/A1/A2 authority chain.</span></div></div>";
      }
    }

    var projection = page.querySelector('[data-fnd="backbone-projection"]');
    if (projection) {
      var names = ["routes","summary","metrics","inbox","objects","blockers","testingSummary","testingHealth","testingRunner","hubHealth","continuityHealth"];
      var ok = names.filter(function (k) { return sourceState[k] && sourceState[k].ok; }).length;
      projection.innerHTML =
        "<div class='foundation-live-list'>" +
        "<div class='foundation-live-item'><b>Текущий цикл чтения</b><span>" + esc(ok) + "/" + esc(names.length) + " известных базовых GET-проекций ответили</span></div>" +
        "<div class='foundation-live-item'><b>Граница доказательства</b><span>успешное чтение не доказывает семантическую корректность всего источника.</span></div></div>";
    }

    var durableDetail = page.querySelector('[data-fnd="durability-detail"]');
    if (durableDetail) {
      if (!hubOk) durableDetail.innerHTML = unavailableHTML("Проекция долговечности недоступна", "Ни запись, ни обратное чтение не объявляются успешными только по отсутствию ошибки на экране.");
      else {
        var rq2 = hub.review_queue || {};
        durableDetail.innerHTML =
          "<div class='foundation-live-list'>" +
          "<div class='foundation-live-item'><b>Объекты на диске</b><span>" + esc(hub.objects_on_disk == null ? "—" : hub.objects_on_disk) + "</span></div>" +
          "<div class='foundation-live-item'><b>Действующая очередь разбора</b><span>" + esc(rq2.actionable_review == null ? "—" : rq2.actionable_review) + "</span></div>" +
          "<div class='foundation-live-item'><b>Карантин без владельца</b><span>" + esc(rq2.unassigned_review_quarantine == null ? "—" : rq2.unassigned_review_quarantine) + "</span></div>" +
          "<div class='foundation-live-item'><b>Неизвестная классификация</b><span>" + esc(rq2.unknown_classification == null ? "—" : rq2.unknown_classification) + "</span></div>" +
          "<div class='foundation-live-item'><b>Побайтовое обратное чтение</b><span>отдельный подтверждённый контракт в v2 пока не подключён</span></div></div>";
      }
    }

    var change = page.querySelector('[data-fnd="last-change"]');
    if (change) {
      if (!objectsOk) change.innerHTML = unavailableHTML("Continuity objects недоступны", "Последнее изменение Foundation не выводится из истории чата.");
      else if (!objectsItemsKnown) change.innerHTML = unavailableHTML("FND-001 не проверен", "Continuity objects ответил, но поле items[] не передано.");
      else {
        var fnd = objectsResp.items.find(function (o) { return String(o.object_id || "") === "FND-001"; });
        if (!fnd) change.innerHTML =
          "<div class='foundation-source-summary warn'><strong>FND-001 не найден в текущей проекции объектов</strong><p>Панель не подставляет другой объект по имени или сходству.</p></div>";
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

  function renderFounderRadar(radar, marketSignals, scannerDiagnostics) {
    var page=document.querySelector('[data-page-panel="signals"]');
    if(!page)return;
    function arr(k){return radar&&Array.isArray(radar[k])?radar[k]:[];}
    function box(k){return k==="investment"?document.querySelector('[data-radar="investment"]'):page.querySelector('[data-radar="'+k+'"]');}
    function dateRu(v){if(!v)return "";var d=new Date(String(v).length===10?v+"T12:00:00":v);return isNaN(d)?String(v):d.toLocaleDateString("ru-RU",{day:"2-digit",month:"short",year:"numeric"});}
    function money(v){if(v==null)return "—";return "$"+Number(v).toLocaleString("en-US",{maximumFractionDigits:0});}
    function pct(v){return v==null?"недостаточно данных":Number(v).toLocaleString("ru-RU",{maximumFractionDigits:2})+"%";}
    function branch(x){var c=x&&x.context||{};return c.branch||c.line||"";}
    function textRu(v){
      var s=String(v||"");
      var m={
        "External NIST consideration / no response required from system now.":"Внешнее рассмотрение NIST; сейчас действий от системы не требуется.",
        "Outcome windows not yet resolved; first gate around 2026-10-13.":"Окна исходов ещё не разрешены; первый рубеж — около 13 октября 2026.",
        "Outcome windows not yet mature.":"Окна исходов ещё не созрели.",
        "External response / fresh status confirmation.":"Ждём внешний ответ или свежее подтверждение статуса.",
        "External replies / opportunity creation.":"Ждём внешние ответы или появление возможности.",
        "External program decision/credits.":"Ждём внешнее решение программы или начисление кредитов.",
        "Twin: текущий прогноз":"Twin: текущий прогноз",
        "Прогноз Twin запечатан":"Прогноз Twin запечатан"
      };
      return m[s]||s;
    }
    function daysTo(v){if(!v)return null;var d=new Date(String(v).length===10?v+"T12:00:00":v);if(isNaN(d))return null;return Math.ceil((d-Date.now())/86400000);}
    function attentionClass(x,kind){
      var declared=String(x&&x.radar_class||"").toUpperCase();
      if(["ACTION_NOW","REVIEW","WATCH","BACKGROUND"].indexOf(declared)>=0)return declared;
      var d=daysTo(x&&x.date),st=String(x&&x.status||"").toLowerCase();
      if(kind==="predictions"&&/due|reveal|resolution|outcome/.test(st)&&d!=null&&d>=0&&d<=14)return "ACTION_NOW";
      if(d!=null&&d>=0&&d<=7)return "ACTION_NOW";
      return "WATCH";
    }
    function important(x,kind){return attentionClass(x,kind)==="ACTION_NOW";}
    function attentionLabel(x,kind){
      var c=attentionClass(x,kind);
      return ({ACTION_NOW:"нужно сейчас",REVIEW:"нужно разобрать",WATCH:"наблюдать",BACKGROUND:"фон"})[c]||"наблюдать";
    }
    var inspectorItems={};
    function radarSectionLabel(kind){
      return ({patterns:"нарастающие паттерны",opportunities:"возможности",waiting:"ожидания",predictions:"прогнозы и даты",field:"поле и рынок",learning:"обучение ATLAS",investment:"инвестиционный ATLAS",reputation:"репутация и присутствие"})[kind]||humanCode(kind||"сигнал");
    }
    function sourceLabel(x){
      var r=x&&x.source_ref||{};
      var m={radar_pattern:"Сводный радар",market_signal:"Сканер внешнего поля",temporal_branch_waiting:"Временная модель",temporal_branch_next:"Временная модель",activity_event:"Журнал событий",twin_state:"Twin / Synthetic Worlds",signal_lab:"ATLAS Signal Lab",founder_decision:"Проекция решений Основателя"};
      if(x&&x.source&&x.source.name)return x.source.name;
      return m[r.kind]||humanCode(r.kind||"источник не указан");
    }
    function itemHTML(x,kind,i){
      var key=kind+":"+(x.pattern_id||x.radar_id||x.signal_id||i);
      inspectorItems[key]={item:x,kind:kind};
      var cls=attentionClass(x,kind),imp=cls==="ACTION_NOW",review=cls==="REVIEW",background=cls==="BACKGROUND";
      var period=(x.first_seen||x.last_seen)?([x.first_seen?dateRu(x.first_seen):"",x.last_seen&&x.last_seen!==x.first_seen?dateRu(x.last_seen):""].filter(Boolean).join(" → ")):"";
      var meta=[dateRu(x.date||x.latest_observed_at||x.observed_at),period,branch(x),sourceLabel(x),x.signal_count!=null?("сигналов: "+x.signal_count):"",x.distinct_institutions!=null?("институтов: "+x.distinct_institutions):"",x.repeat_count>1?("повторов: "+x.repeat_count):""].filter(Boolean).join(" · ");
      var summary=x.summary_ru||x.summary||x.why||"";
      var dest=x.destination&&x.destination.label?x.destination.label:"";
      var next=x.next_step_ru||"";
      var funnel='';
      if(kind==="opportunities"&&x.funnel_checks){
        var fc=x.funnel_checks||{}, order=[["FOUND","found"],["ELIGIBILITY","eligibility"],["FIT","strategic_fit"],["EFFORT/UPSIDE","effort_upside"],["DEADLINE","deadline"],["DECISION","decision"]];
        funnel='<div class="funding-mini-funnel">'+order.map(function(z){var q=fc[z[1]]||{};return '<span class="'+esc(String(q.status||"").toLowerCase())+'"><i>'+esc(z[0])+'</i><b>'+esc(cut(q.label||"—",34))+'</b></span>';}).join('')+'</div>'+
          '<div class="funding-route '+esc(String(x.route_decision||"watch").toLowerCase())+'"><b>'+esc(x.route_decision||"WATCH")+' · '+esc(x.route_decision_label||"")+'</b>'+(x.blocking_fact?'<span>Блокер: '+esc(cut(x.blocking_fact,155))+'</span>':'')+'</div>';
      }
      return '<button type="button" class="radar-signal-card radar-'+esc(cls.toLowerCase())+(imp?' important':'')+(review?' review':'')+(background?' background':'')+'" data-radar-select="'+esc(key)+'">'+
        '<div class="radar-signal-head"><span class="radar-mini-hex">'+(imp?'!':review?'↳':background?'·':'•')+'</span><div><b>'+esc(cut(textRu(x.title||"Сигнал"),115))+'</b><small>'+esc(meta||"контекст не передан")+'</small></div><em>'+esc(attentionLabel(x,kind))+'</em></div>'+
        funnel+
        (summary?'<p class="radar-card-summary">'+esc(cut(textRu(summary),210))+'</p>':'')+
        ((dest||next)?'<div class="radar-card-route">'+(dest?'<b>'+esc(dest)+'</b>':'')+(next?'<span>'+esc(cut(next,180))+'</span>':'')+'</div>':'')+
      '</button>';
    }
    function listHTML(items,kind,empty,limit){
      items=(items||[]).slice(0,limit||6);
      if(!items.length)return '<div class="cc-empty"><b>'+esc(empty)+'</b></div>';
      return '<div class="radar-card-list">'+items.map(function(x,i){return itemHTML(x,kind,i);}).join("")+'</div>';
    }
    function showInspector(key){
      var host=page.querySelector("[data-radar-inspector]");
      var rec=inspectorItems[key];
      if(!host||!rec)return;
      var x=rec.item||{}, kind=rec.kind, cls=attentionClass(x,kind), imp=cls==="ACTION_NOW";
      var ctx=x.context||{}, ref=x.source_ref||{};
      var why=x.why||x.why_it_matters_ru||(x.enrichment&&x.enrichment.why_it_matters_ru)||"Источник не передал отдельное объяснение значимости.";
      var summaryText=x.summary_ru||x.summary||"";
      var nextStep=x.next_step_ru||"";
      var destination=x.destination||{};
      var source=sourceLabel(x),sourceUrl=x.opportunity_url||x.source_url||(x.source&&x.source.url)||"";
      var ctxLine=[ctx.world,ctx.line,ctx.branch].filter(Boolean);
      var evidence="";
      if(Array.isArray(x.evidence)&&x.evidence.length)evidence=x.evidence.length+" свидетельств";
      function eligibilityLabel(v){
        var k=String(v||"").toUpperCase();
        if(k==="UNCHECKED")return "допуск ещё не проверен";
        if(k==="NEEDS_CALL_DOCUMENT_REVIEW")return "нужно разобрать полный документ конкурса";
        if(k==="NEEDS_COMPANY_FACTS")return "нужны подтверждённые факты компании";
        if(k==="ELIGIBLE")return "источник проверки сообщает: допустимо";
        if(k==="NOT_ELIGIBLE")return "источник проверки сообщает: не допускается";
        return humanCode(v||"не передан");
      }
      var eligReq=Array.isArray(x.eligibility_requirements)?x.eligibility_requirements:[];
      var eligMissing=Array.isArray(x.eligibility_missing_facts)?x.eligibility_missing_facts:[];
      var eligSources=Array.isArray(x.eligibility_review_sources)?x.eligibility_review_sources:[];
      var eligConflicts=Array.isArray(x.eligibility_source_conflicts)?x.eligibility_source_conflicts:[];
      var stewardCtx={
        kind:"radar_signal",
        title:textRu(x.title||"Сигнал"),
        sub:"Радар Основателя · "+radarSectionLabel(kind),
        date:x.date||"",
        layer:kind,
        source:source,
        source_url:sourceUrl,
        attention_class:cls,
        attention_label:attentionLabel(x,kind),
        summary:textRu(summaryText),
        why:textRu(why),
        next_step:nextStep,
        destination:destination,
        recommended_action:x.recommended_action||"",
        architecture_proximity:x.architecture_proximity,
        market_significance:x.market_significance,
        architecture_convergence:x.architecture_convergence,
        repeat_count:x.repeat_count||1,
        pattern_id:x.pattern_id||"",
        signal_count:x.signal_count,
        evidence_ceiling:x.evidence_ceiling||"",
        pattern_signals:Array.isArray(x.signals)?x.signals:[],
        evidence:Array.isArray(x.evidence)?x.evidence:[],
        signal_id:ref.signal_id||x.signal_id||"",
        radar_id:x.radar_id||"",
        source_ref:ref,
        context:ctx,
        eligibility_status:x.eligibility_status||"",
        eligibility_requirements:eligReq,
        eligibility_missing_facts:eligMissing,
        eligibility_next_check:x.eligibility_next_check||"",
        eligibility_review_sources:eligSources,
        eligibility_source_conflicts:eligConflicts,
        details:[ctx.world,ctx.line,ctx.branch].filter(Boolean).join(" → ")
      };
      host.innerHTML=
        '<div class="cc-insp-title">Сигнальный радар</div>'+
        '<div class="cc-insp-head"><span class="radar-insp-mark '+(imp?'important':cls==="REVIEW"?'review':'')+'">'+(imp?'!':cls==="REVIEW"?'↳':cls==="BACKGROUND"?'·':'•')+'</span><div><h3>'+esc(textRu(x.title||"Сигнал"))+'</h3><small>'+esc(attentionLabel(x,kind))+'</small></div></div>'+
        (summaryText?'<div class="cc-insp-sec"><h4>Что произошло</h4><p>'+esc(textRu(summaryText))+'</p></div>':'')+
        '<div class="cc-insp-sec"><h4>Почему это имеет значение</h4><p>'+esc(textRu(why))+'</p></div>'+
        ((destination.label||nextStep)?'<div class="cc-insp-sec radar-route-sec"><h4>Куда вести '+(kind==="patterns"?"паттерн":"сигнал")+'</h4>'+(destination.label?'<b>'+esc(destination.label)+'</b>':'')+(destination.route?'<p>'+esc(destination.route)+'</p>':'')+(nextStep?'<small>Следующий шаг: '+esc(nextStep)+'</small>':'')+'</div>':'')+
        (x.evidence_ceiling?'<div class="cc-insp-sec radar-ceiling"><h4>Потолок доказательств</h4><p>'+esc(x.evidence_ceiling)+'</p></div>':'')+
        (x.signal_count!=null?'<div class="cc-insp-sec"><h4>Из чего собран паттерн</h4><p>'+esc(x.signal_count)+' сигналов'+(x.distinct_days!=null?" · "+esc(x.distinct_days)+" дней":"")+(x.distinct_institutions!=null?" · "+esc(x.distinct_institutions)+" института":"")+'</p>'+(Array.isArray(x.signals)&&x.signals.length?'<details class="radar-pattern-members"><summary>Показать составляющие</summary><ul>'+x.signals.slice(0,12).map(function(s){return "<li>"+esc(s.title||s.signal_id||s.radar_id||"сигнал")+"</li>";}).join("")+" </ul></details>":"")+'</div>':'')+
        (x.date?'<div class="cc-insp-sec"><h4>Дата</h4><p>'+esc(dateRu(x.date))+'</p></div>':'')+
        (kind==="opportunities"&&x.funnel_checks?'<div class="cc-insp-sec funding-inspector"><h4>Воронка финансирования</h4><div class="funding-inspector-route '+esc(String(x.route_decision||"watch").toLowerCase())+'"><b>'+esc(x.route_decision||"WATCH")+' · '+esc(x.route_decision_label||"")+'</b><span>'+esc(x.route_decision_reason||"")+'</span></div><div class="funding-inspector-grid"><div><small>Текущий этап</small><b>'+esc(humanCode(x.funnel_stage||"—"))+'</b></div><div><small>Стратегическое соответствие</small><b>'+esc((x.strategic_fit||{}).label||"—")+'</b></div><div><small>Усилия</small><b>'+esc((x.effort||{}).label||"—")+'</b></div><div><small>Потенциальный выигрыш</small><b>'+esc((x.upside||{}).label||"—")+'</b></div><div><small>Срок</small><b>'+esc((x.deadline_pressure||{}).label||"—")+'</b></div><div><small>Блокер</small><b>'+esc(x.blocking_fact||"нет подтверждённого блокера")+'</b></div></div>'+
          (x.company_profile_gap&&x.company_profile_gap.required?'<div class="funding-profile-progress"><span>Профиль для этой программы</span><b>'+esc(x.company_profile_gap.verified)+' / '+esc(x.company_profile_gap.required)+' фактов подтверждено</b></div>':'')+
          ((x.program_overlay||{}).candidate_project_fit?'<div class="funding-project-candidate"><small>КАНДИДАТ НА ПРОЕКТНУЮ ЛИНИЮ</small><b>'+esc(x.program_overlay.candidate_project_fit.theme||"")+'</b><span>'+esc(x.program_overlay.candidate_project_fit.why||"")+'</span></div>':'')+
          ((x.program_overlay||{}).partnership&&x.program_overlay.partnership.required?'<div class="funding-partner-required"><b>PARTNER · ICT обязательна</b><span>'+esc(x.program_overlay.partnership.minimum||"")+'</span></div>':'')+
          ((x.program_overlay||{}).economics?'<div class="funding-economics"><div><small>Минимальный запрос Finep</small><b>R$ '+Number(x.program_overlay.economics.finep_request_min_brl||0).toLocaleString("pt-BR")+'</b></div><div><small>Минимальная доля ME/EPP</small><b>'+esc(x.program_overlay.economics.micro_small_counterpart_pct_min||"—")+'%</b></div><div><small>Ориентир минимальной контрапартиды</small><b>≈ R$ '+Math.round(Number(x.program_overlay.economics.estimated_min_counterpart_brl_if_micro_small_simple||0)).toLocaleString("pt-BR")+'</b></div></div>':'')+
          '<small class="funding-evidence-boundary">Предварительная оценка соответствия не заменяет юридическую проверку допуска. APPLY запрещён до ELIGIBLE.</small></div>':'')+
        (kind==="opportunities"?'<div class="cc-insp-sec"><h4>Допуск и статус</h4><p>'+esc(eligibilityLabel(x.eligibility_status)+(x.program_type?" · "+x.program_type:"")+(x.official_status?" · источник: "+humanCode(x.official_status):""))+'</p>'+
          (eligReq.length?'<small class="radar-elig-head">Что уже известно из источника</small><ul class="radar-elig-list">'+eligReq.map(function(v){return "<li>"+esc(v)+"</li>";}).join("")+"</ul>":"")+
          (eligMissing.length?'<small class="radar-elig-head">Чего не хватает для решения</small><ul class="radar-elig-list missing">'+eligMissing.map(function(v){return "<li>"+esc(v)+"</li>";}).join("")+"</ul>":"")+
          (eligConflicts.length?'<div class="radar-elig-conflict"><b>Расхождение источников</b>'+eligConflicts.map(function(v){return "<span>"+esc(v)+"</span>";}).join("")+'</div>':'')+
          (eligSources.length?'<small class="radar-elig-reviewed">Критерии сверены по официальным документам: '+esc(eligSources.length)+'</small>':'')+
          (x.eligibility_next_check?'<div class="radar-elig-next"><b>Следующая проверка</b><span>'+esc(x.eligibility_next_check)+'</span></div>':'')+
          '</div>':'')+
        (ctxLine.length?'<div class="cc-insp-sec"><h4>Контекст</h4><div class="cc-crumbs">'+ctxLine.map(function(v){return '<span>'+esc(v)+'</span>';}).join('<i>→</i>')+'</div></div>':'')+
        '<div class="cc-insp-sec"><h4>Источник</h4><p>'+esc(source)+'</p>'+(sourceUrl?'<a class="radar-source-link" href="'+esc(sourceUrl)+'" target="_blank" rel="noopener">Открыть первоисточник ↗</a>':'')+(evidence?'<small>'+esc(evidence)+(x.repeat_count>1?' · схлопнуто повторов: '+esc(x.repeat_count):'')+'</small>':'')+'</div>'+
        ((x.architecture_proximity!=null||x.market_significance!=null)?'<div class="cc-insp-sec"><h4>Оценка аналитического слоя</h4><p>Близость к архитектуре: '+esc(x.architecture_proximity==null?"—":x.architecture_proximity)+' · значимость для рынка: '+esc(x.market_significance==null?"—":x.market_significance)+'</p></div>':'')+
        (x.status?'<div class="cc-insp-sec"><h4>Состояние источника</h4><p>'+esc(humanCode(x.status))+'</p></div>':'')+
        '<div class="cc-insp-sec"><h4>Граница</h4><p>Панель показывает запись источника и не повышает её до действия, решения или причинной связи без отдельного подтверждения.</p></div>'+
        '<button type="button" class="cc-steward-ask"><b>Разобрать со Стюардом</b><span>что произошло → насколько это важно → куда вести → что делать следующим шагом</span></button>';
      var stewardBtn=host.querySelector(".cc-steward-ask");
      if(stewardBtn)stewardBtn.setAttribute("data-cc-steward-context",JSON.stringify(stewardCtx));
      page.querySelectorAll("[data-radar-select]").forEach(function(b){b.classList.toggle("selected",b.getAttribute("data-radar-select")===key);});
    }

    var stamp=page.querySelector("[data-radar-stamp]");
    if(!sourceState.radar.ok||!radar){
      if(stamp)stamp.innerHTML='<div class="cc-stamp"><span class="cc-pulse bad"></span><span>Радар недоступен</span></div>';
      ["patterns","opportunities","waiting","predictions","field","learning","investment","reputation"].forEach(function(k){var e=box(k);if(e)e.innerHTML='<div class="cc-unavailable"><b>Источник радара недоступен</b><span>Старые значения не подставляются.</span></div>';});
      return;
    }
    if(stamp)stamp.innerHTML='<div class="cc-stamp"><span class="cc-pulse ok"></span><span>Радар · данные поступают</span></div>';

    var patterns=arr("patterns"), opportunities=arr("opportunities"), waiting=arr("waiting"), upcoming=arr("upcoming"), predictions=arr("predictions");
    var field=radar.field||{}, fieldSignals=Array.isArray(field.signals)?field.signals:[], fieldCounts=field.counts||{};
    var fundingProfile=radar.funding_profile||{}, fundingProfileSummary=fundingProfile.profile_summary||{}, fundingGaps=Array.isArray(fundingProfile.top_unresolved_facts)?fundingProfile.top_unresolved_facts:[];
    var marketCounts=marketSignals&&marketSignals.counts||{}, scannerRun=scannerDiagnostics&&scannerDiagnostics.scanner&&scannerDiagnostics.scanner.run_summary||{};
    var returnedSignals=marketCounts.returned!=null?Number(marketCounts.returned):(marketSignals&&Array.isArray(marketSignals.signals)?marketSignals.signals.length:null);
    var storedSignals=marketCounts.stored_total!=null?Number(marketCounts.stored_total):null;
    var emittedNow=scannerRun.signals_emitted!=null?Number(scannerRun.signals_emitted):null;
    var learning=arr("atlas_learning"), reputation=arr("reputation");
    function byClass(items,c){return (items||[]).filter(function(x){return attentionClass(x,"field")===c;});}
    function byOppClass(items,c){return (items||[]).filter(function(x){return attentionClass(x,"opportunities")===c;});}
    var urgentOpp=byOppClass(opportunities,"ACTION_NOW"), reviewOpp=byOppClass(opportunities,"REVIEW"), watchOpp=byOppClass(opportunities,"WATCH");
    var urgentField=byClass(fieldSignals,"ACTION_NOW"), reviewField=byClass(fieldSignals,"REVIEW"), watchField=byClass(fieldSignals,"WATCH"), backgroundField=byClass(fieldSignals,"BACKGROUND");
    function countClass(items,kind,c){return (items||[]).filter(function(x){return attentionClass(x,kind)===c;}).length;}
    var urgentN=urgentOpp.length+urgentField.length+countClass(predictions,"predictions","ACTION_NOW")+countClass(learning,"learning","ACTION_NOW");
    var reviewN=reviewOpp.length+reviewField.length+countClass(predictions,"predictions","REVIEW")+countClass(learning,"learning","REVIEW");
    var watchN=watchOpp.length+watchField.length+countClass(predictions,"predictions","WATCH")+countClass(learning,"learning","WATCH")+countClass(reputation,"reputation","WATCH");
    var summary=page.querySelector("[data-radar-summary]");
    if(summary)summary.innerHTML=
      '<div class="cc-kpi radar-kpi risk"><span class="cc-kpi-icon">!</span><span class="cc-kpi-body"><small>Нужно сейчас</small><strong>'+urgentN+'</strong><em>срок или подтверждённое окно действия</em></span></div>'+
      '<div class="cc-kpi radar-kpi"><span class="cc-kpi-icon">↳</span><span class="cc-kpi-body"><small>На разбор</small><strong>'+reviewN+'</strong><em>отдельные сигналы и окна · сверху сведено паттернов: '+patterns.length+'</em></span></div>'+
      '<div class="cc-kpi radar-kpi"><span class="cc-kpi-icon">•</span><span class="cc-kpi-body"><small>Наблюдать</small><strong>'+watchN+'</strong><em>ранние сигналы без основания бежать</em></span></div>'+
      '<div class="cc-kpi radar-kpi wait"><span class="cc-kpi-icon">○</span><span class="cc-kpi-body"><small>Ждём</small><strong>'+waiting.length+'</strong><em>внешние ответы и исходы</em></span></div>';

    if(box("patterns"))box("patterns").innerHTML=listHTML(patterns,"patterns","Пока недостаточно независимых сигналов для устойчивого паттерна.",8);
    if(box("opportunities")){
      function fundingFactRu(k){return ({
        legal_entity_brazil:"Бразильское юрлицо-заявитель",
        headquarters_brazil:"Штаб-квартира в Бразилии",
        administration_brazil:"Управление компанией в Бразилии",
        for_profit:"Коммерческая организация",
        legal_form:"Юридическая форма",
        legal_status_active:"Активный юридический статус",
        company_size_class:"Категория размера компании",
        startup_legal_status:"Статус startup",
        annual_revenue_band_brl:"Диапазон годовой выручки",
        cnpq_institution_directory_registered:"Регистрация в Diretório CNPq",
        eligible_project_coordinator:"Допустимый координатор проекта",
        coordinator_formal_company_link:"Формальная связь координатора с компанией",
        coordinator_lattes_current:"Актуальный Currículo Lattes координатора",
        candidate_ai_project_defined:"Определён проект по ИИ",
        nib_mission_alignment:"Соответствие миссии Nova Indústria Brasil",
        counterpart_20pct_capacity:"Возможность обеспечить 20% софинансирования",
        project_theme:"Тематическая линия проекта",
        trl_initial:"Начальный TRL",
        trl_target:"Целевой TRL",
        university_partner_available:"Доступный университет-партнёр",
        research_institution_partner_available:"Исследовательский партнёр",
        consortium_capability:"Возможность участия в консорциуме",
        santa_catarina_presence:"Подтверждённое присутствие в Санта-Катарине"
      })[k]||humanCode(k||"факт");}
      var fd={APPLY:0,PARTNER:0,WATCH:0,DROP:0}, fs={FOUND:0,ELIGIBILITY:0,STRATEGIC_FIT:0,EFFORT_UPSIDE:0,DEADLINE:0};
      opportunities.forEach(function(x){var d=String(x.route_decision||"WATCH").toUpperCase();fd[d]=(fd[d]||0)+1;var st=String(x.funnel_stage||"FOUND").toUpperCase();fs[st]=(fs[st]||0)+1;});
      var readiness=fundingProfile.readiness||{};
      var profileBox='<div class="funding-profile-box"><div class="funding-profile-head"><div><small>КАНОНИЧЕСКИЙ ПРОФИЛЬ ЗАЯВИТЕЛЯ</small><b>'+esc(fundingProfile.entity_label||"кандидат-заявитель")+'</b><span>'+esc(fundingProfileSummary.verified==null?"—":fundingProfileSummary.verified)+' подтверждено из '+esc(fundingProfileSummary.facts_total==null?"—":fundingProfileSummary.facts_total)+' · неизвестный факт не считается выполненным условием.</span></div><em>'+esc(fundingProfileSummary.coverage_pct==null?"—":fundingProfileSummary.coverage_pct+"%")+'</em></div>'+
        (readiness.application_ready===false?'<div class="funding-readiness-block advisory"><b>СТАТУС ЗАЯВИТЕЛЯ ТРЕБУЕТ ВНИМАНИЯ · '+esc(readiness.blocking_status||"READINESS STATUS")+'</b><span>'+esc(readiness.reason||"")+' Этот статус сам по себе не блокирует подачу без явного требования программы.</span>'+(readiness.as_of?'<small>Статус подтверждён на '+esc(readiness.as_of)+'</small>':'')+'</div>':'')+
        (fundingGaps.length?'<div class="funding-gap-list">'+fundingGaps.slice(0,7).map(function(g,i){return '<div><span>'+(i+1)+'</span><b>'+esc(fundingFactRu(g.key))+'</b><em>блокирует '+esc(g.blocked_opportunities)+' '+(Number(g.blocked_opportunities)===1?"программу":"программы")+'</em></div>';}).join('')+'</div>':'')+'</div>';
      var funnelSummary=profileBox+'<div class="funding-funnel-summary"><div><small>FOUND</small><b>'+opportunities.length+'</b></div><div><small>ELIGIBILITY</small><b>'+fs.ELIGIBILITY+'</b></div><div><small>FIT</small><b>'+fs.STRATEGIC_FIT+'</b></div><div><small>EFFORT/UPSIDE</small><b>'+fs.EFFORT_UPSIDE+'</b></div><div><small>APPLY</small><b>'+fd.APPLY+'</b></div><div><small>PARTNER</small><b>'+fd.PARTNER+'</b></div><div><small>WATCH</small><b>'+fd.WATCH+'</b></div><div><small>DROP</small><b>'+fd.DROP+'</b></div></div>'+
        '<div class="radar-source-note funding-rule">FOUND → ELIGIBILITY → STRATEGIC FIT → EFFORT/UPSIDE → DEADLINE → APPLY / PARTNER / WATCH / DROP. До подтверждённого допуска карточка не может перейти в APPLY.</div>';
      box("opportunities").innerHTML=funnelSummary+
        '<div class="radar-lane-head urgent"><b>Срочно снять блокер</b><span>срок близко; это не означает, что подача уже разрешена</span></div>'+listHTML(urgentOpp,"opportunities","Срочных блокеров сейчас нет.",8)+
        '<div class="radar-lane-head review"><b>Продвинуть по воронке</b><span>проверить допуск, соответствие, усилия и потенциальный выигрыш</span></div>'+listHTML(reviewOpp,"opportunities","Дополнительных программ на разбор нет.",8)+
        (watchOpp.length?'<details class="radar-background"><summary>Наблюдать · '+watchOpp.length+'</summary>'+listHTML(watchOpp,"opportunities","",10)+'</details>':"");
    }
    if(box("waiting"))box("waiting").innerHTML=listHTML(waiting,"waiting","Внешних ожиданий и ожидаемых исходов сейчас нет.",7);
    var ps=predictions.slice().sort(function(a,b){return String(a.date||"9999").localeCompare(String(b.date||"9999"));});
    if(box("predictions"))box("predictions").innerHTML=listHTML(ps,"predictions","Открытых прогнозных точек сейчас нет.",7);

    if(box("field")){
      var cov=field.source_coverage||{}, covText=(cov.ok_count!=null&&cov.total_sources!=null)?("Покрытие внешнего сканера: "+cov.ok_count+" из "+cov.total_sources+" источников."):"Покрытие внешнего сканера не подтверждено.";
      var flowText=[emittedNow!=null?("последний цикл: "+emittedNow+" новый сигнал"):null,fieldCounts.raw!=null?("сырых: "+fieldCounts.raw):null,fieldCounts.clusters!=null?("смысловых: "+fieldCounts.clusters):null,fieldCounts.collapsed_repeats?("схлопнуто повторов: "+fieldCounts.collapsed_repeats):null].filter(Boolean).join(" · ");
      box("field").innerHTML='<div class="radar-source-note">'+esc(covText+" "+flowText)+'</div>'+
        (urgentField.length?'<div class="radar-lane-head urgent"><b>Срочно проверить</b><span>есть основание для немедленного разбора</span></div>'+listHTML(urgentField,"field","",10):"")+
        '<div class="radar-lane-head review"><b>Нужно разобрать</b><span>сильная близость к нашей архитектуре или траектории; ещё не действие</span></div>'+listHTML(reviewField,"field","Сильных сигналов на разбор сейчас нет.",12)+
        '<div class="radar-lane-head watch"><b>Наблюдать</b><span>ранняя информация; ждём подтверждения или накопления картины</span></div>'+listHTML(watchField,"field","Сигналов наблюдения сейчас нет.",12)+
        (backgroundField.length?'<details class="radar-background"><summary>Фон · '+backgroundField.length+'</summary>'+listHTML(backgroundField,"field","",12)+'</details>':"");
    }
    if(box("learning"))box("learning").innerHTML=listHTML(learning.map(function(x){return Object.assign({},x,{title:x.title||"ATLAS",why:[x.stage?("Этап: "+humanCode(x.stage)):"",x.result?("результат получен"):"",x.next?("дальше: "+humanCode(x.next)):""].filter(Boolean).join(" · "),date:x.next_date});}),"learning","Исследовательские контуры не передали текущий этап.",5);
    if(box("reputation"))box("reputation").innerHTML=listHTML(reputation,"reputation","Новых внешних репутационных или институциональных точек нет.",6);

    var inv=radar.investment||{};
    if(box("investment")){
      if(!inv.available)box("investment").innerHTML='<div class="cc-unavailable"><b>Investment ATLAS недоступен</b><span>Агрегированная проекция не ответила.</span></div>';
      else{
        var vc=inv.virtual_capital||{},h=inv.hypotheses||{},a=inv.activity||{},dq=inv.data_quality||{},watch=inv.decision_watch||{},cad=inv.cadence||{},arch=inv.architecture_state||{},sem=inv.semantic_evidence||{};
        var ports=Array.isArray(inv.portfolios)?inv.portfolios:[],hist=Array.isArray(inv.decision_history)?inv.decision_history:[],diag=inv.review_diagnostics||{};
        function p1(v){if(v==null||v==="")return "—";var n=Number(v);return isFinite(n)?n.toLocaleString("ru-RU",{minimumFractionDigits:1,maximumFractionDigits:1})+"%":"—";}
        function p2(v){if(v==null||v==="")return "—";var n=Number(v);return isFinite(n)?n.toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2})+"%":"—";}
        function archShort(v){return String(v||"—").replace("ATLAS_INVESTMENT_DECISION_LAYER_","").replace(/_/g,".");}
        function portName(p){var m={P_ATLAS_CORE:"ATLAS Core",P_CONSERVATIVE:"Консервативный",P_VALUATION_GATED:"С ограничением по оценке",P_BENCHMARK:"Эталонный"};return m[p.portfolio_id]||p.mode||p.portfolio_id||"портфель";}
        function actionRu(v){var m={NO_CHANGE:"без изменения портфеля",INITIAL_ALLOCATION:"первичная аллокация"};return m[String(v||"").toUpperCase()]||humanCode(v||"—");}
        var watchLabel=watch.status==="REVIEW_REQUIRED"?"Требуется пересмотр решения":"Наблюдение активно";
        var reason=watch.reason||{},reasonText=reason.market_trigger&&reason.fundamental_trigger?"рынок + фундаментальные данные":reason.market_trigger?"рыночное изменение":reason.fundamental_trigger?"фундаментальные данные":"";
        var nextReview=h.next_review_at||cad.next_formal_review_at;
        var hypRate=h.success_rate_pct==null?"ещё рано считать":p1(h.success_rate_pct);
        var activityCells=[["Проверок состояния",a.monitoring_cycles],["Обновлений данных",a.evidence_updates],["Пересмотров открыто",a.review_triggers],["Зафиксированных решений",a.committed_decisions],["Изменений портфеля",a.portfolio_changes]];
        var portRows=ports.map(function(p){return '<div class="inv-port-row"><b>'+esc(portName(p))+'</b><span>'+esc(p2(p.return_pct))+'</span><span>'+esc(p1(p.invested_pct))+'</span><span>'+esc(p1(p.cash_pct))+'</span><span>'+esc(p2(p.current_drawdown_pct))+'</span><span>'+esc(p2(p.max_drawdown_pct))+'</span></div>';}).join("");
        var historyRows=hist.map(function(d){return '<div class="inv-history-row"><b>Цикл '+esc(d.cycle==null?"—":d.cycle)+'</b><span>'+esc(archShort(d.architecture))+' · '+esc(actionRu(d.action||"—"))+'</span><span>оборот '+esc(p1(d.turnover_pct))+' · '+esc(d.timestamp?dateRu(d.timestamp):"дата не передана")+'</span></div>';}).join("");
        var md=dq.market_data||{},fd=dq.fundamentals||{};
        function shortHash(v){v=String(v||"");return v?v.slice(0,12)+"…":"—";}
        box("investment").innerHTML=
          '<div class="inv-founder-head"><div><small>INVESTMENT ATLAS</small><b>'+esc(humanCode(inv.lab_status||"—"))+' · '+esc(watch.status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":"WATCHING")+'</b><span>Редкость решений не считается бездействием: наблюдение, обновления данных, пересмотры и зафиксированные решения разведены отдельно.</span></div><em class="'+(watch.status==="REVIEW_REQUIRED"?"warn":"ok")+'">'+esc(watchLabel)+'</em></div>'+
          '<div class="inv-hero-grid"><div><small>Виртуальный капитал</small><b>'+esc(money(vc.current_total))+'</b><span>'+esc(p2(vc.return_pct))+' от старта</span></div><div><small>Под риском</small><b>'+esc(p1(vc.invested_pct))+'</b><span>денежный остаток '+esc(p1(vc.cash_pct))+'</span></div><div><small>Текущий цикл решения</small><b>'+esc(inv.decision_cycle==null?"—":inv.decision_cycle)+'</b><span>последнее решение: '+esc(actionRu(inv.last_decision||"—"))+'</span></div><div><small>Следующая формальная проверка</small><b>'+esc(nextReview?dateRu(nextReview):"—")+'</b><span>гипотезы: '+esc(h.open==null?"—":h.open)+' открыто · '+esc(h.matured==null?"—":h.matured)+' созрело</span></div></div>'+
          '<div class="inv-section-title"><b>Активность системы</b><span>пять разных классов работы, без искусственного увеличения числа сделок</span></div><div class="inv-activity-grid">'+activityCells.map(function(c){return '<div><small>'+esc(c[0])+'</small><b>'+esc(c[1]==null?"—":c[1])+'</b></div>';}).join("")+'</div>'+
          '<div class="inv-watch"><div><small>Контур наблюдения за решением</small><b>'+esc(watchLabel)+'</b><span>зафиксированный цикл '+esc(inv.decision_cycle==null?"—":inv.decision_cycle)+(watch.pending_cycle!=null?" · открытый цикл "+esc(watch.pending_cycle):" · открытого пересмотра нет")+(reasonText?" · причина: "+esc(reasonText):"")+'</span></div><div><small>Темп</small><span>последняя оценка портфеля: '+esc(cad.last_portfolio_mark_at?ago(cad.last_portfolio_mark_at):"—")+' · данные: '+esc(cad.last_evidence_update_at?ago(cad.last_evidence_update_at):"—")+' · решение: '+esc(cad.last_decision_at?ago(cad.last_decision_at):"—")+'</span></div></div>'+
          '<div class="inv-section-title"><b>Экспозиция и доходность</b><span>доходность читается только вместе с долей вложенного капитала и денежным остатком</span></div><div class="inv-port-table"><div class="inv-port-head"><span>Портфель</span><span>Доходность</span><span>Вложено</span><span>Деньги</span><span>Просадка</span><span>Макс. просадка</span></div>'+portRows+'</div>'+
          '<div class="inv-two-col"><div><small>Гипотезы</small><b>'+esc(h.open==null?"—":h.open)+' открыто · '+esc(h.matured==null?"—":h.matured)+' созрело</b><span>подтверждено '+esc(h.supported==null?"—":h.supported)+' · опровергнуто '+esc(h.falsified==null?"—":h.falsified)+' · доля подтверждённых: '+esc(hypRate)+'</span></div><div><small>Архитектура решений</small><b>происхождение '+esc(archShort(arch.portfolio_origin||inv.architecture))+'</b><span>последнее решение '+esc(archShort(arch.last_decision||inv.last_decision_architecture))+' · следующая допустимая '+esc(archShort(arch.next_eligible||inv.next_decision_architecture))+'</span></div></div>'+
          '<div class="inv-section-title"><b>История решений</b><span>открытый пересмотр не смешивается с уже зафиксированным решением</span></div><div class="inv-history">'+(historyRows||'<div class="cc-empty"><b>История решений не передана</b></div>')+'</div>'+
          '<details class="inv-diagnostics"><summary>Диагностика данных и технических триггеров</summary><div class="inv-diag-grid"><div><small>Покрытие рынка</small><b>'+esc(md.coverage==null?"—":md.coverage)+' / '+esc(md.universe==null?"—":md.universe)+'</b></div><div><small>Покрытие фундаментальных данных</small><b>'+esc(fd.semantic_coverage==null?"—":fd.semantic_coverage)+' / '+esc(fd.universe==null?"—":fd.universe)+'</b></div><div><small>Допуск к решению</small><b>'+esc(humanCode(sem.decision_admission||dq.decision_admission||"—"))+'</b></div><div><small>Технический ложный триггер</small><b>'+esc(a.technical_false_trigger_cycles==null?"—":a.technical_false_trigger_cycles)+' цикл · '+esc(a.technical_false_trigger_events==null?"—":a.technical_false_trigger_events)+' сырых событий</b></div></div><p>Технические ложные триггеры не входят ни в число зафиксированных решений, ни в число действительных пересмотров.</p><code>market snapshot '+esc(shortHash(sem.market_snapshot_sha256))+' · semantic '+esc(shortHash(sem.market_semantic_sha256))+'</code><code>fundamentals snapshot '+esc(shortHash(sem.fundamentals_snapshot_sha256))+' · semantic '+esc(shortHash(sem.fundamentals_semantic_sha256))+'</code>'+(watch.pending_review_sha256?'<code>pending review '+esc(shortHash(watch.pending_review_sha256))+'</code>':"")+'</details>';
      }
    }

    page.querySelectorAll("[data-radar-select]").forEach(function(btn){btn.addEventListener("click",function(){showInspector(btn.getAttribute("data-radar-select"));});});
    var firstImportant=page.querySelector("[data-radar-select].important");
    var first=firstImportant||page.querySelector("[data-radar-select]");
    if(first)showInspector(first.getAttribute("data-radar-select"));
    pageBadge("signals","live","СИГНАЛЫ · LIVE");
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
    var freshnessRaw = sc.freshness_state == null ? null : String(sc.freshness_state).toUpperCase();
    put("freshness", freshnessRaw === "FRESH" ? "Свежий по контракту Scanner" :
      (freshnessRaw === "STALE" ? "Устарел по контракту Scanner" : (freshnessRaw ? humanCode(freshnessRaw) : "Статус свежести не передан")));
    put("last-run", sc.last_run_at ? ago(sc.last_run_at) : "last_run_at не передан");
    var cov = diag.source_coverage || {};
    var covKnown = cov.ok_count != null && cov.total_sources != null;
    put("coverage", cov.status === "UNAVAILABLE" ? "Источник сообщает UNAVAILABLE" :
      (covKnown ? (esc(cov.ok_count) + " / " + esc(cov.total_sources) + " источников" + (cov.status && cov.status !== "OK" ? " · " + esc(cov.status) : "")) : "Покрытие не подтверждено"));
    var enr = diag.enrichment || {};
    var flowKnown = typeof diag.flow_activated === "boolean";
    put("enrichment", diag.flow_activated === true ?
      ((enr.enriched_signals != null ? esc(enr.enriched_signals) : "—") + " / " + (enr.stored_signals != null ? esc(enr.stored_signals) : "—") + " обогащено") :
      (flowKnown ? "Источник явно сообщает: Flow не активирован" : "flow_activated не передан"));
    var ingest = diag.ingest || {};
    var keyKnown = typeof ingest.key_configured === "boolean";
    put("ingest", ingest.key_configured === true ? "Ключ настроен · PATCH выключен" :
      (keyKnown ? "Источник явно сообщает: ключ не настроен" : "key_configured не передан"));

    var failBox = document.querySelector('[data-scan="failing-list"]');
    if (failBox) {
      var failingKnown = Array.isArray(cov.failing);
      var failing = failingKnown ? cov.failing : [];
      failBox.innerHTML = failing.length ? failing.map(function (f) {
        return "<div class='runtime-kv'><span>" + esc(f.source_id) + "</span><b>" +
          esc(f.known_degraded ? "known degraded" : "необъяснённый сбой") + " · " + esc(f.error || "") + "</b></div>";
      }).join("") : (failingKnown ? "<div class='runtime-kv'><span>Текущий failing[]</span><b>пуст</b></div>" : "<div class='runtime-kv'><span>failing[]</span><b>поле не передано</b></div>");
    }
  }

  function liveMode(status) {
    var s=String(status||"").toUpperCase();
    if (["READY","AVAILABLE","FRESH","PASS"].indexOf(s)>=0) return "live";
    if (["UNAVAILABLE","FAIL","ERROR","BLOCKED","UNKNOWN"].indexOf(s)>=0) return "bad";
    return "warn";
  }
  function sourceStatusWarn(status) {
    var s=String(status||"").toUpperCase();
    return ["DEGRADED","STALE","UNAVAILABLE","FAIL","ERROR","BLOCKED"].indexOf(s)>=0;
  }
  function sourceStatusBoxClass(status) { return sourceStatusWarn(status) ? "warn" : ""; }
  function sourceStatusBadgeMode(status) { return sourceStatusWarn(status) ? "warn" : "lab"; }
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
    // Reaching this renderer already proves the projection was read. A semantic
    // BLOCKED/FAIL/UNKNOWN state must not be relabeled as source unavailability.
    pageBadge(pageKey, sourceStatusBadgeMode(sourceStatus), badgeText);
    var root=page.querySelector('[data-normalized-live="'+pageKey+'"]');
    if(root){
      ["tone-flow","tone-return","tone-critical","tone-blue","tone-unknown"].forEach(function(k){root.classList.remove(k);});
      root.classList.add(sourceStatusWarn(sourceStatus)?"tone-return":"tone-flow");
    }
    return page.querySelector('[data-normalized-live="'+pageKey+'"] .panel-body');
  }
  function sourceStatusLabel(value) {
    if (value == null || String(value).trim() === "") return "source_status не передан";
    return "источник сообщает " + String(value);
  }

  function cleanFailure(pageKey,label,stateName) {
    var page=document.querySelector('[data-page-panel="'+pageKey+'"]');
    if (!page) return;
    page.classList.add("normalized-live-active");
    pageBadge(pageKey,"unavailable","ИСТОЧНИК НЕДОСТУПЕН");
    var body=page.querySelector('[data-normalized-live="'+pageKey+'"] .panel-body');
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
      "ОПЕРАЦИИ · "+sourceStatusLabel(data.source_status)+" · "+humanCode(data.freshness_state));
    if(!body)return;
    var c=data.counts||{}, operationsProvided=Array.isArray(data.operations), ops=operationsProvided?data.operations:[];
    var isClosedCommitment=function(o){return ["DONE","CLOSED","ARCHIVED","CANCELLED"].indexOf(String(o.status||"").toUpperCase())>=0;};
    var openOps=ops.filter(function(o){return !isClosedCommitment(o);});
    var closedOps=ops.filter(isClosedCommitment);
    var openObjectIds={};openOps.forEach(function(o){openObjectIds[String(o.object_id||"объект не определён")]=true;});
    var openObjectCount=Object.keys(openObjectIds).length;
    var freshOpen=openOps.filter(function(o){var a=daysSince(o.updated_at||o.opened_at);return a!=null&&a<STALE_DAYS;}).length;
    var staleOpen=openOps.filter(function(o){var a=daysSince(o.updated_at||o.opened_at);return a!=null&&a>=STALE_DAYS;}).length;
    var unknownAgeOpen=openOps.length-freshOpen-staleOpen;
    var ownedOpen=openOps.filter(function(o){return ownerDisplay(o)!=="Недоступно";}).length;
    var factualKnown=ops.filter(function(o){return o.factual_result && String(o.factual_result).toUpperCase()!=="UNAVAILABLE";}).length;
    var ordered=openOps.slice().sort(function(a,b){return String(b.updated_at||b.opened_at||"").localeCompare(String(a.updated_at||a.opened_at||""));}).concat(closedOps);
    var founderFlagKnown=ops.some(function(o){return typeof o.founder_action_required==="boolean"||typeof o.needs_founder==="boolean";});
    var founderRequired=ops.filter(function(o){return o.founder_action_required===true||o.needs_founder===true;}).length;
    var objectBlockerLinks=(c.with_object_level_blockers!=null?Number(c.with_object_level_blockers):null);
    var summary="<div class='live-status-box "+sourceStatusBoxClass(data.source_status)+"'><strong>Операционная проекция — "+esc(sourceStatusLabel(data.source_status))+"</strong>"+
      "<p>"+(String(data.freshness_state).toUpperCase()==="STALE"?"Открытые обязательства не имели нового движения в окне свежести. Они не отменяются автоматически, но не должны выглядеть как свежая операционная очередь.":"Состояние прочитано из серверной проекции.")+"</p></div>"+
      "<div class='operations-proof-boundary'><b>Граница вмешательства Основателя:</b> "+esc(founderFlagKnown?(founderRequired+" записей явно требуют Основателя по полю источника."):"поля needs_founder / founder_action_required в operations[] не переданы. Панель не считает эти обязательства задачами Ники без явного основания.")+"</div>"+
      "<div class='live-summary'>"+
      "<div class='metric'><small>Объекты с открытыми обязательствами</small><strong>"+esc(operationsProvided?openObjectCount:"—")+"</strong><span>"+esc(operationsProvided?openOps.length+" открытых записей":"operations[] не передан")+"</span></div>"+
      "<div class='metric'><small>Свежие открытые записи</small><strong>"+esc(operationsProvided?freshOpen:"—")+"</strong><span>движение менее "+esc(STALE_DAYS)+" дней назад</span></div>"+
      "<div class='metric'><small>Старые открытые записи</small><strong>"+esc(operationsProvided?staleOpen:"—")+"</strong><span>"+(unknownAgeOpen?esc(unknownAgeOpen)+" без подтверждённой даты · ":"")+"не закрываются автоматически</span></div>"+
      "<div class='metric'><small>Владелец известен</small><strong>"+esc(operationsProvided?ownedOpen+" / "+openOps.length:"—")+"</strong><span>среди открытых записей</span></div></div>"+
      "<div class='operations-proof-boundary'><b>Граница доказанного:</b> "+
        (operationsProvided?(openOps.length?(openObjectCount+" объектов имеют "+openOps.length+" записей без явного закрывающего статуса. Из них "+freshOpen+" имели движение менее "+STALE_DAYS+" дней назад, "+staleOpen+" давно не двигались"+(unknownAgeOpen?", у "+unknownAgeOpen+" дата не подтверждена":"")+"."):"Источник явно передал operations[] без записей с незакрытым статусом."):"Поле operations[] не передано; количество открытых обязательств не подтверждено.")+" "+
        (operationsProvided?(ownedOpen+" из "+openOps.length+" открытых записей имеют переданного владельца хода. "+factualKnown+" из "+ops.length+" записей всей проекции передают фактический результат; `closed_at` доказывает закрытие записи, но не бизнес-исход. "+(objectBlockerLinks!=null?objectBlockerLinks+" записей имеют объектные blocker-связи по агрегату counts.with_object_level_blockers; это не доказывает blocker каждого обязательства и не назначает действие Основателю.":"Агрегат object-level blocker-связей не передан.")):"Владельцы и фактические результаты также не проверены.")+"</div>";
    var openGroups={};
    openOps.forEach(function(o){
      var id=String(o.object_id||"объект не определён");
      if(!openGroups[id])openGroups[id]={id:id,items:[],latest:null};
      openGroups[id].items.push(o);
      var at=o.updated_at||o.opened_at||null;
      if(at&&(!openGroups[id].latest||String(at)>String(openGroups[id].latest)))openGroups[id].latest=at;
    });
    var groupedOpen=Object.keys(openGroups).map(function(k){return openGroups[k];}).sort(function(a,b){return String(b.latest||"").localeCompare(String(a.latest||""));});
    var rows=groupedOpen.map(function(g){
      var items=g.items.slice().sort(function(a,b){return String(b.updated_at||b.opened_at||"").localeCompare(String(a.updated_at||a.opened_at||""));});
      var latest=items[0]||{}, age=daysSince(latest.updated_at||latest.opened_at);
      var owners={};items.forEach(function(o){var v=ownerDisplay(o);if(v!=="Недоступно")owners[v]=true;});
      var ownerNames=Object.keys(owners);
      var activation=items.filter(function(o){return o.activation_condition;})[0];
      return "<div class='live-item-clean direction-selectable' data-direction-role='projection' data-direction-title='"+attr(g.id)+"' data-direction-summary='"+attr(g.id+": "+items.length+" открытых обязательств; последнее движение "+(age==null?"не датировано":age+" дн. назад")+".")+"'><div class='live-item-clean-head'><h3>"+esc(g.id)+"</h3>"+chip(items.length+" открыто")+"</div>"+
        "<p>"+esc(cut(operationSummaryRu(latest),220))+"</p>"+
        "<div class='live-kv-grid'>"+kv("Открытых обязательств",items.length)+kv("Последнее движение",age==null?"дата не передана":age+" дн. назад")+kv("Владельцы",ownerNames.length?ownerNames.join(", "):"не переданы")+kv("Условие активации",activation?projectionTextRu(activation.activation_condition):"не передано")+"</div>"+
        "<small>Это объектный обзор. "+esc(items.length)+" исходных commitment-записей сохранены в серверной проекции и не объединяются в одно обязательство.</small></div>";
    }).join("");
    var unavailableOpsFields=Array.isArray(data.unavailable_fields)?data.unavailable_fields:null;
    var unavailableOpsHTML=unavailableOpsFields?("<div class='live-item-clean'><div class='live-item-clean-head'><h3>Сознательно неизвестные поля</h3><small>буквальный unavailable_fields[] операционной проекции</small></div>"+(unavailableOpsFields.length?"<div class='live-kv-grid' data-ops-unavailable-fields>"+unavailableOpsFields.map(function(f){return kv(projectionFieldRu(f),"недоступно");}).join("")+"</div>":"<p data-ops-unavailable-fields>Источник явно передал пустой unavailable_fields[].</p>")+"</div>"):"";
    body.innerHTML=summary+unavailableOpsHTML+"<div class='live-list-clean'>"+rows+"</div>"+(closedOps.length?"<div class='live-more'>"+esc(closedOps.length)+" исторически закрытых записей сохранены в источнике и не занимают текущий обзор.</div>":"");
    refreshDirectionInspector("operations");
  }

  function renderLatestBranchActivity(a, pageKey) {
    if (!a || !a.event_type) return "";
    var type=String(a.event_type||"").toUpperCase();
    var blocked=/BLOCKED|BLOCKER/.test(type);
    var tone=blocked?"tone-critical":"tone-return";
    var title=blocked?"Последнее материальное событие ветки · BLOCKED-событие":"Последнее материальное событие ветки";
    var when=a.received_at||a.valid_at;
    return "<div class='live-item-clean branch-activity "+tone+"' data-direction-role='"+(blocked?"decision":"evidence")+"'>"+
      "<div class='live-item-clean-head'><h3>"+esc(title)+"</h3>"+chip(type)+"</div>"+
      "<p>"+esc(a.human_change||"Ветка опубликовала материальное наблюдение.")+"</p>"+
      (a.blocker_explicit?"<div class='live-warning'><b>Blocker:</b> "+esc(a.blocker_explicit)+"</div>":"")+
      "<div class='live-kv-grid'>"+
      kv("Ветка",a.source_branch||"—")+
      kv("Наблюдение",a.why_it_matters||"—")+
      kv("Следующий подтверждённый шаг",a.next_milestone||"—")+
      kv("Когда поступило",when?ago(when):"—")+
      "</div>"+
      "<small>"+esc((a.evidence_ceiling||"Это отдельное наблюдение ветки; оно не заменяет каноническое состояние объекта.")+" event_type="+type+" описывает именно это материальное событие, а не текущий статус нормализованной проекции страницы.")+"</small></div>";
  }

  function renderBrazilPortalProjection(data) {
    if (!sourceState.brazilPortal.ok || !data) return cleanFailure("brazilportal","BrazilPortal","brazilPortal");
    var sv=data.status_views||{}, id=data.identity||{};
    var body=activateNormalized("brazilportal",data.source_status,
      "BRAZILPORTAL · "+sourceStatusLabel(data.source_status));
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
    var stageKnown=!!(data.stage&&data.stage.value!=null);
    var identityKnown=!!(id.component_id&&id.operational_object_id&&id.relation);
    var blockersN=(data.open_blockers&&data.open_blockers.count!=null)?data.open_blockers.count:null;
    var commitmentsN=(data.open_commitments&&data.open_commitments.count!=null)?data.open_commitments.count:null;
    body.innerHTML=
      "<div class='live-status-box "+sourceStatusBoxClass(data.source_status)+"'><strong>BrazilPortal — "+esc(sourceStatusLabel(data.source_status))+ (stale?" · данные устарели":"") +"</strong>"+
      "<p>"+(stale?"Последнее материальное движение: "+esc(data.last_movement_at?ago(data.last_movement_at):"не передано")+". ":"")+(unresolved?"Спроецированный статус пока не связан с каноном; объявленный статус сохраняется отдельно.":"Состояние прочитано из нормализованной проекции.")+"</p></div>"+
      "<div class='live-summary'>"+
      "<div class='metric'><small>Объявленный статус</small><strong>"+esc(bpCodeRu(sv.declared_status))+"</strong><span>что объект объявляет о себе</span></div>"+
      "<div class='metric'><small>Спроецированный статус</small><strong>"+esc(bpCodeRu(sv.projected_status))+"</strong><span>что вывело последнее смысловое событие</span></div>"+
      "<div class='metric'><small>Связь статуса с каноном</small><strong>"+esc(bpCodeRu(sv.projected_status_canonical_relation))+"</strong><span>относится только к спроецированному статусу</span></div>"+
      "<div class='metric'><small>Этап</small><strong>"+esc(bpCodeRu(val(data.stage)))+"</strong><span>"+esc(stageKnown?"значение передано источником":"stage.value не передан")+"</span></div></div>"+
      "<div class='bp-identity-proof'><b>"+esc(identityKnown?"Идентичность связана источником.":"Связь идентичности не полностью подтверждена текущей проекцией.")+"</b><span>Компонент "+esc(id.component_id||"—")+" и операционный объект "+esc(id.operational_object_id||"—")+"; отношение: «"+esc(bpCodeRu(id.relation))+"». Ключ чтения Continuity: "+esc(id.canonical_read_key||"—")+".</span></div>"+
      "<div class='live-item-clean'><div class='live-item-clean-head'><h3>Следующий ход</h3>"+chip(data.source_status)+"</div>"+
      "<div class='live-kv-grid'>"+kv("Владелец",val(data.owner))+kv("Следующий рубеж",bpCodeRu(val(data.next_gate)))+kv("Следующий ход",projectionTextRu(val(data.next_move)))+kv("Открытые blocker-записи объекта",blockersN==null?"—":blockersN)+kv("Открытые обязательства (поле источника)",commitmentsN==null?"—":commitmentsN)+kv("Последнее материальное событие",data.last_material_event&&data.last_material_event.last_event_at?ago(data.last_material_event.last_event_at):"—")+"</div>"+
      "<small>"+(blockersN==null?"Счётчик open_blockers.count не передан; наличие или отсутствие blocker-записей не подтверждено.":(esc(blockersN)+" blocker-записей "+(id.operational_object_id?"связаны серверной проекцией с операционным объектом "+esc(id.operational_object_id):"переданы серверной проекцией; операционный объект в identity не указан")+". Источник не доказывает test-фильтрацию и не передаёт единую оценку тяжести, поэтому Панель не называет их "+(blockersN===1?"одним препятствием":"одинаково критическими препятствиями")+"."))+"</small></div>"+
      (Array.isArray(data.unavailable_fields)?"<div class='live-item-clean'><div class='live-item-clean-head'><h3>Сознательно неизвестные поля</h3><small>буквальный unavailable_fields[] проекции BrazilPortal</small></div>"+(data.unavailable_fields.length?"<div class='live-kv-grid' data-bp-unavailable-fields>"+data.unavailable_fields.map(function(f){return kv(projectionFieldRu(f),"недоступно");}).join("")+"</div>":"<p data-bp-unavailable-fields>Источник явно передал пустой unavailable_fields[].</p>")+"</div>":"")+
      renderLatestBranchActivity(data.latest_branch_activity,"brazilportal");
  }

  function renderFoundationAggregateClean(data, inbox) {
    if (!sourceState.foundationAgg.ok || !data) return cleanFailure("foundation","Фундамент","foundationAgg");
    var body=activateNormalized("foundation",data.source_status,
      "ФУНДАМЕНТ · "+sourceStatusLabel(data.source_status));
    if(!body)return;
    var names={
      continuity_source_health:"Контур Continuity",
      artifact_durability_readback:"Долговечность / обратное чтение",
      authority_action_path:"Путь полномочий",
      testing_execution_integrity:"Исполнение Testing"
    };
    var dimensionsKnown=Array.isArray(data.dimensions);
    var dims=dimensionsKnown?data.dimensions:[];
    var mandatoryKnown=dimensionsKnown && dims.length>0 && dims.every(function(d){return d && typeof d.mandatory==="boolean";});
    var passBase=mandatoryKnown?dims.filter(function(d){return d.mandatory===true;}):dims;
    var passCount=passBase.filter(function(d){return String(d&&d.state||"").toUpperCase()==="PASS";}).length;
    var cards=dims.map(function(d){
      var extra = "";
      if (d.dimension === "artifact_durability_readback") {
        var det = d.detail || {};
        var explicitCleanCounts = det.hash_mismatches === 0 && det.artifacts_missing === 0;
        var orphanFailureN = numberOrNull(det.orphan_receipts);
        var excludedTestOrphanN = numberOrNull(det.excluded_test_orphan_receipts);
        var explicitOrphanFailure = String(d.state || "").toUpperCase() === "FAIL" && orphanFailureN != null && orphanFailureN > 0;
        var proofNote = d.blocking_reason ?
          "Причина состояния передана в blocking_reason выше; Панель не заменяет её собственной причинной моделью." :
          (explicitCleanCounts && explicitOrphanFailure ?
            "Источник явно передал 0 потерянных артефактов, 0 расхождений хэшей и ненулевой orphan_receipts при state=FAIL. Панель показывает это сочетание, но не идентифицирует конкретную расписку без поля источника." :
            "Поля обратного чтения показаны буквально. Причина состояния сверх переданных state, detail и blocking_reason Панелью не выводится." + (excludedTestOrphanN != null && excludedTestOrphanN > 0 ? " Источник отдельно передал " + excludedTestOrphanN + " доказанно исключённую тестовую расписку; она не считается производственной осиротевшей распиской и не удалена из исторического учёта." : ""));
        extra = "<div class='foundation-proof-grid'>" +
          "<span><small>На диске</small><b>" + esc(det.objects_on_disk != null ? det.objects_on_disk : "—") + "</b></span>" +
          "<span><small>Расхождения хэшей</small><b>" + esc(det.hash_mismatches != null ? det.hash_mismatches : "—") + "</b></span>" +
          "<span><small>Потерянные артефакты</small><b>" + esc(det.artifacts_missing != null ? det.artifacts_missing : "—") + "</b></span>" +
          "<span><small>Осиротевшие расписки</small><b>" + esc(det.orphan_receipts != null ? det.orphan_receipts : "—") + "</b></span>" +
          "<span><small>Исключённые self-test расписки</small><b>" + esc(det.excluded_test_orphan_receipts != null ? det.excluded_test_orphan_receipts : "—") + "</b></span></div>" +
          "<div class='foundation-proof-note'><b>Граница интерпретации:</b> " + esc(proofNote) + "</div>";
      }
      return "<div class='live-item-clean'><div class='live-item-clean-head'><h3>"+esc(names[d.dimension]||d.dimension)+"</h3>"+chip(d.state)+"</div>"+
        (d.blocking_reason?"<div class='live-warning'>"+esc(projectionTextRu(d.blocking_reason))+"</div>":"")+ extra +
        "<small>"+esc(d.proven_by_source ? "Источник доказательства: "+d.proven_by_source : "proven_by_source не передан")+"</small></div>";
    }).join("");
    var blockingProvided=Array.isArray(data.blocking_reasons);
    var blocking=blockingProvided?data.blocking_reasons:[];
    var systemItemsKnown=!!(sourceState.inbox.ok&&inbox&&Array.isArray(inbox.system_attention));
    var systemItems=systemItemsKnown?inbox.system_attention:[];
    function sysLastSeenAge(x){return daysSince(x&&x.last_seen_at);}
    function sysOpenedAge(x){return daysSince(x&&x.opened_at);}
    function sysFixture(x){var s=[x&&x.source_system,x&&x.title,x&&x.reason,x&&x.issue_key].filter(Boolean).join(" ");return /(?:TEST|FIXTURE|NONEXISTENT_OBJECT)/i.test(s);}
    var systemBlock="";
    if(systemItemsKnown){
      var newlyOpenedSystem=systemItems.filter(function(x){var a=sysOpenedAge(x);return a!=null&&a<STALE_DAYS;}).length;
      var recurringOldSystem=systemItems.filter(function(x){var opened=sysOpenedAge(x),seen=sysLastSeenAge(x);return opened!=null&&opened>=STALE_DAYS&&seen!=null&&seen<STALE_DAYS;}).length;
      var dormantSystem=systemItems.filter(function(x){var a=sysLastSeenAge(x);return a!=null&&a>=STALE_DAYS;}).length;
      var unknownSystemAge=systemItems.length-newlyOpenedSystem-recurringOldSystem-dormantSystem;
      var fixtureSystem=systemItems.filter(sysFixture).length;
      var byType={};systemItems.forEach(function(x){var k=String(x.issue_type||"UNKNOWN");byType[k]=(byType[k]||0)+1;});
      var rows=[["SYNC_HEALTH_DEGRADED","свежесть / синхронизация"],["MEANING_ASSESSMENT_REJECTED","отклонённые смысловые записи"],["INGRESS_PACKET_NOT_INGESTED","входящие пакеты без полного контракта"],["PROJECTION_REJECTED","отклонённые проекции"]].filter(function(x){return byType[x[0]];}).map(function(x){return "<span><small>"+esc(x[1])+"</small><b>"+esc(byType[x[0]])+"</b></span>";}).join("");
      systemBlock="<div class='live-item-clean direction-selectable tone-return' data-direction-role='evidence' data-direction-title='Системное внимание' data-direction-summary='"+attr(systemItems.length+" системных записей четырёх классов: "+newlyOpenedSystem+" открыты менее "+STALE_DAYS+" дней назад; "+recurringOldSystem+" старые, но продолжают повторно наблюдаться; "+dormantSystem+" не повторялись 7+ дней; "+fixtureSystem+" имеют явные признаки тестового происхождения.")+"'><div class='live-item-clean-head'><h3>Системные записи внимания</h3>"+chip(systemItems.length+" записей")+"</div><div class='foundation-proof-grid'>"+rows+"</div><small>"+esc(newlyOpenedSystem+" новых за "+STALE_DAYS+" дней · "+recurringOldSystem+" старых, но всё ещё повторно наблюдаются · "+dormantSystem+" давно не повторялись"+(unknownSystemAge?" · "+unknownSystemAge+" без полной даты":"")+" · "+fixtureSystem+" с явным тестовым происхождением. last_seen показывает повторное обнаружение, а не дату возникновения проблемы. Эти записи не входят в текущий blocking_reasons[] Foundation и сами по себе не входят в needs_founder[]; это системная очередь инфраструктуры/владеющих веток, а не личная очередь Ники. Это не делает их автоматически несущественными.")+"</small></div>";
    } else if(sourceState.inbox.ok){
      systemBlock="<div class='live-item-clean'><div class='live-item-clean-head'><h3>Системное внимание</h3>"+chip("—")+"</div><small>Founder inbox ответил, но system_attention[] не передан; состав системной очереди не подтверждён.</small></div>";
    }
    var founderNeedsKnown=!!(sourceState.inbox.ok&&inbox&&Array.isArray(inbox.needs_founder));
    var founderNeeds=founderNeedsKnown?inbox.needs_founder:[];
    body.innerHTML=
      "<div class='live-status-box "+sourceStatusBoxClass(data.source_status)+"'><strong>Состояние основания — "+esc(sourceStatusLabel(data.source_status))+"</strong>"+
      "<p>"+(blockingProvided?(blocking.length?"Есть подтверждённый блокирующий дефект. Зелёный READY не показывается.":"Источник явно передал пустой blocking_reasons[]. Готовность определяется агрегированным source_status, а не этим нулём отдельно."):"Поле blocking_reasons не передано; отсутствие блокирующих причин не подтверждено.")+"</p></div>"+
      "<div class='operations-proof-boundary'><b>Действия Ники:</b> "+esc(founderNeedsKnown?(founderNeeds.length+" по явному needs_founder[]."+(founderNeeds.length?" Откройте Командный центр для решения.":" Системные записи ниже не являются личной очередью Основателя.")):"не подтверждены: Founder inbox не передал needs_founder[].")+"</div>"+
      "<div class='live-summary'>"+
      "<div class='metric'><small>Общий статус</small><strong>"+esc(sourceStatusLabel(data.source_status))+"</strong><span>серверная агрегированная проекция — единственный источник этого статуса</span></div>"+
      "<div class='metric'><small>Свежесть</small><strong>"+esc(data.freshness_state?humanCode(data.freshness_state):"не передана")+"</strong><span>поле freshness_state серверной проекции</span></div>"+
      "<div class='metric'><small>Пройдено</small><strong>"+esc(passBase.length?passCount+" / "+passBase.length:"—")+"</strong><span>"+esc(mandatoryKnown?"обязательные измерения":"переданные dimensions; mandatory не полностью указан")+"</span></div>"+
      "<div class='metric'><small>Блокирующие причины</small><strong>"+esc(blockingProvided?blocking.length:"—")+"</strong><span>"+esc(blockingProvided?"по явному blocking_reasons[]":"поле не передано")+"</span></div></div>"+
      (blocking.length?"<div class='live-warning'>"+blocking.map(function(x){return esc(projectionTextRu(x));}).join("<br>")+"</div>":"")+
      systemBlock +
      "<div class='live-list-clean'>"+(dimensionsKnown?(cards||"<div class='live-item-clean'><small>Источник явно передал пустой dimensions[].</small></div>"):"<div class='live-item-clean'><small>Поле dimensions[] не передано; состав измерений основания не подтверждён.</small></div>")+"</div>" +
      "<div class='foundation-ready-rule'><b>Условие возврата в состояние «готово»:</b> каждое обязательное измерение должно снова иметь PASS от живого источника. Прошлый PASS или сохранённый отчёт не заменяет текущее доказательство.</div>";
    refreshDirectionInspector("foundation");
  }

  function wireDirectionInspector(pageKey) {
    var metaMap={
      atlas:{label:"ATLAS",mark:"A",source:"ATLAS",tone:"flow"},
      "digital-twin":{label:"DT",mark:"DT",source:"DT",tone:"violet"},
      foundation:{label:"Фундамент",mark:"F",source:"Foundation",tone:"flow"},
      research:{label:"Исследования",mark:"R",source:"Research",tone:"flow"},
      operations:{label:"Операции",mark:"O",source:"Operations",tone:"return"},
      commercial:{label:"Коммерция",mark:"C",source:"Коммерческий контур",tone:"flow"}
    };
    var meta=metaMap[pageKey]||{label:pageKey,mark:"•",source:pageKey,tone:"flow"};
    var page=document.querySelector('[data-page-panel="'+pageKey+'"]');
    if(!page||page.getAttribute("data-direction-wired")==="1") return;
    page.setAttribute("data-direction-wired","1");
    function roleFor(el){
      if(el.getAttribute("data-direction-role")) return el.getAttribute("data-direction-role");
      var h=(el.querySelector("h3,h2,strong,small")||{}).textContent||"";
      h=String(h).toLowerCase();
      if(/инвест/.test(h))return "investment";
      if(/исслед|модел|прогноз/.test(h))return "research";
      if(/gate|решен|review|подтверж/.test(h))return "decision";
      if(/свеж|границ|доказ|предохран/.test(h))return "evidence";
      if(/модул/.test(h))return "modules";
      return "projection";
    }
    function toneFor(el){
      for(var n=el;n&&n!==page;n=n.parentElement){
        if(n.classList&&n.classList.contains("tone-return"))return "return";
        if(n.classList&&n.classList.contains("tone-violet"))return "violet";
        if(n.classList&&n.classList.contains("tone-critical"))return "critical";
        if(n.classList&&n.classList.contains("tone-blue"))return "blue";
        if(n.classList&&n.classList.contains("tone-unknown"))return "unknown";
        if(n.classList&&n.classList.contains("tone-flow"))return "flow";
      }
      return meta.tone;
    }
    function boundary(role){
      var m={
        canonical:"Это основная безопасная проекция направления. Инспектор не достраивает отсутствующие поля и не повышает статус источника.",
        investment:"Инвестиционный блок показывает только агрегаты и зафиксированные состояния источника. Незавершённый review не считается инвестиционным решением.",
        "signal-lab":"Signal Lab — наблюдаемый исследовательский процесс. Он не подменяет каноническое состояние ATLAS.",
        research:"Исследовательский блок показывает переданное состояние модели или прогноза без повышения доказательного статуса.",
        decision:"Решения и gates показываются только в том виде, в котором их передал источник. Наличие карточки не означает разрешение на исполнение.",
        evidence:"Это доказательная или защитная граница. Неизвестное остаётся неизвестным.",
        modules:"Показаны только явно объявленные модули и их область полномочий.",
        projection:"Панель показывает текущую серверную проекцию и не выводит скрытое состояние из косвенных признаков."
      };
      return m[role]||m.projection;
    }
    function show(el){
      var host=page.querySelector('[data-direction-inspector="'+pageKey+'"]');
      if(!host||!el)return;
      page.querySelectorAll(".direction-selected").forEach(function(x){x.classList.remove("direction-selected");});
      el.classList.add("direction-selected");
      var role=roleFor(el), tone=toneFor(el);
      var titleEl=el.querySelector("h3,h2,strong,b");
      var title=el.getAttribute("data-direction-title")||(titleEl?titleEl.textContent.trim():meta.label);
      var textEls=Array.from(el.querySelectorAll("p,span,small")).filter(function(x){return !x.closest(".live-kv-clean")&&x!==titleEl;});
      var summary=el.getAttribute("data-direction-summary")||textEls.map(function(x){return x.textContent.trim();}).filter(Boolean).slice(0,4).join(" · ");
      if(!summary){
        var vals=Array.from(el.querySelectorAll(".live-kv-clean")).slice(0,4).map(function(x){return x.textContent.trim().replace(/\s+/g," ");});
        summary=vals.join(" · ");
      }
      var toneLabel={flow:"живое / каноническое",violet:"исследование / модель",return:"решение / проверка",critical:"конфликт / блокировка",blue:"доказательная граница",unknown:"неизвестное"}[tone]||"проекция";
      var ctx={
        kind:"direction_panel",
        title:title,
        sub:meta.label+" · "+toneLabel,
        layer:role,
        source:"Founder Panel / "+meta.source,
        why:boundary(role),
        details:summary
      };
      var mark=meta.mark;
      host.style.setProperty("--insp-zone",tone==="return"?"var(--cc-return)":tone==="violet"?"var(--cc-violet)":tone==="critical"?"var(--cc-critical)":tone==="blue"?"#5aa9e6":tone==="unknown"?"var(--cc-unknown)":"var(--cc-flow)");
      host.innerHTML=
        '<div class="cc-insp-title">'+esc(meta.label)+' · контекст</div>'+
        '<div class="cc-insp-head"><span class="direction-insp-mark">'+esc(mark)+'</span><div><h3>'+esc(title)+'</h3><small>'+esc(toneLabel)+'</small></div></div>'+
        '<div class="cc-insp-sec"><h4>Что здесь показано</h4><p>'+esc(summary||"Источник не передал отдельное текстовое пояснение для этого окна.")+'</p></div>'+
        '<div class="cc-insp-sec"><h4>Граница чтения</h4><p>'+esc(boundary(role))+'</p></div>'+
        '<div class="cc-insp-sec"><h4>Что можно спросить</h4><p>Почему это состояние важно сейчас? Что изменилось? С чем связано? Какой следующий подтверждённый переход и кто его владелец?</p></div>'+
        '<button type="button" class="cc-steward-ask"><b>Спросить Навигатора</b><span>разобрать это окно, связи, историю или следующий шаг</span></button>';
      var b=host.querySelector(".cc-steward-ask");
      if(b)b.setAttribute("data-cc-steward-context",JSON.stringify(ctx));
    }
    page.addEventListener("click",function(ev){
      var el=ev.target.closest(".direction-selectable,.live-item-clean,.metric,.twin-proof-boundary,.atlas-invest-panel,.atlas-siglab-card,.direction-primary-panel,.research-system-bridge,.card");
      if(!el||!page.contains(el)||el.closest(".direction-inspector"))return;
      show(el);
    });
    page._showDirectionInspector=show;
  }

  function refreshDirectionInspector(pageKey) {
    wireDirectionInspector(pageKey);
    var page=document.querySelector('[data-page-panel="'+pageKey+'"]');
    if(!page||!page._showDirectionInspector)return;
    var selected=page.querySelector(".direction-selected");
    if(selected&&selected.isConnected)return page._showDirectionInspector(selected);
    var first=page.querySelector(".direction-primary-panel .live-status-box,.direction-primary-panel .metric,.direction-primary-panel .live-item-clean,.direction-body > .research-system-bridge,.direction-body > .card,.direction-primary-panel");
    if(first)page._showDirectionInspector(first);
  }

  function renderAtlasStateClean(data) {
    if (!sourceState.atlasState.ok || !data) return cleanFailure("atlas","Атлас","atlasState");
    var status = data.source_status == null ? null : String(data.source_status);
    var body=activateNormalized("atlas",status,"АТЛАС · "+sourceStatusLabel(status));
    if(!body)return;

    // Gate-2 v1 canonical Founder projection.
    if (data.atlas_state_version && data.source_authority) {
      var authority=data.source_authority||{};
      var modules=Array.isArray(data.active_modules)?data.active_modules:null;
      var gates=Array.isArray(data.current_decisions_or_gates)?data.current_decisions_or_gates:null;
      var blockers=Array.isArray(data.current_blockers)?data.current_blockers:null;
      var freshness=data.freshness&&data.freshness.domains?data.freshness.domains:{};
      var research=data.research_runs_active||{};
      var commercial=data.commercial_runs_active||{};
      var frozen=data.frozen_or_disabled_branches||{};
      var investment=data.investment_lab_state||{};
      function modeRu(v){var m={PARTIAL_DECLARED_STATE:"частично объявленное состояние"};return m[String(v||"")]||humanCode(v||"—");}
      function domainRu(v){var m={signal_pipeline:"сигнальный контур",research:"исследования",investment:"инвестиционный контур",commercial:"коммерческий контур",freeze_registry:"реестр заморозки","investment-lab":"инвестиционная лаборатория"};return m[String(v||"")]||humanCode(v||"—");}
      function reasonRu(v){var m={NO_DECLARED_CANONICAL_SOURCE:"канонический источник не объявлен"};return m[String(v||"")]||projectionTextRu(v||"—");}
      function dt(v){return v?new Date(v).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—";}
      var freshnessCards=Object.keys(freshness).map(function(k){var f=freshness[k]||{};return "<div><b>"+esc(domainRu(k))+" · "+esc(sourceStatusLabel(f.status||"UNKNOWN"))+"</b><span>смысловая метка: "+esc(dt(f.semantic_at))+"</span></div>";}).join("");
      var moduleCards=modules===null?"<div><b>Модули не переданы</b><span>Поле active_modules отсутствует.</span></div>":(modules.length?modules.map(function(m){return "<div><b>"+esc(m.module||"модуль")+" · "+esc(humanCode(m.state||"—"))+"</b><span>область полномочий: "+esc(humanCode(m.authority_scope||"—"))+(m.evidence_ref_id?" · доказательство: "+esc(m.evidence_ref_id):"")+"</span></div>";}).join(""):"<div><b>Активных модулей нет</b><span>Источник явно передал пустой active_modules[].</span></div>");
      function gateTypeRu(g){var t=String(g&&g.type||"");if(t==="DECISION_REVIEW"&&String(g&&g.domain||"")==="investment-lab")return "внутренний review инвестиционной лаборатории";if(t==="GATE")return "гейт";return humanCode(t||"—");}
      var gateCards=gates===null?"<div><b>Гейты не переданы</b><span>Поле current_decisions_or_gates отсутствует.</span></div>":(gates.length?gates.map(function(g){var internalReview=String(g.domain||"")==="investment-lab"&&String(g.type||"")==="DECISION_REVIEW";return "<div><b>"+esc(domainRu(g.domain))+" · "+esc(gateTypeRu(g))+"</b><span>"+esc(projectionTextRu(g.value||"—"))+(g.cycle!=null?" · цикл "+esc(g.cycle):"")+(internalReview?" · это не назначение Основателю":"")+"</span></div>";}).join(""):"<div><b>Текущих гейтов нет</b><span>Источник явно передал пустой список.</span></div>");
      var projectionBoundary=data.projection_boundary||"не передана";
      body.innerHTML=
        "<div class='live-status-box "+sourceStatusBoxClass(status)+"'><strong>ATLAS — "+esc(sourceStatusLabel(status))+"</strong><p>Каноническое междоменное состояние читается из ATLAS State Authority. Неизвестные домены сохраняются неизвестными и не достраиваются Панелью.</p></div>"+
        "<div class='live-summary'>"+
        "<div class='metric'><small>Режим</small><strong>"+esc(modeRu(data.operating_mode))+"</strong><span>source_authority: "+esc(authority.authority_id||"не передан")+"</span></div>"+
        "<div class='metric'><small>Revision</small><strong>r"+esc(data.atlas_state_revision==null?"—":data.atlas_state_revision)+"</strong><span>контракт "+esc(data.atlas_state_version||"—")+"</span></div>"+
        "<div class='metric'><small>Активные модули</small><strong>"+esc(modules===null?"—":modules.length)+"</strong><span>только объявленные authority-модули</span></div>"+
        "<div class='metric'><small>Blockers</small><strong>"+esc(blockers===null?"—":blockers.length)+"</strong><span>только current_blockers источника</span></div></div>"+
        "<div class='live-item-clean tone-flow' data-direction-role='canonical'><div class='live-item-clean-head'><h3>Состояние доменов</h3><small>раздельные authority, без сведения в один искусственный health</small></div><div class='live-kv-grid'>"+
          kv("Сигнальный контур",(data.signal_pipeline_health&&data.signal_pipeline_health.status)||"—")+
          kv("Исследования",research.status||"—")+
          kv("Инвестиционный контур",investment.status||"—")+
          kv("Коммерческий контур",commercial.status?humanCode(commercial.status):"—")+
          kv("Замороженные/отключённые ветки",frozen.status?humanCode(frozen.status):"—")+
          kv("Граница проекции",projectionBoundary)+"</div>"+
          ((commercial.status==="UNKNOWN"||frozen.status==="UNKNOWN")?"<div class='live-warning'>Неизвестное сохранено буквально: коммерческий контур — "+esc(reasonRu(commercial.reason))+"; freeze registry — "+esc(reasonRu(frozen.reason))+".</div>":"")+"</div>"+
        "<div class='live-item-clean tone-violet' data-direction-role='research'><div class='live-item-clean-head'><h3>Исследовательский контур</h3><small>authority: "+esc(research.authority||"не передан")+"</small></div><div class='live-kv-grid'>"+
          kv("Фаза",projectionTextRu(research.phase||"—"))+kv("Текущий этап",research.current_stage&&research.current_stage.label||research.current_stage&&research.current_stage.name||"—")+kv("Следующий gate",projectionTextRu(research.next_gate||"—"))+kv("Нужно решение Основателя",research.founder_action_required===true?"да":research.founder_action_required===false?"нет":"не передано")+"</div></div>"+
        (investment.status?"<div class='live-item-clean tone-return' data-direction-role='investment'><div class='live-item-clean-head'><h3>Инвестиционная лаборатория</h3><small>"+esc(humanCode(investment.deployment_mode||investment.status))+"</small></div><div class='live-kv-grid'>"+kv("Состояние",investment.status)+kv("Последнее решение",investment.last_decision||"—")+kv("Зафиксированный цикл",investment.decision_cycle==null?"—":investment.decision_cycle)+kv("Внутренний review лаборатории",investment.decision_watch&&investment.decision_watch.status||"—")+"</div><small>Текущий review принадлежит authority инвестиционной лаборатории. Он не становится решением или задачей Основателя без отдельного явного Founder-флага.</small></div>":"")+
        "<div class='live-item-clean tone-blue' data-direction-role='modules'><div class='live-item-clean-head'><h3>Активные модули</h3></div><div class='agent-contract-list'>"+moduleCards+"</div></div>"+
        "<div class='live-item-clean tone-return' data-direction-role='decision'><div class='live-item-clean-head'><h3>Текущие gates и решения</h3></div><div class='agent-contract-list'>"+gateCards+"</div></div>"+
        "<div class='live-item-clean tone-blue' data-direction-role='evidence'><div class='live-item-clean-head'><h3>Смысловая свежесть</h3><small>время HTTP-ответа не используется как замена</small></div><div class='agent-contract-list'>"+(freshnessCards||"<div><b>Freshness не передана</b><span>Доменная свежесть не подтверждена.</span></div>")+"</div></div>";
      refreshDirectionInspector("atlas");
      return;
    }

    // Pre-Gate-2 / degraded compatibility path.
    var reason = data.degraded_reason || data.reason || null;
    var errorClass = data.error_class || null;
    var currentState = data.current_state || data.state || null;
    var nextStep = data.next_action || data.next_step || null;
    var noStateSource = String(errorClass || "").toUpperCase() === "NO_ATLAS_STATE_SOURCE";
    var unavailableFields = Array.isArray(data.unavailable_fields) ? data.unavailable_fields : null;
    var unblock = data.unblock_requires || null;
    var blockedStage = data.blocked_stage || null;
    body.innerHTML=
      "<div class='live-status-box "+sourceStatusBoxClass(status)+"'><strong>Атлас — "+esc(sourceStatusLabel(status))+"</strong>"+
      "<p>"+esc(reason ? projectionTextRu(reason) : (errorClass ? "Класс состояния: "+errorClass+"." : "Панель показывает только серверную проекцию и не достраивает каноническое состояние ATLAS по документам или косвенным признакам."))+"</p></div>"+
      "<div class='live-summary'>"+
      "<div class='metric'><small>Проекция чтения Панели</small><strong>Прочитана</strong><span>endpoint ответил в текущем цикле</span></div>"+
      "<div class='metric'><small>Канонический источник состояния</small><strong>"+esc(noStateSource?"Источник сообщает отсутствие":"не определяется Панелью")+"</strong><span>"+esc(errorClass?"формальный код: "+errorClass:"отдельный статус источника не передан")+"</span></div>"+
      "<div class='metric'><small>Текущее состояние</small><strong>"+esc(currentState?humanCode(currentState):"не передано")+"</strong><span>не выводится локально из документов</span></div>"+
      "<div class='metric'><small>Заблокированный этап</small><strong>"+esc(blockedStage?humanCode(blockedStage):"не передан")+"</strong><span>показывается только если источник передал blocked_stage</span></div></div>"+
      (unblock?"<div class='live-item-clean'><div class='live-item-clean-head'><h3>Что разблокирует живое состояние ATLAS</h3></div><p data-atlas-unblock>"+esc(projectionTextRu(unblock))+"</p></div>":"")+
      (unavailableFields?"<div class='live-item-clean'><div class='live-item-clean-head'><h3>Какие поля сейчас сознательно неизвестны</h3><small>буквальный unavailable_fields[] серверной проекции</small></div>"+
        (unavailableFields.length?"<div class='live-kv-grid' data-atlas-unavailable-fields>"+unavailableFields.map(function(f){return kv(projectionFieldRu(f),"недоступно");}).join("")+"</div>":"<p data-atlas-unavailable-fields>Источник явно передал пустой unavailable_fields[].</p>")+"</div>":"")+
      (nextStep?"<div class='live-item-clean'><div class='live-item-clean-head'><h3>Следующий системный шаг</h3></div><p>"+esc(projectionTextRu(nextStep))+"</p></div>":"");
    refreshDirectionInspector("atlas");
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
    function countOrNull(v){if(v==null||v==="")return null;var n=Number(v);return isFinite(n)?n:null;}
    function pairTotal(a,b){a=countOrNull(a);b=countOrNull(b);return a!=null&&b!=null?a+b:null;}
    var observations=pairTotal(control.observations,treatment.observations);
    var confirmed=pairTotal(control.confirmed,treatment.confirmed);
    var regionsKnown=!!(data.scope&&Array.isArray(data.scope.regions)), sectorsKnown=!!(data.scope&&Array.isArray(data.scope.sectors));
    var regions=regionsKnown?data.scope.regions:[], sectors=sectorsKnown?data.scope.sectors:[], review=data.latest_review||{};
    var restarts=[data.last_restart&&data.last_restart.control,data.last_restart&&data.last_restart.treatment].filter(Boolean);
    var restart=restarts.length?restarts.sort(function(a,b){return new Date(b)-new Date(a);})[0]:null;
    var label=function(v){var m={GLOBAL_COMPARATIVE_EXPANSION:"глобальное сравнительное расширение",GLOBAL_UNIVERSE_FREEZE:"заморозка глобальной выборки",REVIEW_READY_NO_PREDECLARED_PASS_FAIL_THRESHOLD:"обзор готов; заранее заданного порога PASS/FAIL нет",IN_PROGRESS:"в работе",PENDING:"ожидает"};return m[String(v||"")]||humanCode(v||"—");};
    var dt=function(v){return v?new Date(v).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—";};
    body.innerHTML =
      "<div class='live-status-box "+(running?"ok":"warn")+"'><strong>ATLAS Signal Lab — "+esc(label(data.phase))+"</strong><p>Это наблюдаемый исследовательский процесс. Он не заполняет поля канонической модели ATLAS и не повышает доказательный статус результатов.</p></div>"+
      "<div class='live-summary atlas-siglab-summary'>"+
      "<div class='metric'><small>Этап</small><strong>"+esc(stage.index!=null&&stage.total!=null?stage.index+" / "+stage.total:"—")+"</strong><span>"+esc(stage.label||label(stage.name))+"</span></div>"+
      "<div class='metric'><small>Наблюдений</small><strong>"+esc(observations==null?"—":observations)+"</strong><span>сумма только если оба потока передали счётчик</span></div>"+
      "<div class='metric'><small>Счётчик confirmed</small><strong>"+esc(confirmed==null?"—":confirmed)+"</strong><span>сумма только если оба потока передали поле; не приравнивается к подтверждённым выводам ATLAS</span></div>"+
      "<div class='metric'><small>Следующий цикл</small><strong>"+esc(dt(data.next_cycle))+"</strong><span>"+esc(label(data.next_gate))+"</span></div></div>"+
      "<div class='live-item-clean atlas-siglab-objective'><div class='live-item-clean-head'><h3>Цель текущего расширения</h3><span class='live-chip "+liveMode(stage.status||"—")+"'>"+esc(stage.status?label(stage.status):"статус этапа не передан")+"</span></div><p>"+esc(data.objective||"Цель не передана источником.")+"</p>"+
      "<div class='live-kv-grid'>"+kv("Охват",regionsKnown?regions.length+" регионов":"—")+kv("Целевая выборка",data.scope&&data.scope.target_systems||"—")+kv("Классы отраслей",sectorsKnown?sectors.length:"—")+kv("Последний перезапуск",dt(restart))+"</div></div>"+
      "<div class='live-item-clean'><div class='live-item-clean-head'><h3>Два живых потока</h3><small>показываются раздельно, чтобы не скрывать различия</small></div><div class='atlas-siglab-streams'>"+
      "<div><small>Контрольный поток</small><b>"+esc(control.observations!=null?control.observations+" наблюдений":"—")+"</b><span>confirmed: "+esc(control.confirmed!=null?control.confirmed:"—")+(control.degraded!=null?" · degraded: "+esc(control.degraded):"")+"</span></div>"+
      "<div><small>Смысловой поток</small><b>"+esc(treatment.observations!=null?treatment.observations+" наблюдений":"—")+"</b><span>confirmed: "+esc(treatment.confirmed!=null?treatment.confirmed:"—")+(treatment.degraded!=null?" · degraded: "+esc(treatment.degraded):"")+"</span></div></div><small>Поля confirmed/degraded показаны как счётчики источника без собственной научной интерпретации Панели.</small></div>"+
      (Object.keys(review).length?"<div class='live-item-clean tone-violet' data-direction-role='research'><div class='live-item-clean-head'><h3>Последний обзор</h3><small>"+esc(label(review.gate_status))+"</small></div><div class='live-kv-grid'>"+kv("Длительность",review.duration_hours!=null?Number(review.duration_hours).toFixed(1)+" ч":"—")+kv("Кандидатов",review.candidate_count_union!=null?review.candidate_count_union:"—")+kv("Строгих расхождений пары",review.strict_pair_divergences!=null?review.strict_pair_divergences:"—")+kv("Файл обзора",review.file||"—")+"</div></div>":"");
    refreshDirectionInspector("atlas");
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
    if (!sourceState.twinState.ok || !data) return cleanFailure("digital-twin","Personal Twin","twinState");
    var status=String(data.source_status||"").toUpperCase();
    if(status==="OFFLINE"||status==="UNAVAILABLE"){
      var failBody=activateNormalized("digital-twin",status,"TWIN G1 · "+esc(status)); if(!failBody)return;
      failBody.innerHTML="<div class='live-status-box warn'><strong>Personal Twin G1 — "+esc(status)+"</strong><p>"+esc(data.degraded_reason||"G1 не подтвердил текущее состояние; старое состояние не подставляется.")+"</p></div>";
      return;
    }
    var body=activateNormalized("digital-twin",status,"TWIN G1 · "+esc(status));
    if(!body)return;

    var runtime=data.runtime||{}, experiment=data.experiment||{}, prediction=data.prediction||{}, obs=data.observability||{}, counts=data.counts||{};
    var clones=Array.isArray(data.clones)?data.clones:[], history=Array.isArray(data.history)?data.history:[], learning=Array.isArray(data.learning_history)?data.learning_history:[], pending=Array.isArray(data.pending_confirmations)?data.pending_confirmations:[];
    var gate=experiment.gatekeeper||{}, prospectiveN=Number(experiment.prospective_n||data.prospective_scored_n||0), predStatus=prediction.status||data.current_prediction||null;
    var predLabel=predStatus==null?"статус прогноза не передан":(TWIN_PREDICTION_LABELS[predStatus]||"безопасная метка не определена");
    var mode=String(runtime.mode||data.mode||"").toUpperCase(), modeLabel=mode==="WARM_START"?"Наблюдает, ждёт первые решения":(mode==="LEARNING"?"Обучается на реальных решениях":humanCode(mode||"—"));
    var runtimeHealth=runtime.health||data.runtime_health||"—", runtimeVersion=runtime.version||"—", generation=runtime.generation||data.generation||"—";
    function shortHash(v){v=String(v||"");return v?v.slice(0,12)+"…":"—";}
    function shortId(v){v=String(v||"");return v.length>22?v.slice(0,22)+"…":(v||"—");}
    function sensorState(ts){
      if(!ts)return {label:"не передано",cls:"unknown",age:null};
      var d=new Date(ts); if(isNaN(d))return {label:"не передано",cls:"unknown",age:null};
      var sec=Math.max(0,Math.round((Date.now()-d.getTime())/1000));
      return sec<60?{label:"LIVE",cls:"ok",age:sec}:{label:sec<=180?"DELAYED":"STALE",cls:sec<=180?"warn":"bad",age:sec};
    }
    function cloneRole(role){
      var m={EXACT_CONTROL:"Точный контроль",LONG_HISTORY:"Длинная история / медленное обновление",FAST_ADAPTATION:"Быстрая адаптация",CONTEXT_X_HISTORY:"Контекст × история",SWITCH_COMPLETION:"Переключение / завершение"};
      return m[role]||humanCode(role||"—");
    }
    function cloneState(c){
      if(!prospectiveN&&!Number(c.updates||0))return "Ждёт первое обучение";
      return Number(c.updates||0)>0?"Изменился после последнего решения":"Без обновления после последнего решения";
    }
    var sealAge=prediction.sealed_at?ago(prediction.sealed_at):"—";
    var realCandidates=obs.real_candidate_count, candidateCount=obs.candidate_count;
    var exactOK=obs.exact_controls_ok;
    var sensors=[
      ["Continuity",obs.continuity_last_seen_at],
      ["Founder Decision",obs.founder_decision_last_seen_at],
      ["Observer UI",obs.observer_action_last_seen_at]
    ];
    var sensorRows=sensors.map(function(x){var st=sensorState(x[1]);return "<div class='twin-sensor "+st.cls+"'><span><b>"+esc(x[0])+"</b><small>"+esc(x[1]?ago(x[1]):"нет метки")+"</small></span><em>"+esc(st.label)+"</em></div>";}).join("");
    var anyStale=sensors.some(function(x){return sensorState(x[1]).cls==="bad";});
    var anyDelayed=sensors.some(function(x){return sensorState(x[1]).cls==="warn";});
    var incidents=Number(counts.incidents||0), confirmations=Number(counts.pending_confirmations!=null?counts.pending_confirmations:pending.length||data.needs_confirmation||0);
    var red=String(runtimeHealth).toUpperCase()!=="OK"||predStatus==="NO_LIVE_SEAL"||predStatus==="ABSTAIN_CONTAMINATED"||exactOK===false||incidents>0||String(gate.status||"").toUpperCase()==="FAIL"||anyStale;
    var amber=!red&&(confirmations>0||anyDelayed||(prospectiveN>0&&!gate.status));
    var alertHTML=red?"<div class='twin-alert bad'><b>Требуется внимание к эксперименту</b><span>Один или несколько safety/runtime критериев G1 сейчас не проходят.</span></div>":(amber?"<div class='twin-alert warn'><b>Эксперимент работает с предупреждением</b><span>Есть delayed channel, pending confirmation или ожидаемый gatekeeper report.</span></div>":"");

    var phaseScore=Number(counts.scores||0)>0, phaseLearning=Number(counts.model_updates||0)>0;
    var phases=[
      ["НАБЛЮДАЕТ",true],
      ["ПРОГНОЗ ЗАПЕЧАТАН",predStatus==="SEALED"],
      ["РЕАЛЬНОЕ ДЕЙСТВИЕ",prospectiveN>0||Number(counts.outcomes||0)>0],
      ["SCORE",phaseScore],
      ["ОБУЧЕНИЕ",phaseLearning],
      ["НОВЫЙ ПРОГНОЗ",prospectiveN>0&&predStatus==="SEALED"]
    ];
    var processHTML=phases.map(function(x,i){return "<div class='twin-phase "+(x[1]?"active":"pending")+"'><span>"+(i+1)+"</span><b>"+esc(x[0])+"</b></div>";}).join("<i>→</i>");

    var cloneHTML=clones.length?clones.map(function(c){
      var exact=/^C[0-3]$/.test(String(c.id||""));
      var grad=c.last_gradient_norm;
      return "<article class='twin-clone "+(exact?"exact":"")+"'><header><b>"+esc(c.id||"—")+"</b><span>"+esc(cloneRole(c.role))+"</span></header><strong>"+esc(cloneState(c))+"</strong><div><small>Обновления</small><b>"+esc(c.updates==null?"—":c.updates)+"</b><small>N</small><b>"+esc(c.prospective_n==null?prospectiveN:c.prospective_n)+"</b></div>"+
        (exact?"<em class='"+(exactOK===true?"ok":exactOK===false?"bad":"unknown")+"'>Точные контрольные клоны: "+esc(exactOK===true?"PASS":exactOK===false?"FAIL":"—")+"</em>":"")+
        (Number(c.updates||0)>0?"<footer><span>последнее обновление: "+esc(c.last_update_at?ago(c.last_update_at):"—")+"</span><span>скорость обучения: "+esc(c.learning_rate==null?"—":c.learning_rate)+"</span><span>норма градиента: "+esc(grad==null?"—":grad)+" · величина обновления, не качество</span></footer>":"")+"</article>";
    }).join(""):"<div class='cc-empty'>Клоны не переданы безопасной проекцией.</div>";

    var historyHTML="";
    if(!history.length){
      historyHTML="<div class='twin-history-empty'><b>Ещё не было реального проспективного решения</b><span>N = "+esc(prospectiveN)+". До фактического исхода история обучения и раскрытые результаты прогноза отсутствуют.</span></div>";
    }else{
      historyHTML=history.slice(0,12).map(function(h){
        var updates=learning.filter(function(x){return x.outcome_id&&x.outcome_id===h.outcome_id;});
        return "<details class='twin-history-item'><summary><time>"+esc(h.occurred_at?dateShort(h.occurred_at):"—")+"</time><b>"+esc(h.object_id||"outcome")+"</b><span>"+esc(h.resolution_status||"—")+"</span></summary><div class='live-kv-grid'>"+kv("Outcome",h.outcome_id||"—")+kv("Eligible seal",shortId(h.eligible_seal_id))+kv("Commitment",shortHash(h.commitment_sha256))+kv("Confidence",h.confidence==null?"—":h.confidence)+kv("Model updates",updates.length+" / 8")+kv("Gatekeeper",gate.status||"—")+"</div></details>";
      }).join("");
    }

    var gateStatus=gate.status||"не передан";
    var gateClass=/PASS/i.test(gateStatus)?"ok":(/FAIL/i.test(gateStatus)?"bad":"wait");
    var milestoneN=[0,10,30,60];
    var milestoneHTML=milestoneN.map(function(n){var reached=prospectiveN>=n;var label=n===10?"Проверка стабильности инструмента":n===30?"Первый predictive gate":n===60?"Усиленный longitudinal gate":"Старт проспективного наблюдения";return "<div class='twin-milestone "+(reached?"reached":"")+"'><b>N="+n+"</b><span>"+esc(label)+"</span></div>";}).join("");

    body.innerHTML=
      alertHTML+
      "<section class='twin-now direction-selectable' data-direction-role='canonical' data-direction-title='Personal Twin — G1' data-direction-summary='"+attr("Среда выполнения "+runtimeHealth+" · "+generation+" · N="+prospectiveN+" · "+predLabel)+"'><header><div><small>МОЙ ДВОЙНИК СЕЙЧАС</small><h2>Personal Twin — G1</h2></div><div class='twin-now-badges'><span>"+esc(generation)+"</span><span>"+esc(runtimeVersion)+"</span><span>N = "+esc(prospectiveN)+"</span></div></header>"+
      "<div class='twin-now-grid'><div><small>Среда выполнения</small><b>"+esc(runtimeHealth)+"</b></div><div><small>Режим</small><b>"+esc(modeLabel)+"</b></div><div><small>Текущий прогноз</small><b>"+esc(predLabel)+"</b></div><div><small>Возраст seal</small><b>"+esc(sealAge)+"</b></div><div><small>Реальных решений</small><b>"+esc(prospectiveN)+"</b></div><div><small>Варианты</small><b>"+esc(realCandidates==null?"—":realCandidates+" реальных + OTHER")+"</b></div><div><small>Точные контрольные клоны</small><b>"+esc(exactOK===true?"PASS":exactOK===false?"FAIL":"—")+"</b></div><div><small>Incidents</small><b>"+esc(incidents)+"</b></div></div>"+
      "<div class='twin-seal-line'><span>Active seal: <b>"+esc(shortId(gate.active_seal_id))+"</b></span><span>Commitment: <b>"+esc(shortHash(prediction.commitment||data.current_commitment))+"</b></span><span>детали прогноза: <b>СКРЫТЫ ДО OUTCOME</b></span></div></section>"+
      "<section class='twin-process direction-selectable' data-direction-role='projection' data-direction-title='Цикл G1'><h3>Как идёт эксперимент</h3><div class='twin-process-row'>"+processHTML+"</div></section>"+
      "<section class='twin-clones-wrap'><div class='live-item-clean-head'><h3>Восемь клонов C0–C7</h3>"+chip(clones.length+" / 8")+"</div><div class='twin-clone-grid'>"+cloneHTML+"</div></section>"+
      "<details class='twin-learning'><summary><b>Что происходило с малышами</b><span>"+esc(history.length?history.length+" завершённых эпизодов":"первый фактический исход ещё не случился")+"</span></summary><div>"+historyHTML+"</div></details>"+
      "<section class='twin-science-grid'><article class='twin-science'><header><small>SCIENTIFIC GATE</small><b class='"+gateClass+"'>"+esc(gateStatus)+"</b></header><p>Следующий gate: "+esc(prospectiveN<1?"G1_FIRST_REAL_OUTCOME_E2E":prospectiveN<10?"N10":prospectiveN<30?"N30":"N60")+". Gatekeeper проверяется независимо от UI.</p><div class='twin-milestones'>"+milestoneHTML+"</div></article>"+
      "<article class='twin-science'><header><small>ЧТО СИСТЕМА СЕЙЧАС ВИДИТ</small><b>"+esc(realCandidates==null?"—":realCandidates+" реальных вариантов")+"</b></header><div class='twin-sensors'>"+sensorRows+"</div><div class='live-kv-grid'>"+kv("Всего candidate classes",candidateCount==null?"—":candidateCount)+kv("Exact controls",exactOK===true?"PASS":exactOK===false?"FAIL":"—")+kv("Incidents",incidents)+kv("Pending confirmation",confirmations)+"</div></article></section>"+
      (confirmations>0?"<section class='twin-pending'><b>Нужно подтвердить исход: "+esc(confirmations)+"</b><span>v1.0 только показывает ambiguous outcome. Автоподтверждения нет.</span></section>":"")+
      "<div class='twin-safety-boundary'><b>Граница безопасности:</b> активный predicted object, вероятности, ranking, top‑1, объясняющие факторы и hidden payload не передаются Founder Panel до outcome. "+esc(data.safety_note||"")+"</div>"+
      renderLatestBranchActivity(data.latest_branch_activity,"digital-twin");
    refreshDirectionInspector("digital-twin");
  }

  function HumanFoundationStatus(value) {
    var s = String(value || "").toUpperCase();
    if (!s) return "не передано";
    if (s === "DEGRADED") return "источник сообщает DEGRADED";
    if (s === "READY") return "источник сообщает READY";
    if (s === "OK") return "источник сообщает OK";
    if (s === "UNAVAILABLE") return "источник сообщает UNAVAILABLE";
    return humanCode(value);
  }

  function renderAgentNetwork(projection, lineage) {
    var page = document.querySelector('[data-page-panel="agents"]');
    if (!page) return;
    var stamp = page.querySelector('[data-agent-stamp]');
    function setKpi(k,v,note){var e=page.querySelector('[data-a="'+k+'"]');if(e)e.textContent=String(v);var n=page.querySelector('[data-a-note="'+k+'"]');if(n)n.textContent=note||"";}
    var stateBox=page.querySelector('[data-agent-state]');
    var listBox=page.querySelector('[data-agent-list]');
    var authBox=page.querySelector('[data-agent-authority]');
    var linBox=page.querySelector('[data-agent-lineage]');
    var alertBox=page.querySelector('[data-agent-alerts]');
    if (!sourceState.agentProjection.ok || !projection) {
      if(stamp)stamp.innerHTML="<span class='cc-pulse'></span><span>Agent Registry недоступен</span>";
      ["total","active","gaps","revisions"].forEach(function(k){setKpi(k,"Недоступно","текущее чтение не подтверждено");});
      if(stateBox)stateBox.innerHTML=unavailableHTML("Agent Registry недоступен","Панель не восстанавливает сеть из systemd, процессов или прошлых данных.");
      if(listBox)listBox.innerHTML=unavailableHTML("Реестр агентов недоступен","Нет подтверждённой Founder projection.");
      if(authBox)authBox.innerHTML=unavailableHTML("Полномочия недоступны","authority_scope не восстанавливается из поведения.");
      if(linBox)linBox.innerHTML=unavailableHTML("Lineage недоступен","Связи происхождения не выводятся без verified source.");
      if(alertBox)alertBox.innerHTML="<span>Системные разрывы не проверены</span>";
      return;
    }
    var agentsKnown=Array.isArray(projection.agents), agents=agentsKnown?projection.agents:[];
    var counts=projection.counts&&typeof projection.counts==="object"?projection.counts:{};
    var rr=projection.registry_revision, lr=projection.lineage_revision;
    if(stamp)stamp.innerHTML="<span class='cc-pulse'></span><span>"+esc(projection.source_status||"SOURCE")+" · Registry r"+esc(rr==null?"—":rr)+" · Lineage r"+esc(lr==null?"—":lr)+"</span>";
    var timerAgents=agentsKnown?agents.filter(function(a){return /^TIMER[-_]DRIVEN$/i.test(String(a.state||""));}).length:null;
    var gapFields=["authority_conflicts","unregistered_agents","decisions_without_evidence","lineage_gaps","stalled_agents","degraded_agents"];
    var gapCountsKnown=gapFields.every(function(k){return counts[k]!=null;});
    var gapTotal=gapCountsKnown?gapFields.reduce(function(n,k){return n+Number(counts[k]||0);},0):null;
    var lineageKnown=!!(sourceState.agentLineage.ok&&lineage&&Array.isArray(lineage.edges));
    var lineageEdges=lineageKnown?lineage.edges:[];
    var verifiedEdges=lineageKnown?lineageEdges.filter(function(e){return String(e.verification_state||"").toUpperCase()==="VERIFIED";}):[];
    setKpi("total",counts.total_agents!=null?counts.total_agents:(agentsKnown?"≥ "+agents.length:"—"),counts.total_agents!=null?"зарегистрировано источником":"нижняя граница по agents[]");
    setKpi("active",counts.active_agents!=null?(counts.active_agents+(timerAgents?" + "+timerAgents:"")):"—",(counts.active_agents!=null?"ACTIVE "+counts.active_agents:"ACTIVE не передан")+(timerAgents!=null?" · по таймеру "+timerAgents:"")+" · это реестровые lifecycle-состояния, не одновременное исполнение");
    setKpi("revisions",lineageKnown?verifiedEdges.length+" / "+lineageEdges.length:"—",lineageKnown?"подтверждённых связей / всего · Lineage r"+(lr==null?"—":lr):"Lineage не подтверждён");
    setKpi("gaps",gapTotal==null?"—":gapTotal,gapTotal==null?"счётчики разрывов переданы не полностью":"сумма явных конфликтов, пробелов и деградаций");
    var verifiedAgents=agentsKnown?agents.filter(function(a){return String(a.evidence_status||"").toUpperCase()==="VERIFIED";}).length:null;
    if(stateBox)stateBox.innerHTML="<div class='agent-contract-list'>"+
      "<div><b>Статус источника</b><span>"+esc(projection.source_status||"не передан")+"</span></div>"+
      "<div><b>Ревизии</b><span>реестр r"+esc(rr==null?"—":rr)+" · происхождение r"+esc(lr==null?"—":lr)+"</span></div>"+
      "<div><b>Доказательства идентичности</b><span>"+esc(verifiedAgents==null?"—":verifiedAgents+" / "+agents.length+" агентов VERIFIED")+"</span></div>"+
      "<div><b>Штатные реестровые состояния</b><span>"+esc(counts.active_agents==null?"ACTIVE не передан":counts.active_agents+" ACTIVE")+(timerAgents!=null?" · "+esc(timerAgents)+" по таймеру":"")+" · не означает одновременное исполнение</span></div>"+
      "<div><b>Деградировано / зависло / вне реестра</b><span>"+esc(counts.degraded_agents==null?"—":counts.degraded_agents)+" / "+esc(counts.stalled_agents==null?"—":counts.stalled_agents)+" / "+esc(counts.unregistered_agents==null?"—":counts.unregistered_agents)+"</span></div>"+
      "<div><b>Граница Lineage</b><span>Пустые parent_agent_id / lineage_id в карточке агента сами по себе не считаются разрывом; канонические связи читаются из отдельного графа происхождения.</span></div></div>";
    if(listBox){
      if(!agentsKnown)listBox.innerHTML=unavailableHTML("agents[] не передан","Источник ответил, но коллекция агентов не подтверждена.");
      else listBox.innerHTML=agents.length?"<div class='agent-contract-summary'><b>"+esc(agents.length)+" агентов в текущей ревизии</b><span>"+esc(verifiedAgents)+" с подтверждённым evidence_status=VERIFIED · "+esc(timerAgents)+" работают по таймеру</span></div>"+agents.map(function(a){
        var st=String(a.state||"");
        var stRu=/^ACTIVE$/i.test(st)?"активен":(/^TIMER[-_]DRIVEN$/i.test(st)?"запускается по таймеру":humanCode(st||"состояние не передано"));
        var ev=String(a.evidence_status||"").toUpperCase()==="VERIFIED"?"доказательства подтверждены":("доказательства: "+humanCode(a.evidence_status||"не передано"));
        return "<div><b>"+esc(a.agent_id||"не передан")+"</b><span>"+esc(humanCode(a.role||"роль не передана"))+" · "+esc(stRu)+" · "+esc(ev)+"</span></div>";
      }).join(""):"<div><b>Реестр пуст</b><span>Источник явно передал пустой agents[].</span></div>";
    }
    if(authBox){
      if(!agentsKnown)authBox.innerHTML=unavailableHTML("authority_scope не проверен","agents[] не передан.");
      else {
        var aa=agents.filter(function(a){return Array.isArray(a.authority_scope)&&a.authority_scope.length;});
        authBox.innerHTML="<div class='agent-contract-summary'><b>"+esc(aa.length)+" / "+esc(agents.length)+" агентов имеют явную область полномочий</b><span>конфликтов полномочий: "+esc(counts.authority_conflicts==null?"—":counts.authority_conflicts)+" · области ниже показаны буквально из authority_scope[]</span></div><div class='agent-contract-list'>"+(aa.length?aa.map(function(a){return "<div><b>"+esc(a.agent_id||"агент")+"</b><span>"+a.authority_scope.map(esc).join(" · ")+"</span></div>";}).join(""):"<div><b>Явные полномочия не переданы</b><span>Панель не восстанавливает их из поведения.</span></div>")+"</div>";
      }
    }
    if(linBox){
      if(!sourceState.agentLineage.ok || !lineage)linBox.innerHTML=unavailableHTML("Lineage временно недоступен","Agent Registry остаётся видимым; связи не реконструируются.");
      else if(!Array.isArray(lineage.edges))linBox.innerHTML=unavailableHTML("edges[] не передан","Источник происхождения ответил без коллекции рёбер.");
      else {
        var unverifiedEdges=lineageEdges.filter(function(e){return String(e.verification_state||"").toUpperCase()!=="VERIFIED";});
        var verifiedHtml=verifiedEdges.length?verifiedEdges.map(function(e){return "<div><b>"+esc(e.source_id||"—")+" → "+esc(e.target_id||"—")+"</b><span>"+esc(humanCode(e.relation||"отношение не передано"))+" · связь подтверждена · ревизия "+esc(e.edge_revision==null?"—":e.edge_revision)+"</span></div>";}).join(""):"<div><b>Подтверждённых рёбер нет</b><span>Пустая коллекция не заменяется предположениями.</span></div>";
        var unresolvedHtml=unverifiedEdges.length?"<div class='agent-lineage-unverified'><b>Неподтверждённые связи: "+esc(unverifiedEdges.length)+"</b>"+unverifiedEdges.map(function(e){return "<span>"+esc(e.source_id||"—")+" → "+esc(e.target_id||"—")+" · "+esc(humanCode(e.verification_state||"состояние проверки не передано"))+"</span>";}).join("")+"</div>":"";
        linBox.innerHTML="<div class='agent-contract-summary'><b>"+esc(verifiedEdges.length)+" / "+esc(lineageEdges.length)+" связей подтверждены</b><span>Lineage r"+esc(lr==null?"—":lr)+" · неподтверждённых "+esc(unverifiedEdges.length)+"</span></div><div class='agent-contract-list'>"+verifiedHtml+"</div>"+unresolvedHtml;
      }
    }
    if(alertBox){
      var alerts=[];
      function add(v,label){if(v!=null&&Number(v)>0)alerts.push("<span>"+esc(label)+": "+esc(v)+"</span>");}
      add(counts.authority_conflicts,"конфликты полномочий"); add(counts.unregistered_agents,"агенты вне реестра"); add(counts.decisions_without_evidence,"решения без доказательств"); add(counts.lineage_gaps,"разрывы происхождения"); add(counts.stalled_agents,"зависшие агенты"); add(counts.degraded_agents,"деградированные агенты");
      alertBox.innerHTML=alerts.length?alerts.join(""):"<span>По переданным счётчикам системных разрывов не заявлено</span>";
    }
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
      var dimensionsKnownDiag = Array.isArray(f.dimensions);
      var dims = dimensionsKnownDiag ? f.dimensions : [];
      var mandatoryKnownDiag = dimensionsKnownDiag && dims.length > 0 && dims.every(function (d) { return d && typeof d.mandatory === "boolean"; });
      var passDimsDiag = mandatoryKnownDiag ? dims.filter(function (d) { return d.mandatory === true; }) : dims;
      var passN = passDimsDiag.filter(function (d) { return String(d && d.state || "").toUpperCase() === "PASS"; }).length;
      var dur = dims.filter(function (d) { return d && d.dimension === "artifact_durability_readback"; })[0] || {};
      var dd = dur.detail || {};
      var scanAvailable = !!(sourceState.scannerDiagnostics.ok && scannerDiagnostics);
      var scan = scanAvailable ? scannerDiagnostics : {};
      var cov = scan.source_coverage || {};
      function diagNumOrNull(v){if(v==null||v==="")return null;var n=Number(v);return isFinite(n)?n:null;}
      var scanTotal = diagNumOrNull(cov.total_sources);
      var scanOk = diagNumOrNull(cov.ok_count);
      var scanFailingKnown = Array.isArray(cov.failing);
      var scanFail = scanFailingKnown ? cov.failing.length : null;
      var scanUnknown = scanFailingKnown ? cov.failing.filter(function (x) { return x && !x.known_degraded; }).length : null;
      var hub = hubHealth || {};
      var readTone = failed ? "warn" : "ok";
      var foundationStatus = String(f.source_status || "").toUpperCase();
      var foundationTone = foundationStatus === "READY" ? "ok" : (foundationStatus === "DEGRADED" ? "warn" : "neutral");
      var durabilityTone = String(dur.state || "").toUpperCase() === "PASS" ? "ok" : (String(dur.state || "").toUpperCase() === "FAIL" ? "bad" : "neutral");
      var scannerTone = !scanAvailable ? "warn" : (scanTotal != null && scanOk != null && scanTotal > 0 && scanOk === scanTotal ? "ok" : (scanFail != null && scanFail > 0 ? (scanUnknown === 0 ? "warn" : "bad") : "neutral"));
      trust.innerHTML =
        "<div class='diag-boundary-intro'><div><small>НЕ ЕДИНЫЙ РЕЙТИНГ, А ГРАНИЦЫ ДОКАЗАННОГО</small><b>Доступность интерфейса ≠ здоровье всех источников мира</b><span>Каждое измерение сохраняет собственный источник и область действия.</span></div></div>" +
        "<div class='diag-boundary-grid'>" +
          "<div class='" + readTone + "'><small>Чтение панели</small><b>" + esc(ok + " / " + keys.length) + "</b><span>проекций ответили · ошибок чтения " + esc(failed) + "</span><em>влияет на доступность экранов</em></div>" +
          "<div class='" + foundationTone + "'><small>Системное основание</small><b>" + esc(passDimsDiag.length ? passN + " / " + passDimsDiag.length : "—") + "</b><span>" + esc(!dimensionsKnownDiag ? "dimensions[] не передан" : (mandatoryKnownDiag ? "обязательных измерений пройдено" : "PASS среди переданных dimensions; mandatory не полностью указан")) + " · состояние: " + esc(HumanFoundationStatus(f.source_status)) + "</span><em>влияет на утверждение «основание готово»</em></div>" +
          "<div class='" + durabilityTone + "'><small>Долговечность артефактов</small><b>" + esc(dd.objects_on_disk != null ? dd.objects_on_disk + " объектов на диске" : "—") + "</b><span>хэши: " + esc(dd.hash_mismatches == null ? "—" : dd.hash_mismatches) + " расхождений · потеряно: " + esc(dd.artifacts_missing == null ? "—" : dd.artifacts_missing) + " · осиротевших расписок: " + esc(dd.orphan_receipts == null ? "—" : dd.orphan_receipts) + "</span><em>наличие на диске не равно доказанному полному обратному чтению</em></div>" +
          "<div class='" + scannerTone + "'><small>Внешнее рыночное покрытие</small><b>" + esc(scanAvailable && scanTotal != null && scanOk != null ? scanOk + " / " + scanTotal : "—") + "</b><span>" + esc(!scanAvailable ? "диагностика Scanner недоступна" : ("источников отвечают · отказов " + (scanFail == null ? "—" : scanFail) + " · ещё не объяснено " + (scanUnknown == null ? "—" : scanUnknown))) + "</span><em>ограничивает внешние рыночные сигналы, а не внутреннее состояние компании</em></div>" +
        "</div>" +
        "<div class='diag-boundary-freshness'><b>Свежесть не сводится к одному таймеру.</b><span>Фундамент: " + esc(f.freshness_state ? humanCode(f.freshness_state) : "контракт не прочитан") + " · Market Scanner: " + esc(scan.scanner && scan.scanner.freshness_state ? humanCode(scan.scanner.freshness_state) : "контракт не прочитан") + ". Остальные источники не объявляются свежими только потому, что HTTP-чтение успешно.</span></div>" +
        "<div class='diag-boundary-rule'>Панель может одновременно иметь " + esc(ok + "/" + keys.length) + " успешных чтений и показывать деградацию отдельного вышестоящего контура. Это не противоречие: первое описывает доступность проекций, второе — состояние данных за ними.</div>";
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
      radar: ["radar"],
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

    var sourceNames = {
      routes:"Маршруты Оркестратора", summary:"Сводка Оркестратора", metrics:"Метрики Оркестратора",
      inbox:"Входящие Основателя", objects:"Объекты Continuity", blockers:"Блокеры Continuity",
      testingSummary:"Сводка Testing", testingHealth:"Состояние Testing", testingRunner:"Исполнитель Testing",
      hubHealth:"ICAM Hub", continuityHealth:"Continuity", researchRD1:"Исследовательские RD1-проекции",
      opsProjection:"Операции", brazilPortal:"BrazilPortal", foundationAgg:"Фундамент", atlasState:"ATLAS",
      twinState:"Digital Twin", marketSignals:"Market Scanner · сигналы", fieldMovement:"Движение поля",
      scannerDiagnostics:"Диагностика Scanner", founderProjection:"Founder Projection",
      organizationalIntelligence:"Организационные наблюдения", stewardReconciliation:"Системная сверка",
      signalLabStatus:"ATLAS Signal Lab", agentProjection:"Agent Registry", agentLineage:"Agent Lineage", temporalUniverse:"Temporal Universe", portfolioAdmission:"Portfolio Admission",
      radar:"Founder Radar"
    };
    function sourceName(k){return sourceNames[k]||humanCode(k);}
    function readClock(v){return v ? new Date(v).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "—";}
    var cycleErrors = page.querySelector("[data-x-cycle-errors]");
    if (cycleErrors) {
      var issueKeys = keys.filter(function(k){var s=sourceState[k]||{};return !s.ok || !!s.error;});
      cycleErrors.innerHTML = issueKeys.length ? issueKeys.map(function(k){var s=sourceState[k]||{};return "<div class='runtime-kv'><span><b>"+esc(sourceName(k))+"</b><small>"+esc(s.ok?"частичное чтение":"чтение недоступно")+"</small></span><b>"+esc(s.error||"ответ не подтверждён")+" · "+esc(readClock(s.at))+"</b></div>";}).join("")+
        "<p class='diagnostics-note'>Это ошибки и неполнота только текущего цикла чтения панели. Исторический журнал отказов здесь не реконструируется.</p>" :
        "<div class='diagnostics-empty compact'><strong>Ошибок чтения в текущем цикле нет</strong><span>Все известные проекции ответили. Это подтверждает доступность чтения, но не означает, что каждая из них сообщает здоровое или свежее состояние.</span></div>";
    }
    var readTimes = page.querySelector("[data-x-read-times]");
    if (readTimes) {
      var timedKeys = keys.filter(function(k){return !!(sourceState[k]&&sourceState[k].at);}).sort(function(a,b){return String(sourceState[b].at||"").localeCompare(String(sourceState[a].at||""));});
      readTimes.innerHTML = timedKeys.length ? timedKeys.map(function(k){var s=sourceState[k]||{};return "<div class='runtime-kv'><span>"+esc(sourceName(k))+"</span><b>"+esc(readClock(s.at))+" · "+esc(s.ok?"ответ получен":(s.error?"ошибка чтения":"ответ не подтверждён"))+"</b></div>";}).join("")+
        "<p class='diagnostics-note'>Время выше — момент чтения браузером. Семантическая свежесть определяется собственным контрактом источника и показывается отдельно там, где источник её передаёт.</p>" :
        "<div class='diagnostics-empty compact'><strong>Нет меток чтения</strong><span>Панель ещё не получила ни одного результата текущего цикла.</span></div>";
    }

    pageBadge("diagnostics", failed ? (ok ? "warn" : "unavailable") : "live", failed ? (ok ? "ПРОЕКЦИИ ЧТЕНИЯ ЧАСТИЧНО" : "ПРОЕКЦИИ ЧТЕНИЯ НЕДОСТУПНЫ") : "ПРОЕКЦИИ ЧТЕНИЯ ДОСТУПНЫ");
  }



  function renderCommercial(data) {
    var page=document.querySelector('[data-page-panel="commercial"]'); if(!page)return;
    function box(name){return page.querySelector('[data-commercial="'+name+'"]');}
    function safe(v){return esc(v==null?"":v);} function n(v){return Number(v||0);}
    function ruStage(v){var m={DISCOVERY:"поиск",SCREENING:"отсев",RESEARCH:"исследование",HOLD:"удержание",READY:"готово",FOUNDER:"требует Нику",WAITING:"ожидание",WATCH:"наблюдение",SUBMITTED:"подано",REPLIED:"ответ",CONVERSATION:"разговор",PROPOSAL:"КП / предложение",PAID:"оплачено",CLOSED:"закрыто",OTHER:"прочее"};return m[v]||v||"—";}
    function productClass(p){return (p&&p.color_key)||"teal";}
    function stagePriority(s){var m={FOUNDER:1,REPLIED:2,CONVERSATION:3,PROPOSAL:4,SUBMITTED:5,READY:6,WAITING:7,WATCH:8,RESEARCH:9,SCREENING:10,DISCOVERY:11,HOLD:12,CLOSED:20,OTHER:21};return m[s]||50;}
    function dateShort(v){if(!v)return "";var d=new Date(v);return isNaN(d)?String(v).slice(0,10):d.toLocaleDateString("ru-RU",{day:"2-digit",month:"short"});}
    function itemDates(x){var a=[];if(x.sent_at)a.push('<span class="sent">отправлено '+safe(dateShort(x.sent_at))+'</span>');if(x.followup_due_at)a.push('<span class="due">следующий контакт '+safe(dateShort(x.followup_due_at))+'</span>');if(!x.sent_at&&x.updated_at)a.push('<span>обновлено '+safe(dateShort(x.updated_at))+'</span>');if(x.deadline)a.push('<span class="due">срок '+safe(dateShort(x.deadline))+'</span>');return a.length?'<div class="com-item-date">'+a.join("")+'</div>':"";}
    function productGoal(p){var m={procurement:"Вход через закупки, предварительные рыночные консультации, поставщиков, профильных партнёров и сопровождение после присуждения.","agent-governance":"Архитектурный сигнал → адресный вход → ограниченная реконструкция → платный обзор → аудит при достаточных доказательствах исполнения.","structural-audit":"Аномалия → доказательства → реконструкция → критическая проверка → сильный сигнал → контакт → оплаченный структурный аудит."};return m[p&&p.id]||p&&p.goal||"";}
    function nextRu(v){if(!v)return "";var s=String(v);if(/[А-Яа-яЁё]/.test(s))return s;var m={WAIT_EVALUATION:"ждём оценку",WAIT_FUTURE_ITT:"ждём следующую закупочную процедуру",FOLLOW_UP_DUE:"пора повторно связаться",VERIFY_SENT:"проверить, была ли отправка",VERIFY_SENT_OR_SEND_ONCE:"проверить прошлую отправку; если её не было — отправить один раз",WAIT_REPLY_AND_AWARD:"ждём ответ и решение по присуждению",WAITING:"ждём внешний ход",WAIT_ROUTING:"ждём маршрутизацию",SEND_ONCE_THEN_REVIEW:"отправить один раз и затем пересмотреть",AFTER_EXTERNAL_REVENUE:"вернуться после появления внешней выручки",NONE:"следующий ход не назначен",NEW_EVIDENCE_ONLY:"только при появлении нового доказательства",NEW_SIGNAL_ONLY:"только при новом сигнале",NEW_CLASS_ONLY:"только при новом классе сигнала",FIX_DENOMINATOR_OR_NEW_EVIDENCE:"вернуться после исправления базы сравнения или нового доказательства",MISSING_BRIDGE:"не хватает подтверждённого перехода"};return m[s]||"следующий ход требует расшифровки источника";}
    function provenance(x){var dated=!!(x.sent_at||x.updated_at||x.followup_due_at||x.deadline);if(x._source_kind==="live_runtime"&&dated)return {cls:"live",label:"живое состояние · дата подтверждена"};if(x._source_kind==="handoff_seed"&&!dated)return {cls:"imported",label:"импорт · дата события не передана"};if(x._source_kind==="handoff_seed"&&dated)return {cls:"imported",label:"импорт · дата передана"};return {cls:"unknown",label:"происхождение состояния не указано"};}
    function provenanceHTML(x){var p=provenance(x);return '<div class="com-provenance '+p.cls+'">'+safe(p.label)+'</div>';}
    function evidenceRank(x){var p=provenance(x);return p.cls==="live"?0:(p.cls==="imported"?2:1);}
    if(!sourceState.commercialDashboard.ok||!data){
      ["hero","manual","automatic","feedback","proposals","stages","queue","waiting-live","sourcebar"].forEach(function(k){var el=box(k);if(el)el.innerHTML=unavailableHTML("Коммерческий контур недоступен","Проекция чтения не отвечает; прошлое состояние не используется как текущее.");});
      var ps=box("products");if(ps)ps.innerHTML=unavailableHTML("Продукты недоступны","Проекция чтения не отвечает.");
      pageBadge("commercial","unavailable","КОММЕРЧЕСКИЙ КОНТУР НЕДОСТУПЕН");
      refreshDirectionInspector("commercial");
      return;
    }
    var t=data.totals||{}, products=Array.isArray(data.products)?data.products:[], manual=Array.isArray(data.manual_queue)?data.manual_queue:[];
    var generated=data.generated_at?new Date(data.generated_at):null;
    var ageMin=generated&&!isNaN(generated)?Math.max(0,Math.round((Date.now()-generated.getTime())/60000)):null;
    var generatedRu=generated&&!isNaN(generated)?generated.toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"дата не передана";
    pageBadge("commercial","live","КОММЕРЧЕСКИЙ КОНТУР · ДАННЫЕ ПОДКЛЮЧЕНЫ");
    var sourcebar=box("sourcebar");
    if(sourcebar)sourcebar.innerHTML='<div class="commercial-source-item"><small>Происхождение записей</small><b>'+n(t.live_dated)+' живых / '+n(t.imported_undated)+' импортированных</b><span>импортированные записи не считаются датированными текущими событиями</span></div>'+
      '<div class="commercial-source-item"><small>Ручная очередь</small><b>'+n(manual.length)+' '+(n(manual.length)===1?'действие':n(manual.length)>=2&&n(manual.length)<=4?'действия':'действий')+'</b><span>из той же компиляции; без отдельной истины</span></div>'+
      '<div class="commercial-source-item"><small>Собрано</small><b>'+safe(generatedRu)+'</b><span>'+safe(ageMin==null?"возраст неизвестен":"возраст "+ageMinutesLabel(ageMin))+'; обновляется автоматическим циклом</span></div>';if(sourcebar){sourcebar.setAttribute("data-direction-title","Подключения и свежесть");sourcebar.setAttribute("data-direction-summary","Коммерческая проекция подключена. Живых датированных записей: "+n(t.live_dated)+", импортированных без даты события: "+n(t.imported_undated)+". Ручная очередь: "+n(manual.length)+". Последняя сборка: "+generatedRu+".");}
    var nav=document.querySelector("[data-commercial-nav-count]");if(nav)nav.textContent=n(t.founder)?String(n(t.founder)):"";
    var hero=box("hero");if(hero){hero.setAttribute("data-direction-title","Коммерческое ядро");hero.setAttribute("data-direction-summary",n(t.all)+" записей всего: "+n(t.live_dated)+" с живой датой и "+n(t.imported_undated)+" импортированных без даты события. Незакрытых: "+n(t.active)+"; ждём рынок: "+n(t.waiting)+" ("+n(t.waiting_live_dated)+" живых / "+n(t.waiting_imported_undated)+" импортированных); требует действия Ники: "+n(t.founder)+"; оплачено: "+n(t.paid)+".");hero.innerHTML='<div class="com-hero-row"><div class="com-hero-copy"><small>КОММЕРЧЕСКОЕ ЯДРО</small><h2>'+n(t.all)+' записей · '+n(t.live_dated)+' с живой датой</h2><p>'+n(t.imported_undated)+' записей пришли из handoff без даты события и сохраняются как импортированное состояние, а не как свежая рыночная активность.</p></div><div class="com-hero-state"><span><small>незакрытых записей</small><b>'+n(t.active)+'</b></span><span><small>ждём рынок</small><b>'+n(t.waiting)+'</b></span><span><small>ручных действий</small><b>'+n(manual.length)+'</b></span><span><small>оплачено</small><b>'+n(t.paid)+'</b></span></div></div>';}
    var autoToday=Array.isArray(data.automatic_today)?data.automatic_today:[];
    var sentToday=Array.isArray(data.sent_today)?data.sent_today:autoToday;
    var waitingLive=Array.isArray(data.waiting_live)?data.waiting_live:[];
    var followup=data.followup_summary||{};
    var k=box("kpis");if(k){var cells=[["Отправить вручную",t.manual_send,"формы, порталы и каналы без безопасной автоотправки","↗","risk","decision"],["Найти контакт / решить маршрут",t.contact_route,"сильный кейс готов, но адрес или маршрут не подтверждён","⌕","violet","decision"],["Проверить прошлую отправку",t.verify_sent,"нельзя повторять касание до проверки","?","wait","decision"],["Сегодня отправлено",sentToday.length,"все подтверждённые отправки: автоматические и ручные","✓","","evidence"],["Ждём рынок",t.waiting,n(t.waiting_live_dated)+" с живой датой · "+n(t.waiting_imported_undated)+" импортированы без даты события","○","wait","projection"],["Живые датированные",t.live_dated,"записи с подтверждённой датой события","↩","","evidence"]];k.innerHTML=cells.map(function(c){var summary=c[0]+": "+n(c[1])+". "+c[2]+".";return '<div class="cc-kpi direction-selectable '+c[4]+'" data-direction-role="'+c[5]+'" data-direction-title="'+safe(c[0])+'" data-direction-summary="'+safe(summary)+'"><span class="cc-kpi-icon">'+c[3]+'</span><span class="cc-kpi-body"><small>'+safe(c[0])+'</small><strong>'+n(c[1])+'</strong><em>'+safe(c[2])+'</em></span></div>';}).join("");}
    var prod=box("products");if(prod)prod.innerHTML=products.map(function(p){var counts=p.stage_counts||{},items=(p.items||[]).slice().sort(function(a,b){var d=stagePriority(a.stage)-stagePriority(b.stage);return d||evidenceRank(a)-evidenceRank(b);});var chips=["RESEARCH","FOUNDER","WAITING","WATCH","HOLD","SUBMITTED","REPLIED","PROPOSAL","PAID"].filter(function(x){return n(counts[x])>0;}).map(function(x){return '<span class="com-stage-chip">'+safe(ruStage(x))+' <b>'+n(counts[x])+'</b></span>';}).join("");var rows=items.filter(function(x){return x.stage!=="CLOSED";}).slice(0,6).map(function(x){var nx=nextRu(x.next||x.signal_class||x.class_name||x.route||"");var summary=(x.company||x.id)+". Стадия: "+ruStage(x.stage)+". Следующий ход: "+(nx||"не передан")+".";return '<div class="com-item direction-selectable" data-direction-role="projection" data-direction-title="'+safe(x.company||x.id)+'" data-direction-summary="'+safe(summary)+'"><div class="com-item-top"><b>'+safe(x.company||x.id)+'</b><em>'+safe(ruStage(x.stage))+'</em></div><small>'+safe(nx)+'</small>'+itemDates(x)+provenanceHTML(x)+'</div>';}).join("");var tone=productClass(p)==="amber"?"tone-return":productClass(p)==="violet"?"tone-violet":"tone-flow";return '<article class="com-product direction-selectable '+safe(tone)+' '+safe(productClass(p))+'" data-direction-role="projection"><div class="com-product-head"><div><h2>'+safe(p.name)+'</h2><small>'+safe(productGoal(p))+'</small></div><span class="com-product-badge">'+n(p.active_items)+'</span></div><div class="com-stage-strip">'+chips+'</div><div class="com-product-list">'+(rows||'<div class="com-empty">Нет активных объектов.</div>')+'</div></article>';}).join("");
    function manualInfo(x){
      var kind=String(x.kind||"");
      if(kind==="VERIFY_SENT")return {label:"Проверить прошлую отправку",cls:"verify",tone:"tone-blue"};
      if(kind==="MANUAL_CONTACT_RESEARCH")return {label:"Найти контакт / решить маршрут",cls:"route",tone:"tone-violet"};
      return {label:"Отправить вручную",cls:"send",tone:"tone-return"};
    }
    function taskDate(x){return x.created_at||x._imported_at||x.updated_at||data.generated_at||null;}
    var commercialUi=window.__aiclavisCommercialManualUi||(window.__aiclavisCommercialManualUi={});
    var man=box("manual");
    if(man){
      man.querySelectorAll(".com-manual-card[data-commercial-item-id]").forEach(function(card){
        var id=card.getAttribute("data-commercial-item-id");if(!id)return;
        var u=commercialUi[id]||(commercialUi[id]={});
        if(!u.processing)u.open=!!card.open;
        var st=card.querySelector("[data-commercial-action-state]");
        if(st&&st.innerHTML.trim())u.actionHtml=st.innerHTML;
        var fd=card.querySelector(".com-work-failure>details"),fr=card.querySelector("[data-commercial-failure-reason]"),fn=card.querySelector("[data-commercial-failure-note]");
        if(fd)u.failureOpen=!!fd.open;if(fr)u.failureReason=fr.value;if(fn)u.failureNote=fn.value;
      });
    }
    if(man)man.innerHTML=manual.length?manual.map(function(x){
      var info=manualInfo(x), verify=x.kind==="VERIFY_SENT", title=x.company||x.item_id||"Коммерческий кейс";
      var appeared=taskDate(x), appearedText=appeared?dateShort(appeared):"дата не передана";
      var subject=x.subject||"", bodyText=x.body||x.copy_text||"";
      var recipient=[x.recipient_name,x.recipient_role].filter(Boolean).join(" · ")||"адресат / роль не переданы";
      var why=x.why_now||x.reason||"Требуется ручное действие";
      var payload={case_id:x.item_id||"",company:title,product_id:x.product_id||"",channel:x.route||"",target_url:x.target_url||null,projection_generated_at:data.generated_at||null,timestamp:new Date().toISOString()};
      var currentAction=attr(JSON.stringify(Object.assign({},payload,{action_type:"MANUAL_SEND_CONFIRMED"})));
      var historicalAction=attr(JSON.stringify(Object.assign({},payload,{action_type:"HISTORICAL_SENT_CONFIRMED"})));
      var failureAction=attr(JSON.stringify(Object.assign({},payload,{action_type:"MANUAL_ROUTE_BLOCKED"})));
      var stewardCtx=attr(JSON.stringify({kind:"commercial_manual_action",title:title,sub:x.product_name||x.product_id||"",object_id:x.item_id||"",status:x.status||"",route:x.route||"",why:why,target_url:x.target_url||"",subject:subject,generated_at:data.generated_at||"",details:"Ручная граница: "+info.label+". "+why,quick_question:(x.kind==="MANUAL_CONTACT_RESEARCH"?"Найди официальный маршрут для "+title+": страницу связи или форму. Дай только подтверждённые варианты и прямые ссылки; ничего не отправляй и не меняй в состоянии кейса.":"")}));
      var openButton=x.target_url?'<a class="com-work-open" href="'+attr(x.target_url)+'" target="_blank" rel="noopener">Открыть форму / сайт</a>':'<button type="button" class="com-work-open unavailable" data-cc-steward-context="'+stewardCtx+'">Маршрут не передан — спросить Стюарда</button>';
      var subjectBlock=subject?'<div class="com-copy-field"><div><small>Тема</small><button type="button" data-commercial-copy="subject">Копировать</button></div><p data-commercial-subject>'+safe(subject)+'</p></div>':'<div class="com-copy-field missing"><small>Тема</small><p>не передана источником</p></div>';
      var bodyBlock=bodyText?'<div class="com-copy-field body"><div><small>Текст для отправки</small><button type="button" data-commercial-copy="body">Копировать текст</button></div><pre data-commercial-body>'+safe(bodyText)+'</pre><button type="button" class="com-copy-all" data-commercial-copy="all">Скопировать всё</button></div>':'<div class="com-copy-field missing"><small>Текст для отправки</small><p>не передан источником — панель не сочиняет письмо</p></div>';
      var routeResearch=x.kind==="MANUAL_CONTACT_RESEARCH";
      var verifyCandidates=Array.isArray(x.verification_candidates)?x.verification_candidates:[];
      var verifyEvidence=verify&&verifyCandidates.length?'<div class="com-verify-evidence"><small>Что нашёл Клим в истории отправок</small>'+verifyCandidates.map(function(v){return '<div class="com-verify-hit"><b>'+safe(v.email||"email не передан")+'</b><span>'+safe(v.sent_at?dateShort(v.sent_at):"дата не передана")+'</span><p>'+safe(v.subject||"тема не передана")+'</p></div>';}).join("")+'</div>':"";
      var actionButtons=verify?verifyEvidence+'<div class="com-work-confirm"><button type="button" data-commercial-propose="'+historicalAction+'">Да, это было отправлено</button>'+(x.target_url?'<a href="'+attr(x.target_url)+'" target="_blank" rel="noopener" class="secondary">Нет, не эта отправка — открыть маршрут</a>':'<button type="button" class="secondary" data-cc-steward-context="'+stewardCtx+'">Нет, не эта отправка</button>')+'<div data-commercial-action-state></div></div>':(routeResearch?'<div class="com-work-confirm route-research"><button type="button" class="secondary" data-cc-steward-context="'+stewardCtx+'">Разобрать маршрут со Стюардом</button><button type="button" data-commercial-propose="'+currentAction+'">Отправлено вручную</button><div data-commercial-action-state></div><small>После фактической отправки подтвердите её здесь: событие пройдёт через Steward/action layer и переведёт кейс в WAITING.</small></div>':'<div class="com-work-confirm"><button type="button" data-commercial-propose="'+currentAction+'">Отправлено вручную</button><div data-commercial-action-state></div></div>');
      var failureControl='<div class="com-work-failure"><details><summary>Не удалось отправить / отклонить</summary><div class="com-work-failure-body"><select data-commercial-failure-reason><option value="FORM_BROKEN">Форма / сайт не работает</option><option value="MISSING_REQUIRED_DATA">Не хватает данных для заполнения</option><option value="ROUTE_CLOSED">Маршрут закрыт / регистрация недоступна</option><option value="WRONG_CONTACT_ROUTE">Контакт не подходит / неверный маршрут</option><option value="CHANNEL_NOT_WORTH_TIME">Не хочу тратить время на этот канал</option><option value="FOUNDER_DECLINED">Отклонить кейс целиком</option><option value="OTHER">Другая причина</option></select><input type="text" data-commercial-failure-note placeholder="Короткий комментарий — необязательно"><button type="button" class="secondary" data-commercial-fail="'+failureAction+'">Зафиксировать</button><small>Временная проблема уберёт кейс из ручной очереди и передаст его на поиск нового маршрута. «Отклонить кейс целиком» закроет его по решению Основателя.</small></div></details></div>';
      var uiState=commercialUi[String(x.item_id||"")]||{};
      return '<details class="com-manual-card '+info.cls+' '+info.tone+(uiState.processing?' is-processing':'')+' direction-selectable" data-commercial-item-id="'+safe(x.item_id||"")+'"'+(uiState.open&&!uiState.processing?' open':'')+' data-direction-role="decision" data-direction-title="'+safe(title)+'" data-direction-summary="'+safe(info.label+". "+why+". Появилось: "+appearedText)+
        '"><summary><div class="com-manual-summary-main"><b>'+safe(title)+'</b><small>'+safe(x.product_name||x.product_id||"продукт не передан")+'</small></div><span class="com-manual-type">'+safe(info.label)+'</span><p>'+safe(why)+'</p><time>'+safe(appearedText)+'</time></summary>'+
        '<div class="com-manual-work"><div class="com-work-left"><div><small>Компания</small><b>'+safe(title)+'</b></div><div><small>Продукт</small><b>'+safe(x.product_name||x.product_id||"—")+'</b></div><div><small>Сигнал / почему сейчас</small><p>'+safe(x.why_now||x.reason||"не передано")+'</p></div><div><small>Адресат / роль</small><p>'+safe(recipient)+'</p></div><div><small>Причина ручного режима</small><p>'+safe(x.reason||"не передано")+'</p></div><div><small>Дата появления задачи</small><p>'+safe(appearedText)+'</p></div></div>'+
        '<div class="com-work-right">'+openButton+subjectBlock+bodyBlock+actionButtons+failureControl+'</div></div></details>';
    }).join(""):'<div class="com-empty">Сейчас ручных границ нет. Если автоматизация умеет выполнить безопасный следующий шаг сама, задача Нике не создаётся.</div>';
    if(man){
      var liveIds={};
      man.querySelectorAll(".com-manual-card[data-commercial-item-id]").forEach(function(card){
        var id=card.getAttribute("data-commercial-item-id");liveIds[id]=true;
        var u=commercialUi[id]||{};
        if(u.actionHtml){var st=card.querySelector("[data-commercial-action-state]");if(st)st.innerHTML=u.actionHtml;if(u.actionHtml.indexOf("data-commercial-confirm-card")>=0)card.querySelectorAll("[data-commercial-propose],[data-commercial-fail]").forEach(function(el){el.disabled=true;});}
        var fd=card.querySelector(".com-work-failure>details"),fr=card.querySelector("[data-commercial-failure-reason]"),fn=card.querySelector("[data-commercial-failure-note]");if(fd&&u.failureOpen)fd.open=true;if(fr&&u.failureReason)fr.value=u.failureReason;if(fn&&u.failureNote!=null)fn.value=u.failureNote;
        if(u.processing){card.classList.add("is-processing");card.open=false;card.querySelectorAll("button,input,select,a").forEach(function(el){if(el.tagName==="A")el.setAttribute("aria-disabled","true");else el.disabled=true;});}
      });
      Object.keys(commercialUi).forEach(function(id){if(!liveIds[id]&&!commercialUi[id].processing)delete commercialUi[id];});
    }
    var autoBox=box("automatic");
    if(autoBox)autoBox.innerHTML=sentToday.length?'<div class="com-auto-count"><b>'+sentToday.length+' отправлено</b><span>сегодня подтверждено: автоматические, ручные и восстановленные по истории отправки</span></div>'+sentToday.map(function(x){var mode=x.send_mode||"AUTO";var modeRu=mode==="MANUAL"?"РУЧНАЯ":(mode==="HISTORY"?"ИСТОРИЯ":"АВТО");var modeNote=mode==="HISTORY"?" · подтверждено по почте":"";return '<div class="com-auto-row"><b>'+safe(x.company||x.case_id)+'</b><span>'+modeRu+modeNote+' · SENT · '+safe(dateShort(x.sent_at))+'</span><small>'+safe(x.product_name||x.product_id||"")+(x.channel?" · "+safe(x.channel):"")+'</small></div>';}).join(""):'<div class="com-empty">Сегодня подтверждённых отправок пока нет.</div>';
    function replyLabel(v){var m={INTEREST:"интерес / готовность обсуждать",QUESTION:"вопрос",ROUTING:"перенаправление",REQUEST_MATERIAL:"просит материалы",NEGATIVE:"отрицательный ответ",UNKNOWN:"ответ требует разбора"};return m[String(v||"").toUpperCase()]||v||"ответ";}
    function replyNext(v){var m={PREPARE_CONVERSATION:"подготовить разговор",DRAFT_RESPONSE:"подготовить ответ",VERIFY_ROUTED_OWNER:"проверить нового адресата",REVIEW_REPLY:"разобрать ответ",SEND_REQUESTED_MATERIAL:"подготовить запрошенные материалы",CLOSE_NO_FURTHER_CONTACT:"закрыть дальнейшие касания"};return m[String(v||"").toUpperCase()]||v||"разобрать ответ";}
    var feedback=[];products.forEach(function(p){(p.items||[]).forEach(function(x){var rs=String(x.reply_status||"").toUpperCase();if(rs&&rs!=="AUTO_REPLY")feedback.push(x);else if(!rs&&["REPLIED","CONVERSATION"].includes(x.stage))feedback.push(x);});});feedback.sort(function(a,b){return String(b.replied_at||b.updated_at||"").localeCompare(String(a.replied_at||a.updated_at||""));});var fb=box("feedback");if(fb)fb.innerHTML=feedback.length?feedback.slice(0,10).map(function(x){var ctx=attr(JSON.stringify({kind:"commercial_reply",title:x.company||x.id,object_id:x.id||"",status:x.reply_status||x.stage||"",from:x.reply_from||"",subject:x.reply_subject||"",replied_at:x.replied_at||"",details:x.reply_summary||"",next_action:x.reply_next_action||"",quick_question:"Разбери этот коммерческий ответ: что именно он означает для кейса, какой следующий безопасный ход нужен и требуется ли моё действие. Не отправляй ничего без отдельного подтверждения."}));return '<details class="com-reply-card direction-selectable" data-direction-role="decision" data-direction-title="'+safe(x.company||x.id)+'" data-direction-summary="'+safe(replyLabel(x.reply_status)+". Следующий ход: "+replyNext(x.reply_next_action))+'"><summary><div><b>'+safe(x.company||x.id)+'</b><small>'+safe(replyLabel(x.reply_status||x.stage))+'</small></div><time>'+safe(x.replied_at?dateShort(x.replied_at):"дата не передана")+'</time></summary><div class="com-reply-body"><div class="com-reply-meta"><span><small>От кого</small><b>'+safe(x.reply_from||"не передано")+'</b></span><span><small>Тема</small><b>'+safe(x.reply_subject||"не передана")+'</b></span><span><small>Следующий ход</small><b>'+safe(replyNext(x.reply_next_action))+'</b></span></div><p>'+safe(x.reply_summary||"Ответ подтверждён; содержание ещё не занесено.")+'</p><button type="button" class="secondary" data-cc-steward-context="'+ctx+'">Разобрать со Стюардом</button></div></details>';}).join(""):'<div class="com-empty">Содержательных ответов пока нет. Автоответы и сообщения об отсутствии сотрудника сюда не попадают.</div>';
    var prop=[];products.forEach(function(p){(p.items||[]).forEach(function(x){if(["SUBMITTED","PROPOSAL","PAID"].includes(x.stage)||x.proposal_status)prop.push(x);});});var pr=box("proposals");if(pr)pr.innerHTML=prop.length?prop.slice(0,10).map(function(x){return '<div class="com-feedback-row"><div><b>'+safe(x.company||x.id)+'</b><small>'+safe(ruStage(x.stage))+'</small></div><span></span><small>'+safe(x.proposal_feedback||x.next||x.proposal_status||"")+'</small></div>';}).join(""):'<div class="com-empty">Подтверждённых КП / формальных подач пока нет.</div>';
    var stages=["DISCOVERY","SCREENING","RESEARCH","HOLD","READY","FOUNDER","WAITING","WATCH","SUBMITTED","REPLIED","CONVERSATION","PROPOSAL","PAID","CLOSED"];var sm=box("stages");if(sm){var heads='<div class="head">Стадия</div>'+products.map(function(p){return '<div class="head">'+safe(p.name)+'</div>';}).join("");var rows=stages.map(function(x){return '<div class="stage-name">'+safe(ruStage(x))+'</div>'+products.map(function(p){var cls=productClass(p),c=n((p.stage_counts||{})[x]);return '<div class="n '+safe(cls)+'-n">'+c+'</div>';}).join("");}).join("");sm.innerHTML='<div class="com-stage-matrix">'+heads+rows+'</div>';}
    var wl=box("waiting-live");if(wl){var fsum='<div class="com-followup-summary"><span><small>follow-up по расписанию</small><b>'+n(followup.scheduled)+'</b></span><span><small>уже пора</small><b>'+n(followup.due)+'</b></span><span><small>авто-контур готов</small><b>'+n(followup.auto_eligible)+'</b></span><span><small>заблокировано ответом</small><b>'+n(followup.blocked_by_reply)+'</b></span><span><small>цикл завершён</small><b>'+n(followup.cycle_complete)+'</b></span></div>';wl.innerHTML=fsum+(waitingLive.length?'<div class="com-queue-head waiting"><span>Компания</span><span>Отправлено</span><span>Следующий контакт</span><span>Способ</span></div>'+waitingLive.map(function(x){var mode=x.send_mode||"AUTO";var modeRu=mode==="MANUAL"?"РУЧНАЯ":(mode==="HISTORY"?"ИСТОРИЯ · подтверждено по почте":"АВТО");var summary=(x.company||x.case_id)+". Ждём рынок после подтверждённой отправки. Следующий контакт: "+(x.followup_due_at?dateShort(x.followup_due_at):"не назначен")+".";return '<div class="com-queue-row waiting direction-selectable" data-direction-role="projection" data-direction-title="'+safe(x.company||x.case_id)+'" data-direction-summary="'+safe(summary)+'"><div><b>'+safe(x.company||x.case_id)+'</b><small>'+safe(x.product_name||x.product_id||"")+'</small></div><small>'+safe(x.sent_at?dateShort(x.sent_at):"дата не передана")+'</small><small>'+safe(x.followup_policy==="ONE_TOUCH_MANUAL_NON_EMAIL"?"одно касание · ждём входящий ответ":(x.followup_due_at?dateShort(x.followup_due_at):"не назначен"))+'</small><small>'+safe(modeRu+(x.channel?" · "+x.channel:""))+'</small></div>';}).join(""):'<div class="com-empty">Живых отправленных кейсов в ожидании пока нет.</div>');}
    var all=[];products.forEach(function(p){(p.items||[]).forEach(function(x){var y=Object.assign({},x,{_product:p});if(x.stage!=="CLOSED")all.push(y);});});all.sort(function(a,b){var d=stagePriority(a.stage)-stagePriority(b.stage);return d||evidenceRank(a)-evidenceRank(b);});var q=box("queue");if(q)q.innerHTML='<div class="com-queue-head"><span>Компания / объект</span><span>Продукт</span><span>Стадия</span><span>Следующий ход</span></div>'+(all.length?all.slice(0,24).map(function(x){var nx=nextRu(x.next||x.route||"");var summary=(x.company||x.id)+". "+x._product.name+". Стадия: "+ruStage(x.stage)+". Следующий ход: "+(nx||"не передан")+".";return '<div class="com-queue-row direction-selectable" data-direction-role="projection" data-direction-title="'+safe(x.company||x.id)+'" data-direction-summary="'+safe(summary)+'"><div><b>'+safe(x.company||x.id)+'</b><small>'+safe(x.id||"")+'</small>'+itemDates(x)+'</div><small>'+safe(x._product.name)+'</small><small>'+safe(ruStage(x.stage))+'</small><small>'+safe(nx||"—")+'</small></div>';}).join(""):'<div class="com-empty">Очередь пуста.</div>');
    refreshDirectionInspector("commercial");
  }

  function renderManualCommercial(data) {
    var page=document.querySelector('[data-page-panel="signals"]');
    if(!page)return;
    var box=page.querySelector('[data-radar="manual-commercial"]');
    if(!box)return;
    if(!sourceState.manualCommercial.ok || !data){
      box.innerHTML='<div class="cc-empty"><b>Очередь недоступна</b><span>Коммерческая проекция чтения сейчас не отвечает.</span></div>';
      return;
    }
    var items=Array.isArray(data.items)?data.items:[];
    if(!items.length){
      box.innerHTML='<div class="cc-empty"><b>Ничего не ждёт ручного действия</b><span>Автоматические контуры продолжают работу сами.</span></div>';
      return;
    }
    function safe(v){return esc(v==null?"":v);}
    box.innerHTML='<div class="radar-card-list">'+items.slice(0,8).map(function(x){
      var meta=[x.channel,x.action_kind,x.deadline?("до "+x.deadline):""].filter(Boolean).join(" · ");
      return '<div class="radar-signal-card"><div class="radar-signal-head"><span class="radar-mini-hex">!</span><div><b>'+safe(x.company||x.case_id||"Коммерческий кейс")+'</b><small>'+safe(meta)+'</small></div></div>'+
        '<p>'+safe(x.reason||"Требуется ручное действие")+'</p>'+
        (x.person_name?'<small>'+safe(x.person_name)+(x.person_role?' · '+safe(x.person_role):'')+'</small>':'')+
        '</div>';
    }).join("")+'</div>';
  }

  window.addEventListener("aiclavis:commercial-action-confirmed",function(){setTimeout(function(){fetchJSON("commercialDashboard",ENDPOINTS.commercialDashboard,UNIVERSE_TIMEOUT_MS).then(function(d){renderCommercial(d);});fetchJSON("manualCommercial",ENDPOINTS.manualCommercial,UNIVERSE_TIMEOUT_MS).then(function(d){renderManualCommercial(d);});},1200);});

  function boot() {
    injectLiveStyles();
    fetchJSON("commercialDashboard", ENDPOINTS.commercialDashboard, UNIVERSE_TIMEOUT_MS).then(function(d){renderCommercial(d);});

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
      fetchJSON("agentProjection", ENDPOINTS.agentProjection, UNIVERSE_TIMEOUT_MS),
      fetchJSON("agentLineage", ENDPOINTS.agentLineage, UNIVERSE_TIMEOUT_MS),
      fetchJSON("temporalUniverse", ENDPOINTS.temporalUniverse, UNIVERSE_TIMEOUT_MS),
      fetchJSON("portfolioAdmission", ENDPOINTS.portfolioAdmission, UNIVERSE_TIMEOUT_MS),
      fetchJSON("radar", ENDPOINTS.radar, UNIVERSE_TIMEOUT_MS),
      fetchJSON("manualCommercial", ENDPOINTS.manualCommercial, UNIVERSE_TIMEOUT_MS)
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
      var agentProjection = res[23];
      var agentLineage = res[24];
      var temporalUniverse = res[25];
      var portfolioAdmission = res[26];
      var radar = res[27];
      var manualCommercial = res[28];

      var routesKnown = !!(routesJSON && Array.isArray(routesJSON.routes));
      var routes = routesKnown ? routesJSON.routes : [];
      sourceState.routes.collectionKnown = routesKnown;
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
        stewardReconciliation: stewardReconciliation, signalLabStatus: signalLabStatus, agentProjection: agentProjection, agentLineage: agentLineage, temporalUniverse: temporalUniverse,
        portfolioAdmission: portfolioAdmission, radar: radar, manualCommercial: manualCommercial, rd1: {},
        collections: { routes: routesKnown }
      };

      setOrchestratorHeader(sourceState.routes.ok, routesKnown, sourceState.summary.ok, sourceState.metrics.ok);
      renderHomeKPIs(routes, inbox, routesKnown);
      renderHomeTesting(testingSummary);

      if (sourceState.routes.ok && routesKnown) {
        renderOrchestratorKPIs(routes, summary, metrics, depModel);
        renderOrchestratorRoutes(routes, depModel);
        renderVisualBoard(routes, depModel);
        renderHomeRoutes(routes, depModel);
        renderHomeRisk(routes, depModel);
      } else {
        renderRoutesUnavailable(sourceState.routes.ok && !routesKnown);
      }

      if (sourceState.inbox.ok) renderHomeNeeds(inbox);
      else renderInboxUnavailable();

      renderRegistry(objects, blockers, portfolioAdmission);
      renderDocuments(hubHealth, testingSummary);
      renderTesting(testingSummary, testingRunner);
      renderFounderRadar(radar, marketSignals, scannerDiagnostics);
      renderManualCommercial(manualCommercial);
      renderScannerDiagnostics(scannerDiagnostics);
      renderOperationsProjection(opsProjection);
      renderBrazilPortalProjection(brazilPortal);
      renderFoundationAggregateClean(foundationAgg, inbox);
      renderAtlasStateClean(atlasState);
      renderAtlasSignalLab(signalLabStatus);
      renderAgentNetwork(agentProjection, agentLineage);
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

  // Personal Twin G1 has a tighter observational cadence than the rest of the
  // Founder Panel. The server adapter keeps heavier evidence surfaces cached / counter-driven,
  // so this 15s read refreshes runtime + summary without turning history into a hot poll.
  setInterval(function(){
    fetchJSON("twinState", ENDPOINTS.twinState).then(function(d){
      renderTwinStateClean(d);
      if(lastSnapshot){lastSnapshot.twinState=d;lastSnapshot.sources=JSON.parse(JSON.stringify(sourceState));}
    });
  },15000);

  setInterval(boot, REFRESH_MS);
})();
