// Founder Panel v2 — Live Read Wiring G18
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
    continuityHealth: API + "/continuity-health"
  };

  var REFRESH_MS = 90000;
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
    researchRD1: { ok: false, at: null, error: null }
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

  function fetchJSON(name, url) {
    return fetch(url, { credentials: "same-origin", cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        sourceState[name] = { ok: true, at: new Date().toISOString(), error: null };
        return json;
      })
      .catch(function (err) {
        sourceState[name] = { ok: false, at: new Date().toISOString(), error: String(err && err.message || err) };
        return null;
      });
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

  function routeName(r) {
    return r.area || r.source_object_id || r.object_id || r.route_id || r.id || r.title || "Маршрут";
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
    if (typeof x === "string" || typeof x === "number") return String(x);
    if (typeof x === "object") {
      return String(
        x.route_id || x.id || x.object_id || x.source_object_id ||
        x.area || x.name || x.title || ""
      ) || null;
    }
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
      var keys = [
        routeKey(r),
        r.route_id, r.id, r.source_object_id, r.object_id, r.area, r.title
      ].filter(Boolean).map(String);
      keys.forEach(function (k) { byKey[k] = r; });
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
      ".live-unavailable b{font:400 16px Georgia,'Times New Roman',serif;color:#dfe2dc;margin-bottom:5px}"
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
      esc(r.stage || r.status || "активен") + "</span></div>" +
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
      return r.ball_owner && !isFounderOwner(r.ball_owner);
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
          esc(r.stage || r.status || "этап не передан") + "</small></div>" +
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
          esc(cut(routeName(x.r), 34)) + "</b><small>" + esc(reason.join(" · ") || "движется") + "</small></div>";
      }).join("");
    }

    scale.innerHTML =
      "<h3>ШКАЛА ВНИМАНИЯ</h3>" +
      "<div class='attention-note'>Визуальная диагностика панели по давности/блокерам. Это не канонический приоритет Оркестратора.</div>" +
      attentionRows(critical, "critical", "Критично") +
      attentionRows(returning, "return", "Вернуться") +
      attentionRows(stable, "stable", "Стабильно");

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
          esc((n.object_id ? "[" + n.object_id + "] " : "") + cut(n.title || "Требует решения", 84)) +
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
    var h = Math.floor(n / 60), m = Math.round(n % 60);
    return h ? h + "ч " + m + "м" : m + "м";
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
    var unresolved = items.filter(function (o) { return !o.last_event_at; });
    var founder = items.filter(function (o) { return !!(o.needs_nika || o.needs_founder); });

    function put(k, v) { var e = page.querySelector('[data-g="' + k + '"]'); if (e) e.textContent = String(v); }
    put("count", items.length); put("active", active.length); put("unresolved", unresolved.length); put("founder", founder.length);
    var core = page.querySelector('[data-g="identity-core"]'); if (core) core.textContent = String(unresolved.length);

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
      "<div class='registry-empty compact'><strong>Нет подтверждённых решений уровня Основателя</strong><span>Источник объектов не отметил ни один объект как требующий Основателя.</span></div>";
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
          return "<div class='registry-mini-item'><b>" + esc(b.title || b.blocker || "Открытое препятствие") + "</b><span>" +
            esc(b.object_id || "объект не определён") + " · " + esc(b.status || "открыт") + "</span></div>";
        }).join("") + "</div>" :
        "<div class='registry-empty compact'><strong>Открытых нетестовых блокеров нет</strong><span>По текущей проекции Continuity.</span></div>";
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
      "<div class='registry-empty compact'><strong>Нет подтверждённых событий</strong><span>Источник объектов ответил, но last_event_at отсутствует.</span></div>";
    }

    pageBadge("registry", sourceState.blockers.ok ? "live" : "warn", sourceState.blockers.ok ? "ДАННЫЕ ПОДКЛЮЧЕНЫ" : "ДАННЫЕ ЧАСТИЧНО");
  }

  function renderDocuments(health) {
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
    var q = page.querySelector('[data-d="queue"]');
    if (q) {
      var rows = asArray(rq.oldest_5);
      q.innerHTML = rows.length ? rows.map(function (r) {
        var ageMin = r.received_at ? Math.max(0, Math.round((Date.now() - new Date(r.received_at).getTime()) / 60000)) : null;
        return "<div class='document-live-row'><b>" + esc(r.packet_file || "(событие без файла)") + "</b>" +
          "<span>" + esc(r.claimed_object_id || "не привязан") + "</span>" +
          "<span>" + esc(r.artifact_class || "UNKNOWN") + "</span><small>" + esc(ageMinutesLabel(ageMin)) + "</small></div>";
      }).join("") :
      "<div class='documents-empty compact'><strong>Ручного разбора сейчас нет</strong><span>Источник Hub ответил пустой очередью.</span></div>";
    }
    pageBadge("documents", "live", "ДАННЫЕ ПОДКЛЮЧЕНЫ");
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
            "<span>" + esc(t.owning_branch || "—") + "</span><span>" + esc(t.test_type || "—") + "</span>" +
            "<em>" + esc(ruStatus(t.status)) + "</em><span>" + esc(t.next_action || t.scientific_outcome || "—") + "</span></div>";
        }).join("") :
        "<div class='testing-empty compact'><strong>Очередь пуста</strong><span>Testing summary ответил без тестов.</span></div>";
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
            esc(t.procedure_status || "процедура не указана") + " · " + esc(t.scientific_outcome || "научный исход не указан") +
            " · " + esc(ago(t.updated_at)) + "</span></div>";
        }).join("") + "</div>" :
        "<div class='testing-empty compact'><strong>Завершённых результатов нет</strong><span>По текущему Testing summary.</span></div>";
      }

      var adjBox = page.querySelector('[data-t="adjudication"]');
      if (adjBox) {
        adjBox.innerHTML = adj.length ? "<div class='testing-mini-list'>" + adj.slice(0, 6).map(function (t) {
          return "<div class='testing-mini-item'><b>" + esc(t.test_id || "—") + "</b><span>" +
            esc(t.owning_branch || "владеющая ветка не указана") + " · " + esc(t.scientific_outcome || "нужен разбор") + "</span></div>";
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
      if (state) state.textContent = "Доступен";
      if (note) note.textContent = "последнее чтение успешно";
      if (providers) providers.textContent = String(names.length);
      if (healthAt) healthAt.textContent = sourceState.testingRunner.at ? new Date(sourceState.testingRunner.at).toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"}) : "—";
    }
  }


  function renderResearch(objectsResp, blockersResp) {
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

      // Research line exists only when the RD1 projection itself exposes meaningful semantics
      // or the canonical object explicitly declares a research status.
      var lines = items.filter(function (o) {
        var p = byId[String(o.object_id)] || {};
        var explicitResearch = /RESEARCH/.test(String(o.declared_status || "").toUpperCase());
        var projected = p.available !== false && !!(p.stage || p.status || p.next_move || p.next_gate || p.semantic_freshness);
        return explicitResearch || projected;
      }).map(function (o) {
        return { object: o, projection: byId[String(o.object_id)] || {} };
      });

      var active = lines.filter(function (x) {
        return /^ACTIVE/.test(String(x.object.declared_status || x.projection.status || "").toUpperCase());
      });
      var founder = lines.filter(function (x) { return !!(x.object.needs_nika || x.object.needs_founder); });
      var waiting = lines.filter(function (x) {
        var st = String(x.object.declared_status || x.projection.status || "").toUpperCase();
        var owner = String(x.projection.owner || "").toUpperCase();
        return /PARKED|PREPARING/.test(st) || /EXTERNAL|CONDITION/.test(owner);
      });
      var identity = lines.filter(function (x) { return !x.projection.semantic_freshness; });

      function put(k, v) { var e = page.querySelector('[data-r="' + k + '"]'); if (e) e.textContent = String(v); }
      put("active-count", active.length);
      put("founder-count", founder.length);
      put("waiting-count", waiting.length);
      put("identity-count", identity.length);

      var linesBox = page.querySelector('[data-r="lines"]');
      if (linesBox) {
        linesBox.innerHTML = lines.length ? lines.map(function (x) {
          var o = x.object, p = x.projection;
          return "<div class='research-live-row'><b>" + esc(o.name || o.object_id || "линия") +
            "<small>" + esc(o.object_id || "ID не определён") + "</small></b>" +
            "<span>" + esc(p.stage || "этап не указан") + "</span>" +
            "<span>" + esc(p.owner || "не назначен") + "</span>" +
            "<span>" + esc(p.next_gate || p.next_move || "не определён") + "</span>" +
            "<small>" + esc(ruStatus(p.status || o.declared_status || "—")) + "</small></div>";
        }).join("") :
        "<div class='research-empty'><strong>Исследовательских линий в текущей RD1-проекции нет</strong><span>Continuity ответил, но ни один объект не удовлетворил явному research/RD1-контракту.</span></div>";
      }

      function mini(container, rows, emptyTitle, emptyText) {
        if (!container) return;
        container.innerHTML = rows.length ? "<div class='research-mini-list'>" + rows.join("") + "</div>" :
          "<div class='research-empty compact'><strong>" + esc(emptyTitle) + "</strong><span>" + esc(emptyText) + "</span></div>";
      }

      mini(page.querySelector('[data-r="attention"]'), founder.slice(0, 6).map(function (x) {
        var o = x.object, p = x.projection;
        return "<div class='research-mini-item'><b>" + esc(o.name || o.object_id) + "</b><span>" +
          esc(p.next_move || o.last_summary || "требуется решение") + " · " + esc(o.object_id || "ID не определён") + "</span></div>";
      }), "Решений Основателя по исследовательским линиям нет", "По текущей объектной и RD1-проекции.");

      mini(page.querySelector('[data-r="waiting"]'), waiting.slice(0, 6).map(function (x) {
        var o = x.object, p = x.projection;
        return "<div class='research-mini-item'><b>" + esc(o.name || o.object_id) + "</b><span>" +
          "ждём: " + esc(p.next_gate || p.next_move || "условие не описано") + " · ход: " + esc(p.owner || "не назначен") + "</span></div>";
      }), "Линий в ожидании не найдено", "Нет PARKED/PREPARING или явного EXTERNAL/CONDITION owner.");

      var MATERIAL = ["GATE_RESULT", "DECISION", "STATUS_CHANGE", "STAGE_CHANGE", "TEST_RESULT", "EXTERNAL_EVENT"];
      var material = lines.filter(function (x) {
        return MATERIAL.indexOf(String(x.object.last_meaning_kind || "").toUpperCase()) >= 0 && x.object.last_summary;
      }).sort(function (a, b) {
        return String(b.object.last_event_at || "").localeCompare(String(a.object.last_event_at || ""));
      });

      mini(page.querySelector('[data-r="result"]'), material.slice(0, 5).map(function (x) {
        var o = x.object;
        return "<div class='research-mini-item'><b>" + esc(o.name || o.object_id) + "</b><span>" +
          esc(o.last_summary) + " · " + esc(o.last_meaning_kind || "изменение") + " · " + esc(ago(o.last_event_at)) + "</span></div>";
      }), "Существенного результата не найдено", "Нет материального GATE_RESULT / DECISION / STATUS_CHANGE / STAGE_CHANGE / TEST_RESULT / EXTERNAL_EVENT.");

      var nextGates = lines.filter(function (x) { return !!x.projection.next_gate; });
      mini(page.querySelector('[data-r="next-gates"]'), nextGates.slice(0, 6).map(function (x) {
        return "<div class='research-mini-item'><b>" + esc(x.object.name || x.object.object_id) + "</b><span>" +
          esc(x.projection.next_gate) + " · следующий ход: " + esc(x.projection.next_move || "не указан") + "</span></div>";
      }), "Следующая проверка не определена", "Ни одна текущая RD1-проекция не отдала next_gate.");

      mini(page.querySelector('[data-r="changes"]'), material.slice(0, 6).map(function (x) {
        var o = x.object;
        return "<div class='research-mini-item'><b>" + esc(o.object_id || "ID не определён") + " · " + esc(o.name || "") + "</b><span>" +
          esc(o.last_summary) + " · " + esc(ago(o.last_event_at)) + "</span></div>";
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

  function renderSignals(objectsResp, blockersResp, inbox, testingSummary) {
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
      return MATERIAL.indexOf(String(o.last_meaning_kind || "").toUpperCase()) >= 0 &&
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
    put("risks", (blockersOk || testingOk) ? blockers.length + riskyTests.length : "Недоступно");
    put("opportunities", "—");

    var founderBox = page.querySelector('[data-s="founder-list"]');
    if (founderBox) {
      if (!inboxOk) {
        founderBox.innerHTML = unavailableHTML("Входящие Основателя недоступны", "Панель не может подтвердить, есть ли сейчас решения, требующие Основателя.");
      } else if (!founderItems.length) {
        founderBox.innerHTML = "<div class='signals-empty compact'><strong>Сейчас решений Основателя нет</strong><span>Текущие Входящие Основателя не содержат `needs_founder`.</span></div>";
      } else {
        founderBox.innerHTML = "<div class='signals-live-list'>" + founderItems.slice(0, 6).map(function (x) {
          return "<div class='signals-live-item attention'><b>" + esc(x.title || x.summary || "Требуется решение") + "</b>" +
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
            "<span>" + esc(o.last_summary || o.last_meaning_kind || "изменение состояния") + "</span>" +
            "<small>" + esc(o.object_id || "ID не указан") + " · " + esc(o.last_meaning_kind || "событие") + " · " + esc(ago(o.last_event_at)) + "</small></div>";
        }).join("") + "</div>";
      }
    }

    var risksBox = page.querySelector('[data-s="risks-list"]');
    if (risksBox) {
      if (!blockersOk && !testingOk) {
        risksBox.innerHTML = unavailableHTML("Источники риска недоступны", "Панель не вычисляет собственный риск без подтверждённого источника.");
      } else {
        var rows = blockers.slice(0, 6).map(function (b) {
          return "<div class='signals-live-item risk'><b>" + esc(b.title || b.blocker || "Открытое препятствие") + "</b>" +
            "<span>" + esc(b.object_id || "объект не указан") + " · " + esc(b.status || "открыт") + "</span>" +
            "<small>Continuity blocker · тяжесть без оценки, если источник её не передал</small></div>";
        });
        riskyTests.slice(0, 6).forEach(function (t) {
          rows.push("<div class='signals-live-item risk'><b>" + esc(t.test_id || "Проверка") + "</b>" +
            "<span>" + esc(t.owning_branch || "владеющая ветка не указана") + " · " + esc(ruStatus(t.status)) + "</span>" +
            "<small>Testing · " + esc(t.blocker || t.next_action || "нужна реакция владеющей ветки") + "</small></div>");
        });
        risksBox.innerHTML = rows.length ? "<div class='signals-live-list'>" + rows.join("") + "</div>" :
          "<div class='signals-empty compact'><strong>Подтверждённых рисков сейчас нет</strong><span>Текущие Continuity blockers и Testing summary не содержат открытых нетестовых блокеров, BLOCKED или RERUN_REQUIRED.</span></div>";
      }
    }

    var opportunitiesBox = page.querySelector('[data-s="opportunities-list"]');
    if (opportunitiesBox) {
      opportunitiesBox.innerHTML =
        "<div class='signals-empty compact'><strong>Внешний источник возможностей ещё не подключён</strong>" +
        "<span>Market Scanner проходит QA. Панель не выводит «возможности» из обычных изменений Continuity и не создаёт их локально.</span></div>";
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
        heroRows.push("<div class='signals-live-item attention'><b>" + esc(x.title || x.summary || "Требуется решение Основателя") + "</b>" +
          "<span>" + esc(x.object_id || "объект не указан") + "</span><small>Требует Основателя</small></div>");
      });
      blockers.slice(0, 2).forEach(function (b) {
        heroRows.push("<div class='signals-live-item risk'><b>" + esc(b.title || b.blocker || "Открытый блокер") + "</b>" +
          "<span>" + esc(b.object_id || "объект не указан") + "</span><small>Подтверждённый blocker · без локального severity</small></div>");
      });
      changes.slice(0, 2).forEach(function (o) {
        heroRows.push("<div class='signals-live-item change'><b>" + esc(o.name || o.object_id || "Изменение") + "</b>" +
          "<span>" + esc(o.last_summary || "материальное изменение") + "</span><small>" + esc(o.last_meaning_kind || "событие") + " · " + esc(ago(o.last_event_at)) + "</small></div>");
      });
      if (!objectsOk && !blockersOk && !inboxOk) {
        hero.innerHTML = unavailableHTML("Внутренние источники сигналов недоступны", "Панель не сохраняет старую ленту как текущую.");
      } else if (!heroRows.length) {
        hero.innerHTML = "<div class='signals-empty hero'><strong>Сейчас нет подтверждённых внутренних сигналов</strong><p>Это не означает, что внешний рынок спокоен: Market Scanner ещё не подключён.</p></div>";
      } else {
        hero.innerHTML = "<div class='signals-live-list'>" + heroRows.join("") + "</div>" +
          "<div class='signals-partial-note'>Внутренний слой подключён частично. Между типами сигналов Панель не строит собственный рейтинг. Market Scanner / внешние возможности ожидают отдельного источника.</div>";
      }
    }

    var anyInternal = objectsOk || blockersOk || inboxOk || testingOk;
    pageBadge("signals",
      anyInternal ? "warn" : "unavailable",
      anyInternal ? "ВНУТРЕННИЕ ДАННЫЕ ПОДКЛЮЧЕНЫ · MARKET SCANNER ОЖИДАЕТСЯ" : "ВНУТРЕННИЕ ИСТОЧНИКИ НЕДОСТУПНЫ"
    );
  }

  function renderDiagnostics() {
    var page = document.querySelector('[data-page-panel="diagnostics"]');
    if (!page) return;
    var keys = Object.keys(sourceState);
    var ok = keys.filter(function (k) { return sourceState[k].ok; }).length;
    var failed = keys.length - ok;

    var total = page.querySelector('[data-x="trust"]'); if (total) total.textContent = ok + "/" + keys.length;
    var un = page.querySelector('[data-x="unavailable"]'); if (un) un.textContent = String(failed);
    var stale = page.querySelector('[data-x="stale"]'); if (stale) stale.textContent = "—";
    var err = page.querySelector('[data-x="errors"]'); if (err) err.textContent = String(failed);

    var map = {
      continuity: ["continuityHealth", "objects", "blockers", "inbox"],
      "research-rd1": ["researchRD1"],
      orchestrator: ["routes", "summary", "metrics"],
      testing: ["testingSummary", "testingHealth", "testingRunner"],
      hub: ["hubHealth"],
      scanner: [],
      "atlas-twin": []
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
      if (em[0]) em[0].textContent = count === states.length ? "ДОСТУПЕН" : (count ? "ЧАСТИЧНО" : "НЕДОСТУПЕН");
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

    pageBadge("diagnostics", failed ? (ok ? "warn" : "unavailable") : "live", failed ? (ok ? "ДАННЫЕ ЧАСТИЧНО" : "ИСТОЧНИКИ НЕДОСТУПНЫ") : "ИСТОЧНИКИ ДОСТУПНЫ");
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
      fetchJSON("continuityHealth", ENDPOINTS.continuityHealth)
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

      var routes = routesJSON && Array.isArray(routesJSON.routes) ? routesJSON.routes : [];
      var summary = summaryJSON && summaryJSON.summary ? summaryJSON.summary : null;
      var metrics = metricsJSON && metricsJSON.metrics ? metricsJSON.metrics : null;
      var depModel = dependencyModel(routes);

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
      renderDocuments(hubHealth);
      renderTesting(testingSummary, testingRunner);
      renderSignals(objects, blockers, inbox, testingSummary);
      renderFoundation(continuityHealth, hubHealth, objects, inbox);
      renderDiagnostics();

      renderResearch(objects, blockers).then(function () {
        renderDiagnostics();
        updateTrust();
        window.dispatchEvent(new CustomEvent("panel-v2-live-ready", { detail: window.__PANEL_V2_LIVE }));
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  setInterval(boot, REFRESH_MS);
})();
