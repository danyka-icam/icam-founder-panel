// Founder Panel v2 — Command Center modes
// Scope: READ ONLY. Renders five modes (Командный центр, Во времени, Связи и
// стратегии, Линии и объекты, Размещение) from the snapshot that live.js
// already fetched (window.__PANEL_V2_DATA). No extra requests, no new fields,
// no writes. Every link drawn here is one of:
//   - line → object: exact ID match (route.source_object_id / object_id === object.object_id)
//   - line → line:   explicit dependency fields (live.js explicitDependencies)
//   - shared object: two lines referencing the same object_id (structural, not causal)
//   - world → object: the object's own owning_branch / owner field
// Anything else is shown as "не доказано" / "нужна сверка".
(function () {
  "use strict";

  var H = null;
  var ui = { selected: null, lineFilter: "all", placementFilter: "all" };
  var M = null; // current model

  var MATERIAL = ["GATE_RESULT", "DECISION", "STATUS_CHANGE", "STAGE_CHANGE", "TEST_RESULT", "EXTERNAL_EVENT", "NEW_FILE"];
  var CLOSED_OBJECT = /^(CLOSED|ARCHIVED|DONE|CANCELLED|COMPLETED|RETIRED|DEPRECATED|INVALIDATED)$/;
  var WINDOW_DAYS = 60;
  var LANE_DAYS = 45;

  var STATE_META = {
    flow: { label: "В движении", hint: "движение за последние 7 дней, блокеров нет" },
    "return": { label: "Нужен возврат", hint: "нет движения 7+ дней или есть блокер" },
    critical: { label: "Отстаёт", hint: "нет движения 14+ дней, 2+ блокера или стоит при зависимых линиях" },
    unknown: { label: "Нет отметки движения", hint: "источник не передал дату последнего движения" },
    closed: { label: "Закрыта", hint: "статус маршрута закрыт" }
  };

  // ------------------------------------------------------------------ utils

  function E(v) { return H.esc(v); }
  function A(v) { return H.asArray(v); }
  function ok(name) { var s = M && M.sources && M.sources[name]; return !!(s && s.ok); }
  function upper(v) { return String(v == null ? "" : v).toUpperCase(); }

  function initials(name) {
    var words = String(name || "?").replace(/[·_\-–—]/g, " ").split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function titleOf(r) { return String(H.routeName(r)).split(" · ")[0]; }

  function timeLabel(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return "—";
    return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function hexPoints(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i - 90);
      pts.push((cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1));
    }
    return pts.join(" ");
  }

  function hexBadge(text, state, size) {
    return "<span class='cc-hex st-" + state + (size ? " " + size : "") + "'><svg viewBox='0 0 40 40' aria-hidden='true'>" +
      "<polygon points='" + hexPoints(20, 20, 18) + "'/></svg><b>" + E(text) + "</b></span>";
  }

  function unavailable(title, detail) {
    return "<div class='cc-unavailable'><b>" + E(title) + "</b><span>" + E(detail) + "</span></div>";
  }

  function empty(title, detail) {
    return "<div class='cc-empty'><b>" + E(title) + "</b>" + (detail ? "<span>" + E(detail) + "</span>" : "") + "</div>";
  }

  function sel(kind, key) { return " data-cc-select='" + E(kind + ":" + key) + "'"; }

  function isSelected(kind, key) {
    return ui.selected && ui.selected.kind === kind && ui.selected.key === String(key);
  }

  // ------------------------------------------------------------------ model

  function buildModel(d) {
    var routes = A(d.routes);
    var objects = A(d.objects && d.objects.items);
    var openBlockers = A(d.blockers && d.blockers.items).filter(function (b) {
      return !b.is_test && upper(b.status) !== "CLEARED";
    });
    var dep = H.dependencyModel(routes);

    var objById = {};
    objects.forEach(function (o) { if (o && o.object_id) objById[String(o.object_id)] = o; });

    var lines = routes.map(function (r, idx) {
      var key = H.routeKey(r);
      var objId = r.source_object_id || r.object_id ? String(r.source_object_id || r.object_id) : null;
      var obj = objId ? objById[objId] || null : null;
      var risk = H.riskInfo(r, dep);
      var closed = H.isClosed(r);
      var state = closed ? "closed" : (risk.level !== "stable" ? risk.level : (risk.stale == null ? "unknown" : "flow"));
      var rd1 = objId && d.rd1 ? d.rd1[objId] || null : null;
      var area = r.area && !/^(PROJECTS?|ПРОЕКТЫ?)$/i.test(String(r.area).trim()) ? String(r.area) : null;
      return {
        kind: "line", key: key, r: r, idx: idx,
        title: titleOf(r), objId: objId, obj: obj, objMissing: !!(objId && !obj),
        risk: risk, closed: closed, state: state, rd1: rd1, area: area,
        world: obj ? (obj.owning_branch || obj.owner || null) : null,
        waiting: !closed && !!r.ball_owner && !H.isFounderOwner(r.ball_owner),
        founderMove: !closed && !!r.ball_owner && H.isFounderOwner(r.ball_owner),
        next: r.next_move || (rd1 && (rd1.next_gate || rd1.next_move)) || null,
        nextSource: r.next_move ? "Оркестратор · next_move" : (rd1 && rd1.next_gate ? "RD1 · next_gate" : (rd1 && rd1.next_move ? "RD1 · next_move" : null)),
        upstream: [], downstream: [], bridges: [],
        objBlockers: objId ? openBlockers.filter(function (b) { return String(b.object_id || "") === objId; }) : []
      };
    });

    var lineByKey = {};
    lines.forEach(function (l) { lineByKey[l.key] = l; });
    dep.edges.forEach(function (e) {
      if (lineByKey[e.to] && lineByKey[e.from]) {
        lineByKey[e.to].upstream.push(e.from);
        lineByKey[e.from].downstream.push(e.to);
      }
    });

    var linesByObj = {};
    lines.forEach(function (l) {
      if (!l.objId) return;
      (linesByObj[l.objId] = linesByObj[l.objId] || []).push(l);
    });

    // Structural bridge: two lines point at the same canonical object. This is a
    // shared-identity fact, not a causal or strategic claim.
    var bridges = [];
    Object.keys(linesByObj).forEach(function (id) {
      var ls = linesByObj[id];
      for (var i = 0; i < ls.length; i++) {
        for (var j = i + 1; j < ls.length; j++) {
          bridges.push({ a: ls[i].key, b: ls[j].key, objId: id });
          ls[i].bridges.push(ls[j].key);
          ls[j].bridges.push(ls[i].key);
        }
      }
    });

    var inboxItems = A(d.inbox && d.inbox.needs_founder);
    // Without a current routes read, line membership cannot be checked at all.
    var routesRead = !!(d.sources && d.sources.routes && d.sources.routes.ok);

    var objs = objects.map(function (o) {
      var id = String(o.object_id || "");
      var ls = linesByObj[id] || [];
      var activeLines = ls.filter(function (l) { return !l.closed; });
      var closedObj = CLOSED_OBJECT.test(upper(o.declared_status));
      var founder = !!(o.needs_founder || o.needs_nika) || inboxItems.some(function (n) { return String(n.object_id || "") === id; });
      var placement;
      if (closedObj) placement = "archive";
      else if (!routesRead) placement = "unknown";
      else if (activeLines.length > 1) placement = "conflict";
      else if (ls.length >= 1) placement = "placed";
      else placement = "review";
      return {
        kind: "object", key: id, o: o, title: o.name || o.title || id || "без названия",
        lines: ls, activeLines: activeLines, closed: closedObj, founder: founder, placement: placement,
        world: o.owning_branch || o.owner || null,
        visible: activeLines.length > 0,
        blockers: openBlockers.filter(function (b) { return String(b.object_id || "") === id; }),
        rd1: d.rd1 ? d.rd1[id] || null : null
      };
    });
    var objByKey = {};
    objs.forEach(function (x) { objByKey[x.key] = x; });

    var active = lines.filter(function (l) { return !l.closed; });

    var worlds = {};
    objs.forEach(function (x) {
      var w = x.world || "Мир не указан";
      (worlds[w] = worlds[w] || []).push(x);
    });

    var events = [];
    objs.forEach(function (x) {
      if (!x.o.last_event_at) return;
      events.push({
        kind: "object", key: x.key, at: x.o.last_event_at, days: H.daysSince(x.o.last_event_at),
        title: x.title, world: x.world || "Мир не указан",
        what: MATERIAL.indexOf(upper(x.o.last_meaning_kind)) >= 0 ? H.signalKindRu(x.o.last_meaning_kind) : (x.o.last_meaning_kind ? H.humanCode(x.o.last_meaning_kind) : "событие"),
        material: MATERIAL.indexOf(upper(x.o.last_meaning_kind)) >= 0,
        summary: x.o.last_summary || "", placed: x.lines.length > 0
      });
    });
    lines.forEach(function (l) {
      if (!l.r.last_movement_at) return;
      events.push({
        kind: "line", key: l.key, at: l.r.last_movement_at, days: H.daysSince(l.r.last_movement_at),
        title: l.title, world: l.world || "Мир не указан", what: "движение по линии",
        material: false, summary: l.r.next_move || "", placed: true
      });
    });
    events.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });

    var ms = d.marketSignals;
    var msActivated = ms && ms.activation_state && ms.activation_state !== "NOT_ACTIVATED";

    return {
      d: d, sources: d.sources || {}, lines: lines, active: active, lineByKey: lineByKey,
      objs: objs, objByKey: objByKey, bridges: bridges, edges: dep.edges.filter(function (e) {
        return lineByKey[e.from] && lineByKey[e.to];
      }),
      openBlockers: openBlockers, inboxItems: inboxItems, worlds: worlds, events: events,
      dangling: lines.filter(function (l) { return l.objMissing && !l.closed; }),
      marketCount: msActivated ? A(ms.signals).length : null,
      marketState: ms ? ms.activation_state : null
    };
  }

  // ------------------------------------------------------------------ shared pieces

  function stateDot(state, label) {
    return "<span class='cc-state st-" + state + "'><i></i>" + E(label || STATE_META[state].label) + "</span>";
  }

  function readStamp() {
    var s = M.sources.routes;
    var keys = Object.keys(M.sources);
    var good = keys.filter(function (k) { return M.sources[k] && M.sources[k].ok; }).length;
    return "<div class='cc-stamp'><span class='cc-pulse " + (good === keys.length ? "ok" : good ? "warn" : "bad") + "'></span>" +
      "<span>Прочитано " + E(s && s.at ? timeLabel(s.at) : "—") + "</span>" +
      "<span class='cc-stamp-sep'>·</span><span>источников " + good + " / " + keys.length + "</span>" +
      "<a href='#diagnostics'>диагностика →</a></div>";
  }

  function stateBar(parts, total) {
    if (!total) return "<div class='cc-bar'><span class='none' style='width:100%'></span></div>";
    return "<div class='cc-bar'>" + parts.filter(function (p) { return p.n > 0; }).map(function (p) {
      return "<span class='st-" + p.cls + "' style='width:" + (p.n / total * 100).toFixed(1) + "%' title='" + E(p.label + ": " + p.n) + "'></span>";
    }).join("") + "</div>";
  }

  function lineRefs(keys) {
    return keys.map(function (k) {
      var l = M.lineByKey[k];
      return l ? "<button class='cc-ref'" + sel("line", l.key) + ">" + E(H.cut(l.title, 26)) + "</button>" : "";
    }).join("");
  }

  // ------------------------------------------------------------------ Командный центр

  function kpi(id, icon, label, value, detail, bar, href, tone) {
    return "<a class='cc-kpi " + (tone || "") + "' href='" + href + "' data-cc-kpi='" + id + "'>" +
      "<span class='cc-kpi-icon'>" + icon + "</span>" +
      "<span class='cc-kpi-body'><small>" + E(label) + "</small><strong>" + E(value) + "</strong><em>" + E(detail) + "</em>" + (bar || "") + "</span></a>";
  }

  function renderKPIs() {
    var routesOk = ok("routes");
    var act = M.active;
    var byState = { flow: 0, "return": 0, critical: 0, unknown: 0 };
    act.forEach(function (l) { byState[l.state] = (byState[l.state] || 0) + 1; });
    var parts = [
      { cls: "flow", n: byState.flow, label: STATE_META.flow.label },
      { cls: "unknown", n: byState.unknown, label: STATE_META.unknown.label },
      { cls: "return", n: byState["return"], label: STATE_META["return"].label },
      { cls: "critical", n: byState.critical, label: STATE_META.critical.label }
    ];
    var waiting = act.filter(function (l) { return l.waiting; });
    var risky = act.filter(function (l) { return l.state === "critical" || l.state === "return"; });
    var review = M.objs.filter(function (x) { return x.placement === "review" || x.placement === "conflict"; }).length + M.dangling.length;
    var recent = M.events.filter(function (e) { return e.days != null && e.days <= 7; });
    var declared = M.d.summary && M.d.summary.routes_active != null ? M.d.summary.routes_active : null;

    var html = "";
    html += routesOk ?
      kpi("active", "◈", "Активные линии", act.length,
        declared != null && Number(declared) !== act.length ? "сводка Оркестратора: " + declared : "маршруты Оркестратора в работе",
        stateBar(parts, act.length), "#lines", "") :
      kpi("active", "◈", "Активные линии", "Недоступно", "чтение маршрутов не удалось", "", "#diagnostics", "bad");
    html += routesOk ?
      kpi("waiting", "◷", "Линии в ожидании", waiting.length, "ход у внешнего владельца",
        stateBar([{ cls: "wait", n: waiting.length, label: "ждём" }, { cls: "none", n: act.length - waiting.length, label: "остальные" }], act.length),
        "#lines", waiting.length ? "wait" : "") :
      kpi("waiting", "◷", "Линии в ожидании", "Недоступно", "нет маршрутов", "", "#diagnostics", "bad");
    html += routesOk ?
      kpi("risk", "△", "Зоны риска", risky.length,
        ok("blockers") ? "открытых блокеров в Continuity: " + M.openBlockers.length : "блокеры Continuity недоступны",
        stateBar([{ cls: "critical", n: byState.critical, label: "отстаёт" }, { cls: "return", n: byState["return"], label: "возврат" }, { cls: "none", n: act.length - risky.length, label: "без риска" }], act.length),
        "#lines", risky.length ? "risk" : "") :
      kpi("risk", "△", "Зоны риска", "Недоступно", "нет маршрутов", "", "#diagnostics", "bad");
    var sigDetail = (ok("inbox") ? "решений Основателя: " + M.inboxItems.length : "inbox недоступен") + " · рынок: " +
      (M.marketCount != null ? M.marketCount : (M.marketState === "NOT_ACTIVATED" ? "не активирован" : "недоступен"));
    html += kpi("signals", "◉", "Новые сигналы",
      ok("inbox") || M.marketCount != null ? (ok("inbox") ? M.inboxItems.length : 0) + (M.marketCount || 0) : "Недоступно",
      sigDetail, "", "#signals", M.inboxItems.length ? "wait" : "");
    html += ok("objects") && routesOk ?
      kpi("review", "⌖", "Требуют сверки", review, "объекты без точной связи, конфликты, висячие ссылки",
        stateBar([{ cls: "return", n: review, label: "сверка" }, { cls: "flow", n: Math.max(0, M.objs.length - review), label: "прочие" }], Math.max(M.objs.length, review)),
        "#placement", review ? "wait" : "") :
      kpi("review", "⌖", "Требуют сверки", "Недоступно", ok("objects") ? "без маршрутов принадлежность не проверяется" : "реестр объектов не прочитан", "", "#diagnostics", "bad");
    html += (ok("objects") || routesOk) ?
      kpi("changes", "↻", "Изменения за 7 дней", recent.length, "события объектов и движения линий", sparkDays(), "#timeline", "") :
      kpi("changes", "↻", "Изменения за 7 дней", "Недоступно", "нет источников с датами", "", "#diagnostics", "bad");
    return html;
  }

  // Real per-day event counts over the last 14 days (not a trend line).
  function sparkDays() {
    var days = 14, counts = [];
    for (var i = 0; i < days; i++) counts.push(0);
    M.events.forEach(function (e) { if (e.days != null && e.days < days) counts[days - 1 - e.days] += 1; });
    var max = Math.max.apply(null, counts.concat([1]));
    return "<span class='cc-days' title='события по дням, 14 дней'>" + counts.map(function (c) {
      return "<i style='height:" + (c ? 20 + c / max * 80 : 6) + "%' class='" + (c ? "on" : "") + "'></i>";
    }).join("") + "</span>";
  }

  function lineCard(l) {
    var r = l.r;
    var blockersN = l.risk.blockers + l.objBlockers.length;
    var why = r.priority ? "приоритет в источнике: " + r.priority : (l.downstream.length ? "от неё явно зависят " + l.downstream.length + " линии" : "обоснование важности источником не передано");
    var where = [l.world ? "мир: " + l.world : null, l.area ? "область: " + H.humanCode(l.area) : null, l.objId ? l.objId : "без объекта"].filter(Boolean).join(" · ");
    return "<article class='cc-line st-" + l.state + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + " tabindex='0'>" +
      hexBadge(initials(l.title), l.state) +
      "<div class='cc-line-head'>" +
      "<div class='cc-line-id'><b>" + E(H.cut(l.title, 40)) + "</b><small>" + E(where) + "</small></div>" +
      "<div class='cc-line-state'>" + stateDot(l.state) + "<em>" + E(H.cut(H.humanCode(r.stage || r.status || "этап не передан"), 42)) + "</em></div>" +
      "<div class='cc-line-block' title='открытые блокеры: маршрут + объект'><small>Блокеры</small>" +
      (blockersN ? "<span class='cc-count risk'>" + blockersN + "</span>" : "<span class='cc-count ok'>0</span>") + "</div></div>" +
      "<div class='cc-line-cells'>" +
      "<div class='cc-line-col next'><small>Следующий переход</small><span>" + E(H.cut(l.next || "не передан источником", 90)) + "</span></div>" +
      "<div class='cc-line-col'><small>Ход у</small><span>" + E(r.ball_owner || "не назначен") + (l.waiting ? " <em class='wait'>· ждём</em>" : "") + "</span></div>" +
      "<div class='cc-line-col'><small>Условие движения</small><span>" + E(H.cut(r.review_condition || "не передано", 70)) + "</span></div>" +
      "</div>" +
      "<div class='cc-line-foot'><span class='cc-why'>" + E(why) + "</span>" +
      "<span class='cc-links'>" +
      (l.upstream.length ? "<i title='зависит от'>↑ " + l.upstream.length + "</i>" : "") +
      (l.downstream.length ? "<i title='от неё зависят'>↓ " + l.downstream.length + "</i>" : "") +
      (l.bridges.length ? "<i title='общий объект'>⇄ " + l.bridges.length + "</i>" : "") +
      (!l.upstream.length && !l.downstream.length && !l.bridges.length ? "<i class='muted'>явных связей нет</i>" : "") +
      "</span><span class='cc-move'>" + E(l.risk.stale == null ? "движение без даты" : "движение " + H.ago(r.last_movement_at)) + "</span></div>" +
      "</article>";
  }

  function renderFounderQueue() {
    if (!ok("inbox")) return unavailable("Входящие Основателя недоступны", "Панель не может подтвердить, какие решения ждут Основателя.");
    if (!M.inboxItems.length) return empty("Решений Основателя сейчас нет", "Founder inbox не содержит needs_founder.");
    return "<div class='cc-queue'>" + M.inboxItems.slice(0, 6).map(function (n) {
      var id = String(n.object_id || "");
      var x = M.objByKey[id];
      return "<div class='cc-queue-item'" + (x ? sel("object", id) : "") + ">" +
        "<span class='cc-queue-icon'>!</span><div><b>" + E(H.cut(n.title || "Требует решения", 80)) + "</b>" +
        "<small>" + E(H.cut(n.reason || n.issue_type || "причина не передана", 90)) + "</small>" +
        "<em>" + E(id || "объект не указан") + (x && x.lines.length ? " · линия: " + H.cut(x.lines[0].title, 22) : "") + "</em></div>" +
        "<span class='cc-queue-age'>" + E(H.ago(n.opened_at)) + "</span></div>";
    }).join("") + "</div>";
  }

  function renderRecentChanges(limit) {
    if (!ok("objects") && !ok("routes")) return unavailable("Нет источников с датами", "Изменения не выводятся из прошлых данных.");
    var rows = M.events.slice(0, limit || 7);
    if (!rows.length) return empty("Датированных событий нет", "Источники ответили, но не передали отметок времени.");
    return "<div class='cc-feed'>" + rows.map(function (e) {
      return "<div class='cc-feed-item " + (e.kind === "line" ? "line" : (e.material ? "material" : "")) + "'" + sel(e.kind, e.key) + ">" +
        "<i></i><div><b>" + E(H.cut(e.title, 40)) + "</b><small>" + E(e.what) + (e.summary ? " · " + H.cut(e.summary, 70) : "") + "</small></div>" +
        "<span>" + E(H.ago(e.at)) + "</span></div>";
    }).join("") + "</div>";
  }

  function renderLanes(lines) {
    if (!lines.length) return empty("Нет активных линий", "");
    var scaleNote = "<div class='cc-lane-axis'><span>−" + LANE_DAYS + " дн.</span><span>−30</span><span>−15</span><span class='now'>сейчас</span><span class='wait'>→ ожидание</span></div>";
    function x(days) { return days == null ? null : Math.max(0, 68 - Math.min(days, LANE_DAYS) / LANE_DAYS * 68); }
    return scaleNote + "<div class='cc-lanes'>" + lines.map(function (l) {
      var lx = x(l.risk.stale), ox = l.obj && l.obj.last_event_at ? x(H.daysSince(l.obj.last_event_at)) : null;
      var start = [lx, ox].filter(function (v) { return v != null; });
      var from = start.length ? Math.max.apply(null, start) : null;
      return "<div class='cc-lane " + "st-" + l.state + "'" + sel("line", l.key) + ">" +
        "<div class='cc-lane-name'>" + hexBadge(initials(l.title), l.state, "sm") + "<b>" + E(H.cut(l.title, 18)) + "</b></div>" +
        "<div class='cc-lane-track'>" +
        "<span class='cc-lane-now'></span>" +
        (from != null ? "<span class='cc-lane-live' style='left:" + from + "%;width:" + (68 - from) + "%'></span>" : "<span class='cc-lane-nodate'>дата движения не передана</span>") +
        (lx != null ? "<span class='cc-mark line' style='left:" + lx + "%' title='движение линии: " + E(H.ago(l.r.last_movement_at)) + "'></span>" : "") +
        (ox != null ? "<span class='cc-mark obj' style='left:" + ox + "%' title='событие объекта: " + E(H.ago(l.obj.last_event_at)) + "'></span>" : "") +
        (l.risk.stale != null && l.risk.stale > LANE_DAYS ? "<span class='cc-lane-older'>‹ " + l.risk.stale + " дн.</span>" : "") +
        "<span class='cc-lane-next " + (l.next ? "" : "none") + "' title='" + E(l.next || "следующий переход не передан") + "'>" +
        E(l.next ? H.cut(l.next, 34) : "переход не передан") + "</span>" +
        "</div></div>";
    }).join("") + "</div>" +
    "<div class='cc-legend'><span><i class='mk line'></i>движение линии</span><span><i class='mk obj'></i>последнее событие объекта</span>" +
    "<span><i class='mk next'></i>следующий переход (без даты — источник не передаёт срок)</span></div>";
  }

  function renderGraph(lines, opts) {
    opts = opts || {};
    if (!lines.length) return empty("Нет линий для карты", "");
    var W = 400, Hh = 300, cx = W / 2, cy = Hh / 2;
    var n = lines.length;
    var rx = n <= 2 ? 100 : 150, ry = n <= 2 ? 50 : 105;
    var pos = {};
    lines.forEach(function (l, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      pos[l.key] = { x: n === 1 ? cx : cx + rx * Math.cos(a), y: n === 1 ? cy : cy + ry * Math.sin(a), l: l };
    });
    var svg = "<svg class='cc-graph-svg' viewBox='0 0 " + W + " " + Hh + "' role='img' aria-label='Карта явных связей между линиями'>" +
      "<defs><marker id='ccArrow' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>" +
      "<path d='M0,0 L10,5 L0,10 z' class='cc-arrow-head'/></marker></defs>";
    M.edges.forEach(function (e) {
      var a = pos[e.from], b = pos[e.to];
      if (!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1, k = 34 / len;
      var hot = a.l.state === "critical" || a.l.state === "return";
      svg += "<line class='cc-edge dep" + (hot ? " hot" : "") + "' x1='" + (a.x + dx * k).toFixed(1) + "' y1='" + (a.y + dy * k).toFixed(1) +
        "' x2='" + (b.x - dx * k).toFixed(1) + "' y2='" + (b.y - dy * k).toFixed(1) + "' marker-end='url(#ccArrow)'/>";
    });
    M.bridges.forEach(function (br) {
      var a = pos[br.a], b = pos[br.b];
      if (!a || !b) return;
      svg += "<line class='cc-edge bridge' x1='" + a.x.toFixed(1) + "' y1='" + a.y.toFixed(1) + "' x2='" + b.x.toFixed(1) + "' y2='" + b.y.toFixed(1) + "'/>";
    });
    Object.keys(pos).forEach(function (k) {
      var p = pos[k], l = p.l;
      svg += "<g class='cc-node " + "st-" + l.state + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + " tabindex='0'>" +
        "<polygon class='cc-node-glow' points='" + hexPoints(p.x, p.y, 36) + "'/>" +
        "<polygon class='cc-node-hex' points='" + hexPoints(p.x, p.y, 30) + "'/>" +
        "<text x='" + p.x.toFixed(1) + "' y='" + (p.y + 4).toFixed(1) + "' text-anchor='middle'>" + E(H.cut(l.title, 10)) + "</text>" +
        (l.risk.blockers + l.objBlockers.length ? "<circle class='cc-node-alert' cx='" + (p.x + 24).toFixed(1) + "' cy='" + (p.y - 22).toFixed(1) + "' r='7'/>" +
          "<text class='cc-node-alert-t' x='" + (p.x + 24).toFixed(1) + "' y='" + (p.y - 19).toFixed(1) + "' text-anchor='middle'>!</text>" : "") +
        "</g>";
    });
    svg += "</svg>";
    var note = (!M.edges.length && !M.bridges.length) ?
      "<div class='cc-graph-note'>Источник не передаёт явных связей между этими линиями. Стрелки по догадке не рисуются.</div>" :
      "<div class='cc-graph-note'>Стрелка — явная зависимость из источника · пунктир — общий объект (структурная связь, не причинная).</div>";
    return "<div class='cc-graph'>" + svg + note + "</div>";
  }

  function renderAttention(lines) {
    var groups = [
      { state: "critical", title: "Критично", items: [] },
      { state: "return", title: "Требует возврата", items: [] },
      { state: "unknown", title: "Нужна сверка даты", items: [] },
      { state: "flow", title: "Стабильно", items: [] }
    ];
    lines.forEach(function (l) {
      groups.forEach(function (g) { if (g.state === l.state) g.items.push(l); });
    });
    return "<div class='cc-attn'>" + groups.map(function (g) {
      return "<div class='cc-attn-group st-" + g.state + "'><div class='cc-attn-head'><b>" + E(g.title) + "</b><span>" + g.items.length + "</span></div>" +
        (g.items.length ? g.items.slice(0, 4).map(function (l) {
          var reason = [];
          if (l.risk.stale != null && l.risk.stale >= H.STALE_DAYS) reason.push("без движения " + l.risk.stale + " дн.");
          if (l.risk.blockers) reason.push("блокеров " + l.risk.blockers);
          if (l.downstream.length) reason.push("задерживает " + l.downstream.length);
          if (l.state === "unknown") reason.push("дата движения не передана");
          return "<div class='cc-attn-item'" + sel("line", l.key) + ">" + hexBadge(initials(l.title), l.state, "xs") +
            "<span><b>" + E(H.cut(l.title, 22)) + "</b><small>" + E(reason.join(" · ") || "в движении") + "</small></span></div>";
        }).join("") : "<div class='cc-attn-none'>—</div>") + "</div>";
    }).join("") + "<div class='cc-foot-note'>Шкала — диагностика панели по давности движения и блокерам, не канонический приоритет Оркестратора.</div></div>";
  }

  function renderCommand(page) {
    var routesOk = ok("routes");
    var lines = M.active;
    page.querySelector("[data-cc='stamp']").innerHTML = readStamp();
    page.querySelector("[data-cc='kpis']").innerHTML = renderKPIs();
    page.querySelector("[data-cc='lines']").innerHTML = !routesOk ?
      unavailable("Источник маршрутов недоступен", "Линии не показываются по прошлым или демонстрационным данным.") :
      (lines.length ? "<div class='cc-line-list'>" + lines.map(lineCard).join("") + "</div>" +
        "<div class='cc-foot-note'>Порядок линий — порядок Оркестратора. Панель не создаёт собственный рейтинг.</div>" :
        empty("Оркестратор не отдал активных линий", ""));
    page.querySelector("[data-cc='founder']").innerHTML = renderFounderQueue();
    page.querySelector("[data-cc='changes']").innerHTML = renderRecentChanges(6);
    page.querySelector("[data-cc='lanes']").innerHTML = routesOk ? renderLanes(lines.slice(0, 10)) : unavailable("Нет маршрутов", "Траектории не строятся.");
    page.querySelector("[data-cc='graph']").innerHTML = routesOk ? renderGraph(lines.slice(0, 10)) : unavailable("Нет маршрутов", "Карта связей очищена.");
    page.querySelector("[data-cc='attention']").innerHTML = routesOk ? renderAttention(lines) : unavailable("Нет current state", "Шкала не строится.");
  }

  // ------------------------------------------------------------------ Во времени

  function renderTimeline(page) {
    page.querySelector("[data-cc='stamp']").innerHTML = readStamp();
    var box = page.querySelector("[data-cc='swim']");
    var tree = page.querySelector("[data-cc='tree']");
    var unplaced = page.querySelector("[data-cc='unplaced']");
    if (!ok("objects") && !ok("routes")) {
      box.innerHTML = tree.innerHTML = unplaced.innerHTML = unavailable("Источники недоступны", "Временная картина не собирается из прошлых данных.");
      return;
    }

    // swimlanes by world
    var worldNames = Object.keys(M.worlds).sort(function (a, b) { return a === "Мир не указан" ? 1 : b === "Мир не указан" ? -1 : a.localeCompare(b); });
    M.lines.forEach(function (l) { if (!l.world && worldNames.indexOf("Мир не указан") < 0) worldNames.push("Мир не указан"); });
    function x(days) { return Math.max(0, 80 - Math.min(days, WINDOW_DAYS) / WINDOW_DAYS * 80); }
    var ticks = "";
    for (var t = WINDOW_DAYS; t >= 0; t -= 15) {
      ticks += "<span" + (t === 0 ? " class='now'" : "") + " style='left:" + x(t) + "%'>" + (t === 0 ? "сейчас" : "−" + t + " дн.") + "</span>";
    }
    box.innerHTML = "<div class='cc-swim'><div class='cc-swim-axis'>" + ticks + "<span class='future' style='left:81%'>ожидание →</span></div>" +
      worldNames.map(function (w) {
        var evs = M.events.filter(function (e) { return e.world === w && e.days != null; });
        var waits = M.active.filter(function (l) { return (l.world || "Мир не указан") === w; });
        return "<div class='cc-swim-lane'><div class='cc-swim-name'><b>" + E(w) + "</b><small>" + evs.length + " событ. · " + waits.length + " лин.</small></div>" +
          "<div class='cc-swim-track'><span class='cc-swim-now' style='left:80%'></span>" +
          evs.map(function (e, i) {
            var cls = e.kind === "line" ? "line" : (e.material ? "material" : "obj");
            var older = e.days > WINDOW_DAYS;
            return "<span class='cc-dot " + cls + (older ? " older" : "") + (e.placed ? "" : " unplaced") + "' style='left:" + x(e.days) + "%;top:" + (18 + (i % 3) * 22) + "%'" +
              sel(e.kind, e.key) + " title='" + E(e.title + " · " + e.what + " · " + H.ago(e.at)) + "'></span>";
          }).join("") +
          waits.map(function (l, i) {
            return "<span class='cc-wait-chip " + "st-" + l.state + "' style='left:" + (82 + (i % 2) * 8) + "%;top:" + (14 + Math.floor(i / 2) % 3 * 26) + "%'" + sel("line", l.key) +
              " title='" + E(l.title + " → " + (l.next || "переход не передан")) + "'>" + E(initials(l.title)) + "</span>";
          }).join("") +
          "</div></div>";
      }).join("") +
      "</div><div class='cc-legend'><span><i class='mk material'></i>материальное событие объекта</span><span><i class='mk obj'></i>прочее событие объекта</span>" +
      "<span><i class='mk line'></i>движение линии</span><span><i class='mk unplaced'></i>событие вне линий</span><span><i class='mk next'></i>линия в ожидании перехода</span></div>";

    // hierarchy: company → world → line → object with past / present / waiting / next
    var worldsHTML = worldNames.map(function (w) {
      var ls = M.lines.filter(function (l) { return (l.world || "Мир не указан") === w && !l.closed; });
      var lonely = (M.worlds[w] || []).filter(function (x) { return !x.lines.length && !x.closed; });
      if (!ls.length && !lonely.length) return "";
      return "<div class='cc-world'><div class='cc-world-head'><span class='cc-world-dot'></span><b>" + E(w) + "</b>" +
        "<small>" + ls.length + " активн. лин. · " + (M.worlds[w] || []).length + " объект.</small></div>" +
        ls.map(function (l) {
          var o = l.obj;
          return "<div class='cc-flow " + "st-" + l.state + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + ">" +
            "<div class='cc-flow-name'>" + hexBadge(initials(l.title), l.state, "sm") + "<span><b>" + E(H.cut(l.title, 30)) + "</b><small>" + E(l.objId || "без объекта") + "</small></span></div>" +
            "<div class='cc-flow-step past'><small>Прошлое</small><span>" +
            E(o && o.last_event_at ? (o.last_summary ? H.cut(o.last_summary, 60) : H.humanCode(o.last_meaning_kind || "событие")) + " · " + H.ago(o.last_event_at) :
              (l.r.last_movement_at ? "движение " + H.ago(l.r.last_movement_at) : "история не передана")) + "</span></div>" +
            "<div class='cc-flow-step now'><small>Настоящее</small><span>" + E(H.humanCode(l.r.stage || l.r.status || "этап не передан")) + "</span>" + stateDot(l.state) + "</div>" +
            "<div class='cc-flow-step wait'><small>Ожидание</small><span>" + E(l.r.review_condition ? H.cut(l.r.review_condition, 60) : (l.waiting ? "ждём: " + l.r.ball_owner : "условие не передано")) + "</span></div>" +
            "<div class='cc-flow-step next'><small>Следующий переход</small><span>" + E(l.next ? H.cut(l.next, 60) : "не передан") + "</span></div>" +
            "</div>";
        }).join("") +
        (lonely.length ? "<div class='cc-world-lonely'><small>Объекты мира без линии:</small>" + lonely.slice(0, 8).map(function (x) {
          return "<button class='cc-ref'" + sel("object", x.key) + ">" + E(H.cut(x.title, 24)) + "</button>";
        }).join("") + (lonely.length > 8 ? "<span class='cc-more'>+" + (lonely.length - 8) + "</span>" : "") + "</div>" : "") +
        "</div>";
    }).join("");
    tree.innerHTML = "<div class='cc-company'><div class='cc-company-head'>" + hexBadge("IC", "flow") +
      "<span><b>ICAM · компания</b><small>" + M.active.length + " активн. линий · " + M.objs.length + " объектов · " + worldNames.length + " мир(ов)</small></span></div>" +
      (worldsHTML || empty("Нет активных линий и объектов", "")) + "</div>";

    var un = M.events.filter(function (e) { return e.kind === "object" && !e.placed; });
    unplaced.innerHTML = !ok("routes") ? unavailable("Маршруты недоступны", "Без текущих линий нельзя сказать, какие события не размещены.") : un.length ? "<div class='cc-feed'>" + un.slice(0, 10).map(function (e) {
      return "<div class='cc-feed-item unplaced'" + sel("object", e.key) + "><i></i><div><b>" + E(H.cut(e.title, 40)) + "</b><small>" +
        E(e.what + (e.summary ? " · " + H.cut(e.summary, 60) : "")) + "</small></div><span>" + E(H.ago(e.at)) + "</span></div>";
    }).join("") + "</div>" : empty("Неразмещённых событий нет", "Все датированные события объектов относятся к объектам с линией.");
  }

  // ------------------------------------------------------------------ Связи и стратегии

  function renderLinks(page) {
    page.querySelector("[data-cc='stamp']").innerHTML = readStamp();
    var mapBox = page.querySelector("[data-cc='linkmap']");
    if (!ok("routes") && !ok("objects")) {
      mapBox.innerHTML = unavailable("Источники недоступны", "Карта связей не строится.");
    } else {
      mapBox.innerHTML = layeredMap();
    }

    var proven = page.querySelector("[data-cc='proven']");
    var byOwner = {};
    M.active.forEach(function (l) { if (l.r.ball_owner) (byOwner[l.r.ball_owner] = byOwner[l.r.ball_owner] || []).push(l); });
    var shared = Object.keys(byOwner).filter(function (k) { return byOwner[k].length > 1; });
    var placedN = M.lines.filter(function (l) { return l.obj; }).length;
    var worldLinks = M.objs.filter(function (x) { return x.world; }).length;
    proven.innerHTML = "<div class='cc-proof'>" +
      proofRow("ok", "Линия → объект", placedN, "точное совпадение ID маршрута и объекта Continuity") +
      proofRow(M.edges.length ? "ok" : "none", "Линия → линия", M.edges.length, M.edges.length ? "явные dependency-поля маршрутов" : "источник не передаёт зависимостей между линиями") +
      proofRow(M.bridges.length ? "ok" : "none", "Общий объект", M.bridges.length, "две линии ссылаются на один object_id — структурная связь") +
      proofRow("ok", "Мир → объект", worldLinks, "поле owning_branch / owner самого объекта") +
      proofRow(M.dangling.length ? "warn" : "ok", "Висячие ссылки", M.dangling.length, "линия ссылается на объект, которого нет в реестре") +
      proofRow("no", "Причинные связи", "—", "ни одна проекция не передаёт causal-отношений; не рисуются") +
      "</div>";

    var impact = page.querySelector("[data-cc='impact']");
    var withDown = M.active.filter(function (l) { return l.downstream.length; });
    impact.innerHTML = withDown.length ? "<div class='cc-impact'>" + withDown.map(function (l) {
      return "<div class='cc-impact-row " + "st-" + l.state + "'" + sel("line", l.key) + ">" + hexBadge(initials(l.title), l.state, "sm") +
        "<div><b>Если остановится «" + E(H.cut(l.title, 30)) + "»</b><small>явно задержит:</small><div class='cc-refs'>" + lineRefs(l.downstream) + "</div></div></div>";
    }).join("") + "</div>" :
      empty("Влияние остановки не представлено", "Ни одна активная линия не объявляет зависимых линий явно. Панель не выводит влияние по догадке.");

    var strat = page.querySelector("[data-cc='strategy']");
    var areas = {};
    M.active.forEach(function (l) { if (l.area) (areas[l.area] = areas[l.area] || []).push(l); });
    var areaKeys = Object.keys(areas);
    strat.innerHTML = (areaKeys.length ? "<div class='cc-tracks'>" + areaKeys.map(function (a) {
      var ls = areas[a];
      return "<div class='cc-track'><div class='cc-track-head'><b>" + E(H.humanCode(a)) + "</b><small>поле area маршрутов · " + ls.length + " лин.</small></div>" +
        "<div class='cc-track-path'>" + ls.map(function (l, i) {
          return (i ? "<span class='cc-track-sep'></span>" : "") + "<button class='cc-track-node " + "st-" + l.state + "'" + sel("line", l.key) + ">" + E(H.cut(l.title, 18)) + "</button>";
        }).join("") + "</div></div>";
    }).join("") + "</div>" : empty("Стратегические траектории не представлены", "Маршруты не передают поле области (area) с содержательным значением.")) +
      "<div class='cc-foot-note'>Группировка по area — это объявленная источником область, а не выведенная стратегия. Порядок внутри — порядок Оркестратора.</div>";

    var res = page.querySelector("[data-cc='resources']");
    res.innerHTML = "<div class='cc-proof'>" +
      proofRow("no", "Капитал", "—", "ни одна текущая проекция не передаёт денежных данных") +
      proofRow(shared.length ? "ok" : "none", "Общий владелец хода", shared.length, shared.length ? "один ball_owner ведёт несколько активных линий" : "пересечений по владельцу хода нет") +
      "</div>" +
      (shared.length ? "<div class='cc-owner-list'>" + shared.map(function (o) {
        return "<div class='cc-owner'><b>" + E(o) + "</b><div class='cc-refs'>" + lineRefs(byOwner[o].map(function (l) { return l.key; })) + "</div></div>";
      }).join("") + "</div>" : "");
  }

  function proofRow(kind, label, n, detail) {
    var icon = { ok: "✓", warn: "!", no: "✕", none: "○" }[kind];
    return "<div class='cc-proof-row " + kind + "'><span class='cc-proof-icon'>" + icon + "</span><b>" + E(label) + "</b><em>" + E(n) + "</em><small>" + E(detail) + "</small></div>";
  }

  function layeredMap() {
    var worlds = Object.keys(M.worlds).filter(function (w) {
      return M.worlds[w].some(function (x) { return !x.closed; });
    }).sort();
    var lines = M.active;
    var objs = M.objs.filter(function (x) { return !x.closed; });
    var rowH = 34, top = 44;
    var rows = Math.max(worlds.length, lines.length, objs.length, 1);
    var Wd = 1000, Ht = top + rows * rowH + 20;
    var colX = { world: 110, line: 470, obj: 840 };
    function spread(list) {
      var span = rows * rowH, step = list.length ? span / list.length : 0;
      var out = {};
      list.forEach(function (k, i) { out[k] = top + step * i + step / 2; });
      return out;
    }
    var wy = spread(worlds);
    var ly = spread(lines.map(function (l) { return l.key; }));
    var oy = spread(objs.map(function (x) { return x.key; }));

    var s = "<svg class='cc-layer-svg' viewBox='0 0 " + Wd + " " + Ht + "' role='img' aria-label='Миры, линии и объекты с доказанными связями'>" +
      "<defs><marker id='ccArrow2' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>" +
      "<path d='M0,0 L10,5 L0,10 z' class='cc-arrow-head'/></marker></defs>" +
      "<text class='cc-layer-h' x='" + colX.world + "' y='22' text-anchor='middle'>МИРЫ</text>" +
      "<text class='cc-layer-h' x='" + colX.line + "' y='22' text-anchor='middle'>ЛИНИИ</text>" +
      "<text class='cc-layer-h' x='" + colX.obj + "' y='22' text-anchor='middle'>ОБЪЕКТЫ</text>";

    // world → object (object's own owning_branch)
    objs.forEach(function (x) {
      if (!x.world || wy[x.world] == null) return;
      s += curve(colX.world + 70, wy[x.world], colX.obj - 90, oy[x.key], "cc-edge world");
    });
    // line → object (exact ID)
    lines.forEach(function (l) {
      if (!l.obj || oy[l.objId] == null) return;
      s += curve(colX.line + 90, ly[l.key], colX.obj - 90, oy[l.objId], "cc-edge own st-" + l.state);
    });
    // line → line explicit deps as arcs on the left of the line column
    M.edges.forEach(function (e) {
      if (ly[e.from] == null || ly[e.to] == null) return;
      var y1 = ly[e.from], y2 = ly[e.to], bend = colX.line - 110 - Math.min(120, Math.abs(y2 - y1) * 0.35);
      s += "<path class='cc-edge dep' d='M" + (colX.line - 90) + "," + y1 + " C" + bend + "," + y1 + " " + bend + "," + y2 + " " + (colX.line - 90) + "," + y2 + "' marker-end='url(#ccArrow2)'/>";
    });
    M.bridges.forEach(function (b) {
      if (ly[b.a] == null || ly[b.b] == null) return;
      var y1 = ly[b.a], y2 = ly[b.b], bend = colX.line + 150 + Math.min(80, Math.abs(y2 - y1) * 0.3);
      s += "<path class='cc-edge bridge' d='M" + (colX.line + 90) + "," + y1 + " C" + bend + "," + y1 + " " + bend + "," + y2 + " " + (colX.line + 90) + "," + y2 + "'/>";
    });

    worlds.forEach(function (w) {
      s += "<g class='cc-lnode world'><rect x='" + (colX.world - 70) + "' y='" + (wy[w] - 13) + "' width='140' height='26' rx='13'/>" +
        "<text x='" + colX.world + "' y='" + (wy[w] + 4) + "' text-anchor='middle'>" + E(H.cut(w, 20)) + "</text></g>";
    });
    lines.forEach(function (l) {
      var y = ly[l.key];
      s += "<g class='cc-lnode line " + "st-" + l.state + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + " tabindex='0'>" +
        "<rect x='" + (colX.line - 90) + "' y='" + (y - 13) + "' width='180' height='26' rx='7'/>" +
        "<polygon points='" + hexPoints(colX.line - 76, y, 8) + "'/>" +
        "<text x='" + (colX.line - 62) + "' y='" + (y + 4) + "'>" + E(H.cut(l.title, 22)) + "</text></g>";
    });
    objs.forEach(function (x) {
      var y = oy[x.key];
      s += "<g class='cc-lnode obj " + "pl-" + x.placement + (isSelected("object", x.key) ? " selected" : "") + "'" + sel("object", x.key) + " tabindex='0'>" +
        "<rect x='" + (colX.obj - 90) + "' y='" + (y - 13) + "' width='180' height='26' rx='13'/>" +
        "<circle cx='" + (colX.obj - 76) + "' cy='" + y + "' r='4'/>" +
        "<text x='" + (colX.obj - 66) + "' y='" + (y + 4) + "'>" + E(H.cut(x.title, 21)) + "</text></g>";
    });
    s += "</svg>";
    return "<div class='cc-layer-wrap'>" + s + "</div>" +
      "<div class='cc-legend'><span><i class='ln own'></i>линия → объект (точный ID)</span><span><i class='ln dep'></i>явная зависимость</span>" +
      "<span><i class='ln bridge'></i>общий объект</span><span><i class='ln world'></i>объект принадлежит миру</span><span><i class='mk unplaced'></i>объект требует сверки</span></div>";
  }

  function curve(x1, y1, x2, y2, cls) {
    var mx = (x1 + x2) / 2;
    return "<path class='" + cls + "' d='M" + x1 + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + x2 + "," + y2 + "'/>";
  }

  // ------------------------------------------------------------------ Линии и объекты

  var LINE_FILTERS = [
    { id: "all", label: "Все активные", test: function (l) { return !l.closed; } },
    { id: "waiting", label: "Ждём", test: function (l) { return l.waiting; } },
    { id: "risk", label: "Риск", test: function (l) { return l.state === "critical" || l.state === "return"; } },
    { id: "unknown", label: "Без даты", test: function (l) { return l.state === "unknown"; } },
    { id: "closed", label: "Закрытые", test: function (l) { return l.closed; } }
  ];

  function renderLinesPage(page) {
    page.querySelector("[data-cc='stamp']").innerHTML = readStamp();
    var f = LINE_FILTERS.filter(function (x) { return x.id === ui.lineFilter; })[0] || LINE_FILTERS[0];
    page.querySelector("[data-cc='line-filters']").innerHTML = LINE_FILTERS.map(function (x) {
      var n = M.lines.filter(x.test).length;
      return "<button class='cc-chip" + (x.id === f.id ? " active" : "") + "' data-cc-line-filter='" + x.id + "'>" + E(x.label) + " <em>" + n + "</em></button>";
    }).join("");
    var ls = M.lines.filter(f.test);
    page.querySelector("[data-cc='line-grid']").innerHTML = !ok("routes") ?
      unavailable("Источник маршрутов недоступен", "Линии не показываются по прошлым данным.") :
      (ls.length ? "<div class='cc-line-list'>" + ls.map(lineCard).join("") + "</div>" : empty("Нет линий в этом срезе", ""));

    var objBox = page.querySelector("[data-cc='objects']");
    if (!ok("objects")) { objBox.innerHTML = unavailable("Реестр объектов недоступен", "Объекты не показываются по прошлым данным."); return; }
    var names = Object.keys(M.worlds).sort();
    objBox.innerHTML = names.length ? names.map(function (w) {
      var xs = M.worlds[w];
      return "<div class='cc-objgroup'><div class='cc-world-head'><span class='cc-world-dot'></span><b>" + E(w) + "</b><small>" + xs.length + " объект.</small></div>" +
        "<div class='cc-objgrid'>" + xs.map(objectTile).join("") + "</div></div>";
    }).join("") : empty("Реестр пуст", "Continuity ответил без объектов.");
  }

  function objectTile(x) {
    var o = x.o;
    return "<button class='cc-obj " + "pl-" + x.placement + (isSelected("object", x.key) ? " selected" : "") + "'" + sel("object", x.key) + ">" +
      "<span class='cc-obj-top'><b>" + E(H.cut(x.title, 30)) + "</b>" + (x.founder ? "<i class='cc-flag founder'>Основатель</i>" : "") + "</span>" +
      "<small>" + E(x.key) + " · " + E(H.ruStatus(o.declared_status)) + "</small>" +
      "<span class='cc-obj-meta'><em>" + E(x.lines.length ? "линия: " + H.cut(x.lines[0].title, 18) + (x.lines.length > 1 ? " +" + (x.lines.length - 1) : "") : "без линии") + "</em>" +
      (x.blockers.length ? "<em class='risk'>блокеров " + x.blockers.length + "</em>" : "") +
      "<em>" + E(H.ago(o.last_event_at)) + "</em></span></button>";
  }

  // ------------------------------------------------------------------ Размещение

  var PLACEMENT_COLS = [
    { id: "placed", title: "Размещены", hint: "точная связь линии и объекта по ID" },
    { id: "candidate", title: "Кандидат на точную связь", hint: "безопасная связь-кандидат из слоя допуска" },
    { id: "review", title: "Требуют сверки", hint: "незакрытый объект, ни одна линия на него не ссылается" },
    { id: "conflict", title: "Конфликты", hint: "несколько активных линий на объект или ссылка на отсутствующий объект" },
    { id: "archive", title: "Архив / история", hint: "закрытый статус объекта или закрытая линия" }
  ];

  function renderPlacement(page) {
    page.querySelector("[data-cc='stamp']").innerHTML = readStamp();
    var board = page.querySelector("[data-cc='placement']");
    if (!ok("objects") || !ok("routes")) {
      page.querySelector("[data-cc='placement-sum']").innerHTML = "";
      board.innerHTML = unavailable(ok("objects") ? "Источник маршрутов недоступен" : "Реестр объектов недоступен",
        "Размещение вычисляется только по текущим линиям и текущему реестру — прошлые данные не подставляются.");
      return;
    }
    var closedLines = M.lines.filter(function (l) { return l.closed; });
    var counts = {};
    PLACEMENT_COLS.forEach(function (c) { counts[c.id] = M.objs.filter(function (x) { return x.placement === c.id; }).length; });
    counts.conflict += M.dangling.length;
    counts.archive += closedLines.length;

    page.querySelector("[data-cc='placement-sum']").innerHTML = PLACEMENT_COLS.map(function (c) {
      return "<div class='cc-psum pl-" + c.id + "'><strong>" + (c.id === "candidate" ? "—" : counts[c.id]) + "</strong><span>" + E(c.title) + "</span></div>";
    }).join("");

    board.innerHTML = PLACEMENT_COLS.map(function (c) {
      var body;
      if (c.id === "candidate") {
        body = empty("Слой допуска не подключён", "В текущих проекциях нет источника Portfolio Admission. Кандидаты не вычисляются по сходству названий — только точные ID.");
      } else {
        var xs = M.objs.filter(function (x) { return x.placement === c.id; });
        var cards = xs.map(placementCard);
        if (c.id === "conflict") cards = cards.concat(M.dangling.map(function (l) {
          return "<div class='cc-pcard pl-conflict'" + sel("line", l.key) + "><b>" + E(H.cut(l.title, 30)) + "</b>" +
            "<small>линия ссылается на " + E(l.objId) + ", которого нет в реестре</small>" +
            "<div class='cc-pflags'><span class='no'>объект не найден</span><span class='yes'>линия на карте</span></div></div>";
        }));
        if (c.id === "archive") cards = cards.concat(closedLines.map(function (l) {
          return "<div class='cc-pcard pl-archive'" + sel("line", l.key) + "><b>" + E(H.cut(l.title, 30)) + "</b><small>закрытая линия · " + E(H.humanCode(l.r.status)) + "</small></div>";
        }));
        body = cards.length ? cards.join("") : empty("Пусто", "");
      }
      return "<section class='cc-pcol pl-" + c.id + "'><header><b>" + E(c.title) + "</b><small>" + E(c.hint) + "</small></header><div class='cc-pcol-body'>" + body + "</div></section>";
    }).join("");
  }

  function placementCard(x) {
    var member = x.lines.length > 0;
    var visibleWhy = x.visible ? "видим через активную линию" : (member ? "линия закрыта — на карте не видим" : "на карте не видим");
    return "<div class='cc-pcard " + "pl-" + x.placement + (isSelected("object", x.key) ? " selected" : "") + "'" + sel("object", x.key) + ">" +
      "<b>" + E(H.cut(x.title, 32)) + "</b><small>" + E(x.key) + " · " + E(H.ruStatus(x.o.declared_status)) + (x.world ? " · " + x.world : "") + "</small>" +
      (x.placement === "conflict" ? "<small class='warn'>ссылаются " + x.activeLines.length + " активные линии — не обязательно ошибка, нужна сверка</small>" : "") +
      "<div class='cc-pflags'><span class='" + (member ? "yes" : "no") + "'>" + (member ? "принадлежит линии" : "линии нет") + "</span>" +
      "<span class='" + (x.visible ? "yes" : "no") + "'>" + E(visibleWhy) + "</span></div></div>";
  }

  // ------------------------------------------------------------------ Inspector

  function section(title, body) {
    return "<section class='cc-insp-sec'><h4>" + E(title) + "</h4>" + body + "</section>";
  }

  function ceilingRow(kind, text) {
    var icon = { ok: "✓", warn: "!", no: "✕", info: "i" }[kind];
    return "<li class='" + kind + "'><span>" + icon + "</span>" + E(text) + "</li>";
  }

  function inspectLine(l) {
    var r = l.r;
    var blockers = A(r.blockers).map(function (b) { return typeof b === "object" ? (b.title || b.blocker || b.id || "блокер") : String(b); });
    var objBlockers = l.objBlockers.map(function (b) { return (b.title || b.blocker || "открытый блокер") + " · объект " + (b.object_id || ""); });
    var explain = [];
    explain.push("Линия «" + l.title + "» " + (r.stage || r.status ? "сейчас на этапе «" + H.humanCode(r.stage || r.status) + "»." : "не передаёт этап."));
    explain.push(l.risk.stale == null ? "Дата последнего движения источником не передана." : "Последнее движение — " + H.ago(r.last_movement_at) + ".");
    explain.push(!r.ball_owner ? "Владелец хода не назначен." : (l.waiting ? "Ход у «" + r.ball_owner + "» — система ждёт его действия." : "Ход у Основателя."));
    if (l.risk.blockers || l.objBlockers.length) explain.push("Открытых блокеров: " + (l.risk.blockers + l.objBlockers.length) + ".");
    if (l.downstream.length) explain.push("От неё явно зависят " + l.downstream.length + " линии — остановка задержит их.");
    if (l.upstream.length) explain.push("Сама зависит от " + l.upstream.length + " линии.");

    var hist = [];
    if (l.obj && l.obj.last_event_at) hist.push("<li><b>" + E(H.ago(l.obj.last_event_at)) + "</b>" + E((l.obj.last_meaning_kind ? H.signalKindRu(l.obj.last_meaning_kind) : "событие объекта") + (l.obj.last_summary ? " — " + H.cut(l.obj.last_summary, 110) : "")) + "</li>");
    if (r.last_movement_at) hist.push("<li><b>" + E(H.ago(r.last_movement_at)) + "</b>движение по линии в Оркестраторе</li>");

    var ceiling = [
      ceilingRow("ok", "Этап, ход и условие — из Оркестратора (observer/routes)"),
      l.obj ? ceilingRow("ok", "Связь с объектом " + l.objId + " — точное совпадение ID") :
        (l.objMissing ? ceilingRow("warn", "Объект " + l.objId + " не найден в реестре — нужна сверка") : ceilingRow("warn", "Линия не ссылается на объект Continuity")),
      ceilingRow(l.upstream.length || l.downstream.length ? "ok" : "info", l.upstream.length || l.downstream.length ? "Зависимости — только явные поля источника" : "Явных зависимостей нет; по догадке не строятся"),
      ceilingRow("no", "Причинное влияние на другие линии — не доказано"),
      ceilingRow("warn", "История — только последнее событие; полного журнала в проекции нет"),
      ceilingRow("info", "Цвет состояния — диагностика панели, не канонический приоритет")
    ];

    var step = r.next_move ? { text: r.next_move, src: "Оркестратор · next_move" } :
      (l.rd1 && l.rd1.next_move ? { text: l.rd1.next_move, src: "RD1 · next_move" } :
        { text: "Источник не передал следующий ход. Минимальный шаг — сверить линию с владельцем хода и зафиксировать next_move в Оркестраторе.", src: "рекомендация панели: нужна сверка" });

    return "<div class='cc-insp-head'>" + hexBadge(initials(l.title), l.state, "lg") +
      "<div><h3>" + E(l.title) + "</h3><small>Линия Оркестратора" + (l.area ? " · " + E(H.humanCode(l.area)) : "") + "</small></div></div>" +
      section("Где в структуре", "<div class='cc-crumbs'><span>ICAM</span><i>›</i><span>" + E(l.world || "мир не указан") + "</span><i>›</i><span class='cur'>" + E(H.cut(l.title, 22)) + "</span><i>›</i><span>" + E(l.objId || "без объекта") + "</span></div>") +
      section("Текущее состояние", "<div class='cc-insp-state " + "st-" + l.state + "'>" + stateDot(l.state) +
        "<small>" + E(STATE_META[l.state].hint) + "</small><em>" + E(H.humanCode(r.stage || r.status || "этап не передан")) + "</em></div>") +
      section("Человеческим языком", "<p>" + E(explain.join(" ")) + "</p>") +
      section("Почему важна", "<p>" + E(r.priority ? "Приоритет в источнике: " + r.priority + "." : "Источник не передаёт обоснование важности.") +
        (l.downstream.length ? " " + E("Её остановка явно задержит " + l.downstream.length + " линии.") : "") + "</p>") +
      section("Недавняя история", hist.length ? "<ul class='cc-hist'>" + hist.join("") + "</ul>" : "<p class='muted'>Датированных событий нет.</p>") +
      section("Что система ждёт", "<p>" + E(r.review_condition || (l.waiting ? "Действия от «" + r.ball_owner + "»." : "Условие не передано.")) + "</p>" +
        (l.rd1 && l.rd1.next_gate ? "<p class='muted'>RD1 · следующий гейт: " + E(l.rd1.next_gate) + "</p>" : "")) +
      section("Следующий переход", "<p>" + E(l.next || "Не передан источником.") + "</p>" + (l.nextSource ? "<p class='muted'>" + E(l.nextSource) + "</p>" : "")) +
      section("Блокеры", blockers.length || objBlockers.length ?
        "<ul class='cc-blockers'>" + blockers.concat(objBlockers).map(function (b) { return "<li>" + E(H.cut(b, 110)) + "</li>"; }).join("") + "</ul>" :
        (l.risk.blockers ? "<p>Источник сообщает " + l.risk.blockers + " блокер(а) без описания.</p>" : "<p class='muted'>Открытых блокеров нет.</p>")) +
      section("Связи", (l.upstream.length ? "<small>Зависит от</small><div class='cc-refs'>" + lineRefs(l.upstream) + "</div>" : "") +
        (l.downstream.length ? "<small>От неё зависят</small><div class='cc-refs'>" + lineRefs(l.downstream) + "</div>" : "") +
        (l.bridges.length ? "<small>Общий объект с</small><div class='cc-refs'>" + lineRefs(l.bridges) + "</div>" : "") +
        (l.obj ? "<small>Объект</small><div class='cc-refs'><button class='cc-ref'" + sel("object", l.objId) + ">" + E(H.cut(l.obj.name || l.objId, 26)) + "</button></div>" : "") +
        (!l.upstream.length && !l.downstream.length && !l.bridges.length && !l.obj ? "<p class='muted'>Доказанных связей нет.</p>" : "")) +
      section("Доказательный потолок", "<ul class='cc-ceiling'>" + ceiling.join("") + "</ul>") +
      "<div class='cc-insp-step'><h4>Минимальный следующий шаг</h4><p>" + E(step.text) + "</p><small>" + E(step.src) + "</small></div>" +
      "<div class='cc-insp-nav'><a href='#timeline'>Во времени →</a><a href='#links'>Связи →</a></div>";
  }

  function inspectObject(x) {
    var o = x.o;
    var explain = [];
    explain.push("Объект «" + x.title + "» (" + x.key + ") в реестре Continuity со статусом «" + H.ruStatus(o.declared_status) + "».");
    if (x.placement === "unknown") explain.push("Принадлежность к линии не проверена: источник маршрутов недоступен.");
    else explain.push(x.lines.length ? "Принадлежит линии «" + x.lines[0].title + "»" + (x.lines.length > 1 ? " и ещё " + (x.lines.length - 1) : "") + "." : "Ни одна линия Оркестратора на него не ссылается.");
    if (x.placement !== "unknown") explain.push(x.visible ? "Виден на главной карте через активную линию." : "На главной карте не виден.");
    if (x.founder) explain.push("Помечен как требующий Основателя.");
    if (x.blockers.length) explain.push("Открытых блокеров: " + x.blockers.length + ".");
    var placementLabel = { placed: "Размещён", review: "Требует сверки", conflict: "Конфликт / сверка", archive: "Архив", unknown: "не проверяется — маршруты недоступны" }[x.placement];
    return "<div class='cc-insp-head'><span class='cc-obj-badge " + "pl-" + x.placement + "'>" + E(initials(x.title)) + "</span>" +
      "<div><h3>" + E(x.title) + "</h3><small>Объект Continuity · " + E(x.key) + "</small></div></div>" +
      section("Где в структуре", "<div class='cc-crumbs'><span>ICAM</span><i>›</i><span>" + E(x.world || "мир не указан") + "</span><i>›</i><span>" +
        E(x.lines.length ? H.cut(x.lines[0].title, 20) : "без линии") + "</span><i>›</i><span class='cur'>" + E(x.key) + "</span></div>") +
      section("Текущее состояние", "<div class='cc-insp-state'><span class='cc-state " + (x.closed ? "st-closed" : "st-flow") + "'><i></i>" + E(H.ruStatus(o.declared_status)) + "</span>" +
        "<small>размещение: " + E(placementLabel) + "</small></div>") +
      section("Человеческим языком", "<p>" + E(explain.join(" ")) + "</p>") +
      section("Недавняя история", o.last_event_at ? "<ul class='cc-hist'><li><b>" + E(H.ago(o.last_event_at)) + "</b>" +
        E((o.last_meaning_kind ? H.signalKindRu(o.last_meaning_kind) : "событие") + (o.last_summary ? " — " + H.cut(o.last_summary, 120) : "")) + "</li></ul>" : "<p class='muted'>Событий нет — last_event_at не передан.</p>") +
      section("Следующий переход", "<p>" + E(x.rd1 && (x.rd1.next_gate || x.rd1.next_move) || (x.lines[0] && x.lines[0].next) || "Не передан источником.") + "</p>") +
      section("Блокеры", x.blockers.length ? "<ul class='cc-blockers'>" + x.blockers.map(function (b) {
        return "<li>" + E(H.cut(b.title || b.blocker || "открытый блокер", 110)) + " · " + E(b.status || "открыт") + "</li>";
      }).join("") + "</ul>" : "<p class='muted'>Открытых нетестовых блокеров нет.</p>") +
      section("Связи", x.lines.length ? "<small>Линии</small><div class='cc-refs'>" + lineRefs(x.lines.map(function (l) { return l.key; })) + "</div>" : "<p class='muted'>Линий нет.</p>") +
      section("Доказательный потолок", "<ul class='cc-ceiling'>" +
        ceilingRow("ok", "Идентичность и статус — реестр Continuity") +
        ceilingRow(x.lines.length ? "ok" : "warn", x.lines.length ? "Принадлежность линии — точное совпадение ID" : "Принадлежность линии не доказана — нужна сверка") +
        ceilingRow(x.world ? "ok" : "warn", x.world ? "Мир — поле owning_branch / owner объекта" : "Мир объекта не указан") +
        ceilingRow("no", "Кандидаты по сходству названий не вычисляются") + "</ul>") +
      "<div class='cc-insp-step'><h4>Минимальный следующий шаг</h4><p>" + E(
        x.placement === "review" ? "Сверить, к какой линии относится объект, и зафиксировать связь в источнике." :
        x.placement === "conflict" ? "Проверить, почему на объект ссылаются несколько активных линий." :
        x.placement === "archive" ? "Действий не требуется: объект в архиве." :
        (x.lines[0] && x.lines[0].next) || "Следующий ход не передан источником.") + "</p><small>рекомендация панели по размещению</small></div>" +
      "<div class='cc-insp-nav'><a href='#placement'>Размещение →</a><a href='#timeline'>Во времени →</a></div>";
  }

  function renderInspectors() {
    var html;
    var s = ui.selected;
    if (s && s.kind === "line" && M.lineByKey[s.key]) html = inspectLine(M.lineByKey[s.key]);
    else if (s && s.kind === "object" && M.objByKey[s.key]) html = inspectObject(M.objByKey[s.key]);
    else html = "<div class='cc-insp-idle'><b>Инспектор</b><span>Выберите линию или объект — здесь появятся состояние, история, связи и доказательный потолок.</span></div>";
    document.querySelectorAll("[data-cc-inspector]").forEach(function (el) {
      el.innerHTML = "<div class='cc-insp-title'><span>" + (s && s.kind === "object" ? "Инспектор объекта" : "Инспектор линии") + "</span></div>" + html;
    });
  }

  // ------------------------------------------------------------------ wiring

  function defaultSelection() {
    if (ui.selected && ((ui.selected.kind === "line" && M.lineByKey[ui.selected.key]) || (ui.selected.kind === "object" && M.objByKey[ui.selected.key]))) return;
    var pick = M.active.filter(function (l) { return l.state === "critical"; })[0] ||
      M.active.filter(function (l) { return l.state === "return"; })[0] || M.active[0];
    ui.selected = pick ? { kind: "line", key: pick.key } : null;
  }

  var RENDERERS = {
    command: renderCommand,
    timeline: renderTimeline,
    links: renderLinks,
    lines: renderLinesPage,
    placement: renderPlacement
  };

  function renderAll() {
    if (!M) return;
    Object.keys(RENDERERS).forEach(function (k) {
      var page = document.querySelector('[data-page-panel="' + k + '"]');
      if (!page) return;
      try { RENDERERS[k](page); } catch (err) {
        var body = page.querySelector("[data-cc-body]");
        if (body) body.insertAdjacentHTML("afterbegin", unavailable("Ошибка отрисовки режима", String(err && err.message || err)));
        if (window.console) console.warn("command-center:", k, err);
      }
    });
    renderInspectors();
    var navCount = document.querySelector("[data-cc-nav-count='placement']");
    if (navCount && !ok("routes")) navCount.textContent = "";
    else if (navCount) {
      var n = M.objs.filter(function (x) { return x.placement === "review" || x.placement === "conflict"; }).length + M.dangling.length;
      navCount.textContent = n ? String(n) : "";
    }
  }

  function onData() {
    H = window.__PANEL_V2_HELPERS;
    var d = window.__PANEL_V2_DATA;
    if (!H || !d) return;
    M = buildModel(d);
    defaultSelection();
    renderAll();
  }

  document.addEventListener("click", function (e) {
    var f = e.target.closest("[data-cc-line-filter]");
    if (f) { ui.lineFilter = f.getAttribute("data-cc-line-filter"); renderAll(); return; }
    var t = e.target.closest("[data-cc-select]");
    if (!t || !M) return;
    var v = t.getAttribute("data-cc-select"), i = v.indexOf(":");
    ui.selected = { kind: v.slice(0, i), key: v.slice(i + 1) };
    renderAll();
    var page = t.closest(".page");
    var insp = page && page.querySelector("[data-cc-inspector]");
    if (insp && window.matchMedia("(max-width:1280px)").matches) insp.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var t = e.target.closest && e.target.closest("[data-cc-select]");
    if (t && t.tagName !== "BUTTON") { e.preventDefault(); t.click(); }
  });

  window.addEventListener("panel-v2-live-ready", onData);
  if (window.__PANEL_V2_DATA) onData();
})();
