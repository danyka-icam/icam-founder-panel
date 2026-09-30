// Founder Panel v2 — Command Center modes
// Scope: READ ONLY. Renders five modes (Командный центр, Во времени, Связи и
// стратегии, Линии и объекты, Размещение) from the snapshot that live.js
// already fetched (window.__PANEL_V2_DATA). No extra requests, no writes.
//
// Sources of truth:
//   - worlds, canonical lines, stars, company/line history, trajectories,
//     capital, unresolved history → Temporal Universe (atlas-temporal-universe.v0.1)
//   - placed / exact-owner candidate / review / owner conflict → Portfolio
//     Admission (atlas-portfolio-admission.v0.1)
//   - current movement of work (stage, next move, ball owner, blockers,
//     explicit dependencies) → Orchestrator routes + Continuity
// Joins between them are exact-ID only (route/object id === star memory_id).
// owning_branch is shown as the object's origin, never as its world.
// If Temporal Universe is unavailable, «Во времени» and «Связи» fall back to
// an explicitly labelled reconstruction; if Portfolio Admission is
// unavailable, placement is "не проверено" (never "требует сверки").
(function () {
  "use strict";

  var H = null;
  var ui = { selected: null, lineFilter: "all" };
  var M = null; // current model

  var TU_SCHEMA = "atlas-temporal-universe.v0.";
  var ADM_SCHEMA = "atlas-portfolio-admission.v0.";
  var MATERIAL = ["GATE_RESULT", "DECISION", "STATUS_CHANGE", "STAGE_CHANGE", "TEST_RESULT", "EXTERNAL_EVENT", "NEW_FILE"];
  var ARCHIVE_STATE = /^(CLOSED|ARCHIVED|HISTORICAL|DONE|CANCELLED|COMPLETED|RETIRED|DEPRECATED|INVALIDATED|SUPERSEDED)$/;
  var FALLBACK_DAYS = 60;
  var LANE_DAYS = 45;

  var STATE_META = {
    flow: { label: "В движении", hint: "движение за последние 7 дней, блокеров нет" },
    "return": { label: "Нужен возврат", hint: "нет движения 7+ дней или есть блокер" },
    critical: { label: "Отстаёт", hint: "нет движения 14+ дней, 2+ блокера или стоит при зависимых линиях" },
    unknown: { label: "Нет отметки движения", hint: "источник не передал дату последнего движения" },
    closed: { label: "Закрыта", hint: "статус маршрута закрыт" }
  };

  // Labels for the keys of a star's `temporal` block. Keys not listed here are
  // rendered as-is, so nothing the source sends is hidden or renamed silently.
  var TEMPORAL_LABELS = {
    past: "Прошлое", present: "Настоящее", now: "Настоящее", current: "Настоящее",
    waiting: "Ожидание", waiting_for: "Ожидание", pending: "Ожидание",
    next: "Следующий переход", next_transition: "Следующий переход", expected: "Следующий переход"
  };
  var TEMPORAL_ORDER = ["Прошлое", "Настоящее", "Ожидание", "Следующий переход"];

  var BUCKET_META = {
    placed: { title: "Размещены", hint: "звёзды на текущей Founder Map" },
    candidate: { title: "Кандидат на точную связь", hint: "exact_owner_candidates: предложенная линия, ещё не звезда" },
    review: { title: "Требуют сверки", hint: "review_required: причина от слоя допуска" },
    conflict: { title: "Конфликты владельцев", hint: "owner_conflicts" },
    archive: { title: "Архив / история", hint: "архивное или историческое состояние в допуске" }
  };

  // ------------------------------------------------------------------ utils

  function E(v) { return H.esc(v); }
  function A(v) { return H.asArray(v); }
  function ok(name) { var s = M && M.sources && M.sources[name]; return !!(s && s.ok); }
  function upper(v) { return String(v == null ? "" : v).toUpperCase(); }

  function initials(name) {
    var words = String(name || "?").replace(/[·_\-–—«»]/g, " ").split(/\s+/).filter(Boolean);
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

  function dateLabel(iso) {
    var d = new Date(iso);
    if (!iso || !isFinite(d.getTime())) return "—";
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  }

  // Generic readers for nested items whose inner shape the contract summary
  // does not pin down (history entries, trajectories, conflicts, rules).
  var TEXT_KEYS = ["title", "summary", "label", "text", "name", "description", "event", "what"];
  var TIME_KEYS = ["at", "date", "occurred_at", "timestamp", "ts", "time", "observed_at", "happened_at"];

  function pickText(o) {
    if (o == null) return "";
    if (typeof o !== "object") return String(o);
    for (var i = 0; i < TEXT_KEYS.length; i++) if (o[TEXT_KEYS[i]] != null && o[TEXT_KEYS[i]] !== "") return String(o[TEXT_KEYS[i]]);
    return "";
  }
  function pickTime(o) {
    if (!o || typeof o !== "object") return null;
    for (var i = 0; i < TIME_KEYS.length; i++) {
      var v = o[TIME_KEYS[i]];
      if (v && isFinite(new Date(v).getTime())) return v;
    }
    return null;
  }
  function scalar(v) {
    if (v == null) return "—";
    if (typeof v === "boolean") return v ? "да" : "нет";
    if (Array.isArray(v)) return v.map(function (x) { return typeof x === "object" ? pickText(x) || JSON.stringify(x) : String(x); }).join(", ");
    if (typeof v === "object") return pickText(v) || JSON.stringify(v);
    return String(v);
  }
  function kvHTML(o, skip) {
    if (!o || typeof o !== "object") return o == null ? "" : "<span class='cc-kv'>" + E(o) + "</span>";
    return Object.keys(o).filter(function (k) { return !skip || skip.indexOf(k) < 0; }).map(function (k) {
      return "<span class='cc-kv'><i>" + E(k) + "</i>" + E(H.cut(scalar(o[k]), 80)) + "</span>";
    }).join("");
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

  function banner(kind, title, detail) {
    return "<div class='cc-banner " + kind + "'><b>" + E(title) + "</b><span>" + E(detail) + "</span></div>";
  }

  function sel(kind, key) { return " data-cc-select='" + E(kind + ":" + key) + "'"; }

  function isSelected(kind, key) {
    return ui.selected && ui.selected.kind === kind && ui.selected.key === String(key);
  }

  // ------------------------------------------------------------------ source gates

  function schemaOf(j) { return j && (j.schema || j.schema_version || j.$schema) || null; }

  function readUniverse(d, sources) {
    var st = sources.temporalUniverse;
    if (!st || !st.ok) return { ok: false, reason: st && st.error ? st.error : "источник не ответил" };
    var j = d.temporalUniverse, sch = schemaOf(j);
    if (!j || !Array.isArray(j.worlds)) return { ok: false, reason: "ответ без worlds[] — не соответствует контракту" };
    if (sch && String(sch).indexOf(TU_SCHEMA) !== 0) return { ok: false, reason: "неподдерживаемая схема " + sch };
    return { ok: true, data: j, schema: sch };
  }

  function readAdmission(d, sources) {
    var st = sources.portfolioAdmission;
    if (!st || !st.ok) return { ok: false, reason: st && st.error ? st.error : "источник не ответил" };
    var j = d.portfolioAdmission, sch = schemaOf(j);
    if (!j || !Array.isArray(j.exact_owner_candidates) || !Array.isArray(j.review_required)) {
      return { ok: false, reason: "ответ без exact_owner_candidates[] / review_required[] — не соответствует контракту" };
    }
    if (sch && String(sch).indexOf(ADM_SCHEMA) !== 0) return { ok: false, reason: "неподдерживаемая схема " + sch };
    return { ok: true, data: j, schema: sch };
  }

  // ------------------------------------------------------------------ model

  function buildUniverse(j) {
    var U = { worlds: [], lines: [], stars: [], lineById: {}, starByMemory: {}, starByKey: {}, events: [] };
    A(j.worlds).forEach(function (w, wi) {
      var world = { id: String(w.id || w.world_id || "W" + wi), title: w.title || w.name || w.id || "Мир " + (wi + 1), raw: w, lines: [] };
      A(w.lines).forEach(function (ln, li) {
        var line = {
          kind: "uline", key: String(ln.id || world.id + ":" + li), id: ln.id, title: ln.title || ln.id || "Линия",
          world: world, raw: ln, capital: ln.capital == null ? null : ln.capital,
          history: A(ln.recent_history), stars: []
        };
        A(ln.branches).forEach(function (b, bi) {
          var star = {
            kind: "star", key: String(b.memory_id || b.id || line.key + ":" + bi), b: b,
            title: b.title || b.canonical_title || b.memory_id || "Звезда", canonical: b.canonical_title || null,
            memoryId: b.memory_id ? String(b.memory_id) : null, verified: b.verified === true,
            temporal: b.temporal && typeof b.temporal === "object" ? b.temporal : null,
            line: line, world: world, routes: [], obj: null
          };
          line.stars.push(star);
          U.stars.push(star);
          U.starByKey[star.key] = star;
          if (star.memoryId) U.starByMemory[star.memoryId] = star;
        });
        line.history.forEach(function (h) {
          U.events.push({ scope: "line", line: line, world: world, item: h, at: pickTime(h), text: pickText(h) || "событие линии" });
        });
        world.lines.push(line);
        U.lines.push(line);
        U.lineById[line.key] = line;
      });
      U.worlds.push(world);
    });
    U.company = A(j.company_history).map(function (h) { return { scope: "company", item: h, at: pickTime(h), text: pickText(h) || "событие компании" }; });
    U.unresolved = A(j.unresolved_history).map(function (h) { return { scope: "unresolved", item: h, at: pickTime(h), text: pickText(h) || "событие" }; });
    U.trajectories = A(j.strategic_trajectories);
    U.rules = Array.isArray(j.rules) ? j.rules : (j.rules && typeof j.rules === "object" ? Object.keys(j.rules).map(function (k) { return k + ": " + scalar(j.rules[k]); }) : []);
    U.window = j.window || null;
    return U;
  }

  function buildAdmission(j, U) {
    var AD = { counts: j.counts || {}, compiledAt: j.compiled_at || null, rules: [], items: {}, byMemory: {}, buckets: {} };
    AD.rules = Array.isArray(j.rules) ? j.rules : (j.rules && typeof j.rules === "object" ? Object.keys(j.rules).map(function (k) { return k + ": " + scalar(j.rules[k]); }) : []);
    var trusted = j.trusted_owner_map;
    AD.trustedCount = Array.isArray(trusted) ? trusted.length : (trusted && typeof trusted === "object" ? Object.keys(trusted).length : 0);
    Object.keys(BUCKET_META).forEach(function (k) { AD.buckets[k] = []; });

    function add(bucket, src, raw, i) {
      var archived = ARCHIVE_STATE.test(upper(raw.state));
      var it = {
        kind: "adm", key: src + "|" + i, source: src, bucket: archived ? "archive" : bucket, sourceBucket: bucket,
        raw: raw, memoryId: raw.memory_id ? String(raw.memory_id) : null,
        title: raw.title || pickText(raw) || raw.memory_id || "объект памяти",
        star: raw.memory_id && U ? U.starByMemory[String(raw.memory_id)] || null : null,
        proposedLine: raw.proposed_line && U ? U.lineById[String(raw.proposed_line)] || null : null
      };
      AD.items[it.key] = it;
      AD.buckets[it.bucket].push(it);
      if (it.memoryId && !AD.byMemory[it.memoryId]) AD.byMemory[it.memoryId] = it;
    }
    A(j.owner_conflicts).forEach(function (x, i) { add("conflict", "owner_conflicts", x || {}, i); });
    j.exact_owner_candidates.forEach(function (x, i) { add("candidate", "exact_owner_candidates", x || {}, i); });
    j.review_required.forEach(function (x, i) { add("review", "review_required", x || {}, i); });
    AD.trusted = trusted && typeof trusted === "object" && !Array.isArray(trusted) ? trusted : null;
    return AD;
  }

  function buildModel(d) {
    var sources = d.sources || {};
    var routes = A(d.routes);
    var objects = A(d.objects && d.objects.items);
    var openBlockers = A(d.blockers && d.blockers.items).filter(function (b) {
      return !b.is_test && upper(b.status) !== "CLEARED";
    });
    var dep = H.dependencyModel(routes);
    var tu = readUniverse(d, sources);
    var adm = readAdmission(d, sources);
    var U = tu.ok ? buildUniverse(tu.data) : null;
    var AD = adm.ok ? buildAdmission(adm.data, U) : null;

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
      var star = U && objId ? U.starByMemory[objId] || null : null;
      return {
        kind: "line", key: key, r: r, idx: idx,
        title: titleOf(r), objId: objId, obj: obj, objMissing: !!(objId && !obj),
        risk: risk, closed: closed, state: state, rd1: rd1, area: area, star: star,
        origin: obj ? (obj.owning_branch || obj.owner || null) : null,
        waiting: !closed && !!r.ball_owner && !H.isFounderOwner(r.ball_owner),
        next: r.next_move || (rd1 && (rd1.next_gate || rd1.next_move)) || null,
        nextSource: r.next_move ? "Оркестратор · next_move" : (rd1 && rd1.next_gate ? "RD1 · next_gate" : (rd1 && rd1.next_move ? "RD1 · next_move" : null)),
        upstream: [], downstream: [], bridges: [],
        objBlockers: objId ? openBlockers.filter(function (b) { return String(b.object_id || "") === objId; }) : []
      };
    });

    var lineByKey = {};
    lines.forEach(function (l) { lineByKey[l.key] = l; if (l.star) l.star.routes.push(l); });
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

    // Structural bridge: two routes point at the same canonical object. This is
    // a shared-identity fact, not a causal, strategic or resource claim.
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

    var objs = objects.map(function (o) {
      var id = String(o.object_id || "");
      var ls = linesByObj[id] || [];
      var star = U ? U.starByMemory[id] || null : null;
      if (star) star.obj = o;
      var founder = !!(o.needs_founder || o.needs_nika) || inboxItems.some(function (n) { return String(n.object_id || "") === id; });
      return {
        kind: "object", key: id, o: o, title: o.name || o.title || id || "без названия",
        lines: ls, activeLines: ls.filter(function (l) { return !l.closed; }), founder: founder,
        star: star, origin: o.owning_branch || o.owner || null,
        adm: AD ? AD.byMemory[id] || null : null,
        blockers: openBlockers.filter(function (b) { return String(b.object_id || "") === id; }),
        rd1: d.rd1 ? d.rd1[id] || null : null
      };
    });
    var objByKey = {};
    objs.forEach(function (x) { objByKey[x.key] = x; });

    // Reconstruction events (fallback only for «Во времени»).
    var events = [];
    objs.forEach(function (x) {
      if (!x.o.last_event_at) return;
      events.push({
        kind: "object", key: x.key, at: x.o.last_event_at, days: H.daysSince(x.o.last_event_at),
        title: x.title, group: x.origin || "Происхождение не указано",
        what: MATERIAL.indexOf(upper(x.o.last_meaning_kind)) >= 0 ? H.signalKindRu(x.o.last_meaning_kind) : (x.o.last_meaning_kind ? H.humanCode(x.o.last_meaning_kind) : "событие"),
        material: MATERIAL.indexOf(upper(x.o.last_meaning_kind)) >= 0,
        summary: x.o.last_summary || "", placed: x.lines.length > 0
      });
    });
    lines.forEach(function (l) {
      if (!l.r.last_movement_at) return;
      events.push({
        kind: "line", key: l.key, at: l.r.last_movement_at, days: H.daysSince(l.r.last_movement_at),
        title: l.title, group: l.origin || "Происхождение не указано", what: "движение по линии",
        material: false, summary: l.r.next_move || "", placed: true
      });
    });
    events.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });

    var ms = d.marketSignals;
    var msActivated = ms && ms.activation_state && ms.activation_state !== "NOT_ACTIVATED";

    return {
      d: d, sources: sources, tu: tu, adm: adm, U: U, AD: AD,
      lines: lines, active: lines.filter(function (l) { return !l.closed; }), lineByKey: lineByKey,
      objs: objs, objByKey: objByKey, bridges: bridges, edges: dep.edges.filter(function (e) {
        return lineByKey[e.from] && lineByKey[e.to];
      }),
      openBlockers: openBlockers, inboxItems: inboxItems, events: events,
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

  function sourceBadge(which) {
    var g = which === "tu" ? M.tu : M.adm;
    var name = which === "tu" ? "Temporal Universe" : "Portfolio Admission";
    if (g.ok) {
      var extra = which === "tu" ? windowLabel(M.U.window) : (M.AD.compiledAt ? "собран " + timeLabel(M.AD.compiledAt) : "");
      return "<div class='cc-srcbadge ok'><i></i><b>" + E(name) + "</b><span>" + E((g.schema || "схема не указана") + (extra ? " · " + extra : "")) + "</span></div>";
    }
    return "<div class='cc-srcbadge bad'><i></i><b>" + E(name) + " недоступен</b><span>" + E(g.reason) + "</span></div>";
  }

  function windowLabel(w) {
    if (!w) return "";
    if (typeof w !== "object") return "окно: " + w;
    var from = w.from || w.start, to = w.to || w.end;
    if (from || to) return "окно " + dateLabel(from) + " — " + dateLabel(to);
    if (w.days) return "окно " + w.days + " дн.";
    return "";
  }

  function stateBar(parts, total) {
    if (!total) return "<div class='cc-bar'><span class='st-none' style='width:100%'></span></div>";
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

  function ulineRef(ul) {
    return "<button class='cc-ref uni'" + sel("uline", ul.key) + ">" + E(H.cut(ul.title, 28)) + "</button>";
  }

  // Where a route sits in the canonical universe: exact memory_id match only.
  function routePlace(l) {
    if (!M.tu.ok) return { world: null, uline: null, text: "мир не проверен — Temporal Universe недоступен" };
    if (l.star) return { world: l.star.world, uline: l.star.line, text: "мир: " + l.star.world.title + " · линия: " + l.star.line.title };
    return { world: null, uline: null, text: "вне Founder Universe (нет точного ID)" };
  }

  function placementOfObject(x) {
    if (!M.adm.ok) return { bucket: "unchecked", label: "не проверено — Portfolio Admission недоступен" };
    if (x.star) return { bucket: "placed", label: "размещена звездой" };
    if (x.adm) return { bucket: x.adm.bucket, label: BUCKET_META[x.adm.bucket].title.toLowerCase() + (x.adm.bucket === "archive" ? " (из " + x.adm.source + ")" : "") };
    if (M.AD.trusted && M.AD.trusted[x.key]) return { bucket: "placed", label: "в trusted_owner_map" };
    return { bucket: "absent", label: "нет в слое допуска" };
  }

  function mapVisibility(memoryId) {
    if (!M.tu.ok) return { cls: "no", text: "видимость не проверена" };
    return memoryId && M.U.starByMemory[memoryId] ? { cls: "yes", text: "звезда на Founder Map" } : { cls: "no", text: "на Founder Map не видна" };
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
    if (M.adm.ok) {
      var c = M.AD.counts;
      var rv = reviewCounts().review, cf = reviewCounts().conflicts;
      var total = Number(c.memory) || 0;
      html += kpi("review", "⌖", "Требуют сверки", rv + cf,
        "review_required " + rv + " · конфликтов " + cf + (total ? " из " + total + " в памяти" : ""),
        stateBar([{ cls: "flow", n: Number(c.placed) || 0, label: "размещены" }, { cls: "wait", n: Number(c.exact_owner_candidates) || 0, label: "кандидаты" },
          { cls: "return", n: rv, label: "сверка" }, { cls: "critical", n: cf, label: "конфликты" }], total || rv + cf),
        "#placement", rv + cf ? "wait" : "");
    } else {
      html += kpi("review", "⌖", "Требуют сверки", "Не проверено", "Portfolio Admission недоступен: " + M.adm.reason, "", "#placement", "bad");
    }
    var recent = recentEventCount(7);
    html += recent != null ?
      kpi("changes", "↻", "Изменения за 7 дней", recent, M.tu.ok ? "события компании и линий · Temporal Universe" : "реконструкция: события объектов и движения маршрутов", sparkDays(), "#timeline", "") :
      kpi("changes", "↻", "Изменения за 7 дней", "Недоступно", "нет источников с датами", "", "#diagnostics", "bad");
    return html;
  }

  // Counts as declared by Portfolio Admission (they include archived items,
  // which the board shows in a separate column).
  function reviewCounts() {
    var c = M.AD.counts;
    return {
      review: Number(c.review_required != null ? c.review_required : M.AD.buckets.review.length) || 0,
      conflicts: Number(c.owner_conflicts != null ? c.owner_conflicts : M.AD.buckets.conflict.length) || 0
    };
  }
  function reviewTotal() { var r = reviewCounts(); return r.review + r.conflicts; }

  function datedEvents() {
    if (M.tu.ok) return M.U.company.concat(M.U.events).filter(function (e) { return e.at; });
    if (!ok("objects") && !ok("routes")) return null;
    return M.events;
  }

  function recentEventCount(days) {
    var ev = datedEvents();
    if (!ev) return null;
    return ev.filter(function (e) { var n = H.daysSince(e.at); return n != null && n <= days; }).length;
  }

  // Real per-day event counts over the last 14 days (not a trend line).
  function sparkDays() {
    var days = 14, counts = [];
    for (var i = 0; i < days; i++) counts.push(0);
    (datedEvents() || []).forEach(function (e) { var n = H.daysSince(e.at); if (n != null && n < days) counts[days - 1 - n] += 1; });
    var max = Math.max.apply(null, counts.concat([1]));
    return "<span class='cc-days' title='события по дням, 14 дней'>" + counts.map(function (c) {
      return "<i style='height:" + (c ? 20 + c / max * 80 : 6) + "%' class='" + (c ? "on" : "") + "'></i>";
    }).join("") + "</span>";
  }

  function renderUniverseStrip() {
    if (!M.tu.ok) {
      return banner("fallback", "Founder Universe недоступен", "Temporal Universe не ответил (" + M.tu.reason + "). Миры и канонические линии не показываются; маршруты ниже — из Оркестратора.");
    }
    return "<div class='cc-worlds'>" + M.U.worlds.map(function (w) {
      var stars = 0, ver = 0, ev = 0, cap = 0;
      w.lines.forEach(function (ln) {
        stars += ln.stars.length; ev += ln.history.length; if (ln.capital != null) cap += 1;
        ln.stars.forEach(function (s) { if (s.verified) ver += 1; });
      });
      var routes = M.active.filter(function (l) { return l.star && l.star.world === w; });
      return "<a class='cc-world-card' href='#timeline'>" +
        "<span class='cc-world-orbit'><i></i></span>" +
        "<span class='cc-world-body'><b>" + E(w.title) + "</b>" +
        "<small>" + w.lines.length + " лин. · " + stars + " звёзд · проверено " + ver + "</small>" +
        "<span class='cc-world-stars'>" + w.lines.map(function (ln) {
          return "<i title='" + E(ln.title + ": " + ln.stars.length + " звёзд") + "' style='--n:" + Math.min(ln.stars.length, 4) + "'></i>";
        }).join("") + "</span>" +
        "<em>" + (routes.length ? routes.length + " маршрут(а) в работе" : "маршрутов с точным ID нет") + (ev ? " · событий линий " + ev : "") + (cap ? " · капитал в " + cap + " лин." : "") + "</em></span></a>";
    }).join("") + "</div>";
  }

  function lineCard(l) {
    var r = l.r;
    var blockersN = l.risk.blockers + l.objBlockers.length;
    var why = r.priority ? "приоритет в источнике: " + r.priority : (l.downstream.length ? "от неё явно зависят " + l.downstream.length + " линии" : "обоснование важности источником не передано");
    var place = routePlace(l);
    var where = [place.text, l.area ? "область: " + H.humanCode(l.area) : null, l.objId ? l.objId : "без объекта"].filter(Boolean).join(" · ");
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
      (l.star ? "<i class='uni' title='звезда Founder Universe по точному ID'>★ " + E(H.cut(l.star.line.title, 18)) + "</i>" : "") +
      (l.upstream.length ? "<i title='зависит от'>↑ " + l.upstream.length + "</i>" : "") +
      (l.downstream.length ? "<i title='от неё зависят'>↓ " + l.downstream.length + "</i>" : "") +
      (l.bridges.length ? "<i title='общий объект'>⇄ " + l.bridges.length + "</i>" : "") +
      (!l.upstream.length && !l.downstream.length && !l.bridges.length && !l.star ? "<i class='muted'>явных связей нет</i>" : "") +
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
        "<em>" + E(id || "объект не указан") + (x && x.lines.length ? " · маршрут: " + H.cut(x.lines[0].title, 22) : "") + "</em></div>" +
        "<span class='cc-queue-age'>" + E(H.ago(n.opened_at)) + "</span></div>";
    }).join("") + "</div>";
  }

  function renderRecentChanges(limit) {
    if (M.tu.ok) {
      var ev = M.U.company.concat(M.U.events).filter(function (e) { return e.at; })
        .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }).slice(0, limit || 7);
      if (!ev.length) return empty("Датированных событий нет", "Temporal Universe не передал событий с датой.");
      return "<div class='cc-feed'>" + ev.map(function (e) {
        var isLine = e.scope === "line";
        return "<div class='cc-feed-item " + (isLine ? "material" : "company") + "'" + (isLine ? sel("uline", e.line.key) : "") + ">" +
          "<i></i><div><b>" + E(H.cut(isLine ? e.line.title : "Компания", 40)) + "</b><small>" + E(H.cut(e.text, 90)) +
          (isLine ? " · " + E(e.world.title) : "") + "</small></div><span>" + E(H.ago(e.at)) + "</span></div>";
      }).join("") + "</div><div class='cc-foot-note'>Temporal Universe · company_history и recent_history линий.</div>";
    }
    if (!ok("objects") && !ok("routes")) return unavailable("Нет источников с датами", "Изменения не выводятся из прошлых данных.");
    var rows = M.events.slice(0, limit || 7);
    if (!rows.length) return empty("Датированных событий нет", "Источники ответили, но не передали отметок времени.");
    return "<div class='cc-feed'>" + rows.map(function (e) {
      return "<div class='cc-feed-item " + (e.kind === "line" ? "line" : (e.material ? "material" : "")) + "'" + sel(e.kind, e.key) + ">" +
        "<i></i><div><b>" + E(H.cut(e.title, 40)) + "</b><small>" + E(e.what) + (e.summary ? " · " + H.cut(e.summary, 70) : "") + "</small></div>" +
        "<span>" + E(H.ago(e.at)) + "</span></div>";
    }).join("") + "</div><div class='cc-foot-note'>Реконструкция: Temporal Universe недоступен — последние события объектов и движения маршрутов.</div>";
  }

  function renderLanes(lines) {
    if (!lines.length) return empty("Нет активных линий", "");
    var scaleNote = "<div class='cc-lane-axis'><span>−" + LANE_DAYS + " дн.</span><span>−30</span><span>−15</span><span class='now'>сейчас</span><span class='wait'>→ ожидание</span></div>";
    function x(days) { return days == null ? null : Math.max(0, 68 - Math.min(days, LANE_DAYS) / LANE_DAYS * 68); }
    return scaleNote + "<div class='cc-lanes'>" + lines.map(function (l) {
      var lx = x(l.risk.stale), ox = l.obj && l.obj.last_event_at ? x(H.daysSince(l.obj.last_event_at)) : null;
      var start = [lx, ox].filter(function (v) { return v != null; });
      var from = start.length ? Math.max.apply(null, start) : null;
      return "<div class='cc-lane st-" + l.state + "'" + sel("line", l.key) + ">" +
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
    "<div class='cc-legend'><span><i class='mk line'></i>движение маршрута</span><span><i class='mk obj'></i>последнее событие объекта</span>" +
    "<span><i class='mk next'></i>следующий переход (без даты — источник не передаёт срок)</span></div>";
  }

  function renderGraph(lines) {
    if (!lines.length) return empty("Нет линий для карты", "");
    var W = 400, Hh = 300, cx = W / 2, cy = Hh / 2;
    var n = lines.length;
    var rx = n <= 2 ? 100 : 150, ry = n <= 2 ? 50 : 105;
    var pos = {};
    lines.forEach(function (l, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      pos[l.key] = { x: n === 1 ? cx : cx + rx * Math.cos(a), y: n === 1 ? cy : cy + ry * Math.sin(a), l: l };
    });
    var svg = "<svg class='cc-graph-svg' viewBox='0 0 " + W + " " + Hh + "' role='img' aria-label='Карта явных связей между маршрутами'>" +
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
      svg += "<g class='cc-node st-" + l.state + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + " tabindex='0'>" +
        "<polygon class='cc-node-glow' points='" + hexPoints(p.x, p.y, 36) + "'/>" +
        "<polygon class='cc-node-hex' points='" + hexPoints(p.x, p.y, 30) + "'/>" +
        "<text x='" + p.x.toFixed(1) + "' y='" + (p.y + 4).toFixed(1) + "' text-anchor='middle'>" + E(H.cut(l.title, 10)) + "</text>" +
        (l.risk.blockers + l.objBlockers.length ? "<circle class='cc-node-alert' cx='" + (p.x + 24).toFixed(1) + "' cy='" + (p.y - 22).toFixed(1) + "' r='7'/>" +
          "<text class='cc-node-alert-t' x='" + (p.x + 24).toFixed(1) + "' y='" + (p.y - 19).toFixed(1) + "' text-anchor='middle'>!</text>" : "") +
        "</g>";
    });
    svg += "</svg>";
    var note = (!M.edges.length && !M.bridges.length) ?
      "<div class='cc-graph-note'>Источник не передаёт явных связей между этими маршрутами. Стрелки по догадке не рисуются.</div>" :
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
    page.querySelector("[data-cc='universe']").innerHTML = renderUniverseStrip();
    page.querySelector("[data-cc='lines']").innerHTML = !routesOk ?
      unavailable("Источник маршрутов недоступен", "Линии не показываются по прошлым или демонстрационным данным.") :
      (lines.length ? "<div class='cc-line-list'>" + lines.map(lineCard).join("") + "</div>" +
        "<div class='cc-foot-note'>Порядок — порядок Оркестратора. Мир и каноническая линия — из Temporal Universe по точному ID объекта; без совпадения маршрут не приписывается ни к какому миру.</div>" :
        empty("Оркестратор не отдал активных линий", ""));
    page.querySelector("[data-cc='founder']").innerHTML = renderFounderQueue();
    page.querySelector("[data-cc='changes']").innerHTML = renderRecentChanges(6);
    page.querySelector("[data-cc='lanes']").innerHTML = routesOk ? renderLanes(lines.slice(0, 10)) : unavailable("Нет маршрутов", "Траектории не строятся.");
    page.querySelector("[data-cc='graph']").innerHTML = routesOk ? renderGraph(lines.slice(0, 10)) : unavailable("Нет маршрутов", "Карта связей очищена.");
    page.querySelector("[data-cc='attention']").innerHTML = routesOk ? renderAttention(lines) : unavailable("Нет current state", "Шкала не строится.");
  }

  // ------------------------------------------------------------------ Во времени

  function temporalCells(t) {
    var cells = {};
    var extra = {};
    if (t) Object.keys(t).forEach(function (k) {
      var lab = TEMPORAL_LABELS[k];
      if (lab && cells[lab] == null) cells[lab] = scalar(t[k]);
      else extra[k] = t[k];
    });
    return { cells: cells, extra: extra };
  }

  function universeRange() {
    var w = M.U.window, to = null, from = null;
    if (w && typeof w === "object") {
      to = new Date(w.to || w.end || Date.now());
      from = w.from || w.start ? new Date(w.from || w.start) : (w.days ? new Date(to.getTime() - w.days * 86400000) : null);
    }
    if (!to || !isFinite(to.getTime())) to = new Date();
    if (!from || !isFinite(from.getTime()) || from >= to) from = new Date(to.getTime() - 90 * 86400000);
    return { from: from.getTime(), to: to.getTime() };
  }

  function renderTimeline(page) {
    page.querySelector("[data-cc='stamp']").innerHTML = readStamp();
    page.querySelector("[data-cc='source']").innerHTML = M.tu.ok ?
      sourceBadge("tu") :
      sourceBadge("tu") + banner("fallback", "Реконструкция, не Temporal Universe",
        "Ниже — приблизительная картина из observer/routes, continuity/objects и RD1: только последнее событие объекта и последнее движение маршрута. Миры не определяются; группировка — по происхождению объекта (owning_branch), это не канонический мир.");
    if (M.tu.ok) renderTimelineUniverse(page); else renderTimelineFallback(page);
  }

  function renderTimelineUniverse(page) {
    var U = M.U, R = universeRange();
    var span = R.to - R.from;
    function x(at) {
      var t = new Date(at).getTime();
      return Math.max(0, Math.min(80, (t - R.from) / span * 80));
    }
    var ticks = "";
    for (var i = 0; i <= 4; i++) {
      var t = R.from + span * i / 4;
      ticks += "<span" + (i === 4 ? " class='now'" : "") + " style='left:" + (i * 20) + "%'>" + E(i === 4 ? "конец окна" : dateLabel(new Date(t).toISOString())) + "</span>";
    }
    function dot(e, i, cls, attrs) {
      var t = new Date(e.at).getTime(), out = t < R.from ? " older" : "";
      return "<span class='cc-dot " + cls + out + "' style='left:" + x(e.at) + "%;top:" + (18 + (i % 3) * 22) + "%'" + (attrs || "") +
        " title='" + E(e.text + " · " + dateLabel(e.at)) + "'></span>";
    }
    var lanes = [];
    lanes.push("<div class='cc-swim-lane company'><div class='cc-swim-name'><b>Компания</b><small>" + U.company.length + " событ. · company_history</small></div>" +
      "<div class='cc-swim-track'><span class='cc-swim-now' style='left:80%'></span>" +
      U.company.filter(function (e) { return e.at; }).map(function (e, i) { return dot(e, i, "company"); }).join("") + "</div></div>");
    U.worlds.forEach(function (w) {
      var evs = U.events.filter(function (e) { return e.world === w && e.at; });
      var waiting = [];
      w.lines.forEach(function (ln) {
        var hasNext = ln.stars.some(function (s) { var tc = temporalCells(s.temporal).cells; return tc["Ожидание"] || tc["Следующий переход"]; });
        if (hasNext) waiting.push(ln);
      });
      lanes.push("<div class='cc-swim-lane'><div class='cc-swim-name'><b>" + E(w.title) + "</b><small>" + w.lines.length + " лин. · " + evs.length + " событ.</small></div>" +
        "<div class='cc-swim-track'><span class='cc-swim-now' style='left:80%'></span>" +
        evs.map(function (e, i) { return dot(e, i, "material", sel("uline", e.line.key)); }).join("") +
        waiting.map(function (ln, i) {
          return "<span class='cc-wait-chip st-flow' style='left:" + (82 + (i % 2) * 8) + "%;top:" + (14 + Math.floor(i / 2) % 3 * 26) + "%'" + sel("uline", ln.key) +
            " title='" + E(ln.title + " — ожидает перехода") + "'>" + E(initials(ln.title)) + "</span>";
        }).join("") +
        "</div></div>");
    });
    lanes.push("<div class='cc-swim-lane unresolved'><div class='cc-swim-name'><b>Не размещено</b><small>" + U.unresolved.length + " · unresolved_history</small></div>" +
      "<div class='cc-swim-track'><span class='cc-swim-now' style='left:80%'></span>" +
      U.unresolved.filter(function (e) { return e.at; }).map(function (e, i) { return dot(e, i, "unplaced"); }).join("") + "</div></div>");

    page.querySelector("[data-cc='swim']").innerHTML = "<div class='cc-swim'><div class='cc-swim-axis'>" + ticks +
      "<span class='future' style='left:81%'>ожидание →</span></div>" + lanes.join("") + "</div>" +
      "<div class='cc-legend'><span><i class='mk company'></i>событие компании</span><span><i class='mk material'></i>событие линии</span>" +
      "<span><i class='mk unplaced'></i>неразмещённая история</span><span><i class='mk next'></i>линия со звездой в ожидании перехода (без даты)</span></div>";

    // company → world → line → star
    var tree = U.worlds.map(function (w) {
      return "<div class='cc-world'><div class='cc-world-head'><span class='cc-world-dot'></span><b>" + E(w.title) + "</b>" +
        "<small>" + w.lines.length + " лин. · " + w.lines.reduce(function (n, l) { return n + l.stars.length; }, 0) + " звёзд</small></div>" +
        w.lines.map(function (ln) {
          var last = ln.history.filter(function (h) { return pickTime(h); }).sort(function (a, b) { return String(pickTime(b)).localeCompare(String(pickTime(a))); })[0];
          return "<div class='cc-uline" + (isSelected("uline", ln.key) ? " selected" : "") + "'" + sel("uline", ln.key) + ">" +
            "<div class='cc-uline-head'>" + hexBadge(initials(ln.title), "flow", "sm") + "<span><b>" + E(ln.title) + "</b><small>" +
            ln.stars.length + " звёзд" + (last ? " · " + E(H.cut(pickText(last), 50)) + " · " + E(H.ago(pickTime(last))) : " · событий в окне нет") + "</small></span>" +
            (ln.capital != null ? "<i class='cc-capchip'>капитал</i>" : "") + "</div>" +
            (ln.stars.length ? ln.stars.map(function (s) {
              var tc = temporalCells(s.temporal);
              return "<div class='cc-flow star" + (s.verified ? " verified" : "") + (isSelected("star", s.key) ? " selected" : "") + "'" + sel("star", s.key) + ">" +
                "<div class='cc-flow-name'><span class='cc-star-dot" + (s.verified ? " v" : "") + "'></span><span><b>" + E(H.cut(s.title, 30)) + "</b><small>" +
                E((s.memoryId || "без memory_id") + (s.verified ? " · проверена" : " · не проверена")) + "</small></span></div>" +
                (Object.keys(tc.cells).length ? TEMPORAL_ORDER.map(function (lab, i) {
                  var cls = ["past", "now", "wait", "next"][i];
                  return "<div class='cc-flow-step " + cls + "'><small>" + lab + "</small><span>" + E(tc.cells[lab] ? H.cut(tc.cells[lab], 60) : "не передано") + "</span></div>";
                }).join("") : "<div class='cc-flow-step none'><span>Источник не передал temporal для этой звезды — прошлое, настоящее и переход не показываются.</span></div>") + "</div>";
            }).join("") : "<div class='cc-uline-empty'>У линии нет размещённых звёзд.</div>") +
            "</div>";
        }).join("") + "</div>";
    }).join("");
    page.querySelector("[data-cc='tree']").innerHTML = "<div class='cc-company'><div class='cc-company-head'>" + hexBadge("IC", "flow") +
      "<span><b>ICAM · компания</b><small>" + U.worlds.length + " мир(а) · " + U.lines.length + " линий · " + U.stars.length + " звёзд · " +
      U.company.length + " событий компании</small></span></div>" + (tree || empty("Миров нет", "Temporal Universe ответил без миров.")) + "</div>";

    page.querySelector("[data-cc='unplaced-title']").textContent = "Неразрешённая история";
    page.querySelector("[data-cc='unplaced-sub']").textContent = "unresolved_history — не привязана ни к одному объекту";
    page.querySelector("[data-cc='unplaced']").innerHTML = U.unresolved.length ? "<div class='cc-feed'>" + U.unresolved.map(function (e) {
      return "<div class='cc-feed-item unplaced static'><i></i><div><b>" + E(H.cut(e.text, 60)) + "</b><small>" +
        E(kvText(e.item, TEXT_KEYS.concat(TIME_KEYS)) || "без пояснения") + "</small></div><span>" + E(e.at ? H.ago(e.at) : "без даты") + "</span></div>";
    }).join("") + "</div><div class='cc-foot-note'>Панель не привязывает эти события к объектам по тематическому сходству. Они остаются неразмещёнными, пока источник не разместит их явно.</div>" :
      empty("Неразрешённой истории нет", "unresolved_history пуст.");

    page.querySelector("[data-cc='bounds']").innerHTML = "<ul class='cc-bounds'>" +
      U.rules.map(function (r) { return "<li><b>Правило источника:</b> " + E(scalar(r)) + "</li>"; }).join("") +
      "<li>Прошлое / настоящее / ожидание / следующий переход звезды — поле <b>temporal</b> из Temporal Universe; пустые ячейки означают, что источник их не передал.</li>" +
      "<li>У ожидания и следующего перехода нет даты — они стоят в зоне ожидания без срока.</li>" +
      "<li>Маршруты Оркестратора связаны со звёздами только по точному совпадению ID объекта и memory_id.</li>" +
      "</ul>";
  }

  function kvText(o, skip) {
    if (!o || typeof o !== "object") return "";
    return Object.keys(o).filter(function (k) { return skip.indexOf(k) < 0; }).map(function (k) { return k + ": " + scalar(o[k]); }).join(" · ");
  }

  function renderTimelineFallback(page) {
    var box = page.querySelector("[data-cc='swim']");
    var tree = page.querySelector("[data-cc='tree']");
    var unplaced = page.querySelector("[data-cc='unplaced']");
    page.querySelector("[data-cc='unplaced-title']").textContent = "События объектов без маршрута";
    page.querySelector("[data-cc='unplaced-sub']").textContent = "реконструкция: у объекта нет маршрута Оркестратора";
    page.querySelector("[data-cc='bounds']").innerHTML = "<ul class='cc-bounds'>" +
      "<li>Temporal Universe недоступен: <b>" + E(M.tu.reason) + "</b>.</li>" +
      "<li>Проекции отдают только <b>последнее</b> событие объекта и последнее движение маршрута — полного журнала нет.</li>" +
      "<li>Группы — происхождение объекта (owning_branch), а не канонический мир.</li>" +
      "<li>Неразрешённая история компании в реконструкции недоступна.</li></ul>";
    if (!ok("objects") && !ok("routes")) {
      box.innerHTML = tree.innerHTML = unplaced.innerHTML = unavailable("Источники недоступны", "Временная картина не собирается из прошлых данных.");
      return;
    }
    var groups = [];
    M.events.forEach(function (e) { if (groups.indexOf(e.group) < 0) groups.push(e.group); });
    M.active.forEach(function (l) { var g = l.origin || "Происхождение не указано"; if (groups.indexOf(g) < 0) groups.push(g); });
    groups.sort();
    function x(days) { return Math.max(0, 80 - Math.min(days, FALLBACK_DAYS) / FALLBACK_DAYS * 80); }
    var ticks = "";
    for (var t = FALLBACK_DAYS; t >= 0; t -= 15) {
      ticks += "<span" + (t === 0 ? " class='now'" : "") + " style='left:" + x(t) + "%'>" + (t === 0 ? "сейчас" : "−" + t + " дн.") + "</span>";
    }
    box.innerHTML = "<div class='cc-swim'><div class='cc-swim-axis'>" + ticks + "<span class='future' style='left:81%'>ожидание →</span></div>" +
      groups.map(function (g) {
        var evs = M.events.filter(function (e) { return e.group === g && e.days != null; });
        var waits = M.active.filter(function (l) { return (l.origin || "Происхождение не указано") === g; });
        return "<div class='cc-swim-lane'><div class='cc-swim-name'><b>" + E(g) + "</b><small>происхождение · " + evs.length + " событ.</small></div>" +
          "<div class='cc-swim-track'><span class='cc-swim-now' style='left:80%'></span>" +
          evs.map(function (e, i) {
            var cls = e.kind === "line" ? "line" : (e.material ? "material" : "obj");
            return "<span class='cc-dot " + cls + (e.days > FALLBACK_DAYS ? " older" : "") + (e.placed ? "" : " unplaced") + "' style='left:" + x(e.days) + "%;top:" + (18 + (i % 3) * 22) + "%'" +
              sel(e.kind, e.key) + " title='" + E(e.title + " · " + e.what + " · " + H.ago(e.at)) + "'></span>";
          }).join("") +
          waits.map(function (l, i) {
            return "<span class='cc-wait-chip st-" + l.state + "' style='left:" + (82 + (i % 2) * 8) + "%;top:" + (14 + Math.floor(i / 2) % 3 * 26) + "%'" + sel("line", l.key) +
              " title='" + E(l.title + " → " + (l.next || "переход не передан")) + "'>" + E(initials(l.title)) + "</span>";
          }).join("") + "</div></div>";
      }).join("") +
      "</div><div class='cc-legend'><span><i class='mk material'></i>материальное событие объекта</span><span><i class='mk obj'></i>прочее событие объекта</span>" +
      "<span><i class='mk line'></i>движение маршрута</span><span><i class='mk unplaced'></i>объект без маршрута</span><span><i class='mk next'></i>маршрут в ожидании перехода</span></div>";

    tree.innerHTML = "<div class='cc-company'><div class='cc-company-head'>" + hexBadge("IC", "unknown") +
      "<span><b>ICAM · реконструкция</b><small>" + M.active.length + " активн. маршрутов · " + M.objs.length + " объектов · миры не определены</small></span></div>" +
      (M.active.length ? M.active.map(function (l) {
        var o = l.obj;
        return "<div class='cc-flow st-" + l.state + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + ">" +
          "<div class='cc-flow-name'>" + hexBadge(initials(l.title), l.state, "sm") + "<span><b>" + E(H.cut(l.title, 30)) + "</b><small>" + E((l.objId || "без объекта") + (l.origin ? " · происхождение: " + l.origin : "")) + "</small></span></div>" +
          "<div class='cc-flow-step past'><small>Прошлое</small><span>" +
          E(o && o.last_event_at ? (o.last_summary ? H.cut(o.last_summary, 60) : H.humanCode(o.last_meaning_kind || "событие")) + " · " + H.ago(o.last_event_at) :
            (l.r.last_movement_at ? "движение " + H.ago(l.r.last_movement_at) : "история не передана")) + "</span></div>" +
          "<div class='cc-flow-step now'><small>Настоящее</small><span>" + E(H.humanCode(l.r.stage || l.r.status || "этап не передан")) + "</span>" + stateDot(l.state) + "</div>" +
          "<div class='cc-flow-step wait'><small>Ожидание</small><span>" + E(l.r.review_condition ? H.cut(l.r.review_condition, 60) : (l.waiting ? "ждём: " + l.r.ball_owner : "условие не передано")) + "</span></div>" +
          "<div class='cc-flow-step next'><small>Следующий переход</small><span>" + E(l.next ? H.cut(l.next, 60) : "не передан") + "</span></div></div>";
      }).join("") : empty("Нет активных маршрутов", "")) + "</div>";

    var un = M.events.filter(function (e) { return e.kind === "object" && !e.placed; });
    unplaced.innerHTML = !ok("routes") ? unavailable("Маршруты недоступны", "Без текущих маршрутов нельзя сказать, у каких объектов их нет.") : un.length ? "<div class='cc-feed'>" + un.slice(0, 10).map(function (e) {
      return "<div class='cc-feed-item unplaced'" + sel("object", e.key) + "><i></i><div><b>" + E(H.cut(e.title, 40)) + "</b><small>" +
        E(e.what + (e.summary ? " · " + H.cut(e.summary, 60) : "")) + "</small></div><span>" + E(H.ago(e.at)) + "</span></div>";
    }).join("") + "</div>" : empty("Таких событий нет", "Все датированные события относятся к объектам с маршрутом.");
  }

  // ------------------------------------------------------------------ Связи и стратегии

  function proofRow(kind, label, n, detail) {
    var icon = { ok: "✓", warn: "!", no: "✕", none: "○" }[kind];
    return "<div class='cc-proof-row " + kind + "'><span class='cc-proof-icon'>" + icon + "</span><b>" + E(label) + "</b><em>" + E(n) + "</em><small>" + E(detail) + "</small></div>";
  }

  function renderLinks(page) {
    page.querySelector("[data-cc='stamp']").innerHTML = readStamp();
    page.querySelector("[data-cc='source']").innerHTML = sourceBadge("tu") + (M.tu.ok ? "" :
      banner("fallback", "Реконструкция связей", "Temporal Universe недоступен: миры, канонические линии, траектории и капитал не показываются. Ниже — только маршруты Оркестратора и их объекты по точному ID."));
    var mapBox = page.querySelector("[data-cc='linkmap']");
    if (M.tu.ok) mapBox.innerHTML = universeMap();
    else if (!ok("routes") && !ok("objects")) mapBox.innerHTML = unavailable("Источники недоступны", "Карта связей не строится.");
    else mapBox.innerHTML = routeObjectMap();

    var rows = [];
    if (M.tu.ok) {
      var ver = M.U.stars.filter(function (s) { return s.verified; }).length;
      rows.push(proofRow("ok", "Мир → линия", M.U.lines.length, "каноническая структура Temporal Universe"));
      rows.push(proofRow("ok", "Линия → звезда", M.U.stars.length, "branches[] линии; проверено (verified) " + ver + " из " + M.U.stars.length));
      rows.push(proofRow(M.U.trajectories.length ? "ok" : "none", "Стратегические траектории", M.U.trajectories.length, "strategic_trajectories"));
      rows.push(proofRow(M.U.unresolved.length ? "warn" : "ok", "Неразрешённая история", M.U.unresolved.length, "не привязана ни к чему; по сходству не привязывается"));
      var routed = M.lines.filter(function (l) { return l.star; }).length;
      rows.push(proofRow(routed ? "ok" : "none", "Маршрут → звезда", routed, "точное совпадение ID объекта маршрута и memory_id звезды"));
    } else {
      rows.push(proofRow("no", "Мир → линия → звезда", "—", "Temporal Universe недоступен: " + M.tu.reason));
    }
    rows.push(proofRow(M.edges.length ? "ok" : "none", "Маршрут → маршрут", M.edges.length, M.edges.length ? "явные dependency-поля маршрутов" : "источник не передаёт зависимостей между маршрутами"));
    rows.push(proofRow(M.bridges.length ? "ok" : "none", "Общий объект", M.bridges.length, "два маршрута ссылаются на один object_id — структурная связь"));
    rows.push(proofRow(M.dangling.length ? "warn" : "ok", "Висячие ссылки маршрутов", M.dangling.length, "маршрут ссылается на объект, которого нет в реестре Continuity"));
    rows.push(proofRow("no", "Причинные связи", "—", "ни один источник не передаёт causal-отношений; не рисуются"));
    page.querySelector("[data-cc='proven']").innerHTML = "<div class='cc-proof'>" + rows.join("") + "</div>";

    var impact = page.querySelector("[data-cc='impact']");
    var withDown = M.active.filter(function (l) { return l.downstream.length; });
    impact.innerHTML = withDown.length ? "<div class='cc-impact'>" + withDown.map(function (l) {
      return "<div class='cc-impact-row st-" + l.state + "'" + sel("line", l.key) + ">" + hexBadge(initials(l.title), l.state, "sm") +
        "<div><b>Если остановится «" + E(H.cut(l.title, 30)) + "»</b><small>явно задержит:</small><div class='cc-refs'>" + lineRefs(l.downstream) + "</div></div></div>";
    }).join("") + "</div>" :
      empty("Влияние остановки не представлено", "Ни один активный маршрут не объявляет зависимых явно. Панель не выводит влияние по догадке.");

    page.querySelector("[data-cc='strategy']").innerHTML = renderTrajectories();
    page.querySelector("[data-cc='resources']").innerHTML = renderCapital();
  }

  function trajectoryLines(t) {
    var raw = t && typeof t === "object" ? (t.lines || t.line_ids || t.path || t.steps || []) : [];
    return A(raw).map(function (x) {
      var id = typeof x === "object" && x ? (x.id || x.line_id || x.line) : x;
      var ul = id != null ? M.U.lineById[String(id)] : null;
      return ul ? { ul: ul } : { text: typeof x === "object" ? pickText(x) || JSON.stringify(x) : String(x) };
    });
  }

  function renderTrajectories() {
    if (!M.tu.ok) return unavailable("Траектории недоступны", "strategic_trajectories приходят только из Temporal Universe.");
    if (!M.U.trajectories.length) return empty("Стратегических траекторий нет", "Temporal Universe передал пустой strategic_trajectories.");
    return "<div class='cc-tracks'>" + M.U.trajectories.map(function (t) {
      var steps = trajectoryLines(t);
      var title = pickText(t) || (typeof t === "string" ? t : "Траектория");
      var meta = t && typeof t === "object" ? kvText(t, TEXT_KEYS.concat(["lines", "line_ids", "path", "steps", "id"])) : "";
      return "<div class='cc-track'><div class='cc-track-head'><b>" + E(title) + "</b><small>" + E(meta || "strategic_trajectories") + "</small></div>" +
        (steps.length ? "<div class='cc-track-path'>" + steps.map(function (s, i) {
          return (i ? "<span class='cc-track-sep'></span>" : "") + (s.ul ?
            "<button class='cc-track-node st-flow'" + sel("uline", s.ul.key) + ">" + E(H.cut(s.ul.title, 22)) + "</button>" :
            "<span class='cc-track-node st-unknown' title='нет такой линии в worlds[]'>" + E(H.cut(s.text, 22)) + "</span>");
        }).join("") + "</div>" : "") + "</div>";
    }).join("") + "</div><div class='cc-foot-note'>Траектории и их состав — из Temporal Universe. Серый узел — ссылка, которой нет среди линий worlds[].</div>";
  }

  function renderCapital() {
    if (!M.tu.ok) return "<div class='cc-proof'>" + proofRow("no", "Капитал и ресурсы", "—", "Temporal Universe недоступен — capital линий не прочитан") + "</div>";
    var withCap = M.U.lines.filter(function (ln) { return ln.capital != null; });
    return "<div class='cc-proof'>" +
      proofRow(withCap.length ? "ok" : "none", "Капитал линий", withCap.length, "явное поле capital линии в Temporal Universe") +
      proofRow("no", "Общие ресурсы между линиями", "—", "источник не передаёт ресурсных связей; общий владелец хода ресурсом не считается") +
      "</div>" +
      (withCap.length ? "<div class='cc-owner-list'>" + withCap.map(function (ln) {
        return "<div class='cc-owner'" + sel("uline", ln.key) + "><b>" + E(ln.title) + " <small>· " + E(ln.world.title) + "</small></b><div class='cc-kvs'>" +
          (typeof ln.capital === "object" ? kvHTML(ln.capital) : "<span class='cc-kv'>" + E(scalar(ln.capital)) + "</span>") + "</div></div>";
      }).join("") + "</div>" : "");
  }

  function universeMap() {
    var U = M.U;
    var rowH = 30, top = 44;
    var rows = Math.max(U.worlds.length, U.lines.length, U.stars.length, 1);
    var Wd = 1000, Ht = top + rows * rowH + 16;
    var colX = { world: 110, line: 470, star: 840 };
    function spread(n) {
      var span = rows * rowH, step = n ? span / n : 0, out = [];
      for (var i = 0; i < n; i++) out.push(top + step * i + step / 2);
      return out;
    }
    var wy = spread(U.worlds.length), ly = spread(U.lines.length), sy = spread(U.stars.length);
    var lyBy = {}, syBy = {}, wyBy = {};
    U.worlds.forEach(function (w, i) { wyBy[w.id] = wy[i]; });
    U.lines.forEach(function (ln, i) { lyBy[ln.key] = ly[i]; });
    U.stars.forEach(function (s, i) { syBy[s.key] = sy[i]; });

    var s = "<svg class='cc-layer-svg' viewBox='0 0 " + Wd + " " + Ht + "' role='img' aria-label='Миры, линии и звёзды Founder Universe'>" +
      "<text class='cc-layer-h' x='" + colX.world + "' y='22' text-anchor='middle'>МИРЫ</text>" +
      "<text class='cc-layer-h' x='" + colX.line + "' y='22' text-anchor='middle'>ЛИНИИ</text>" +
      "<text class='cc-layer-h' x='" + colX.star + "' y='22' text-anchor='middle'>ЗВЁЗДЫ</text>";
    U.lines.forEach(function (ln) { s += curve(colX.world + 70, wyBy[ln.world.id], colX.line - 90, lyBy[ln.key], "cc-edge own st-flow"); });
    U.stars.forEach(function (st) { s += curve(colX.line + 90, lyBy[st.line.key], colX.star - 90, syBy[st.key], "cc-edge star" + (st.verified ? "" : " unverified")); });
    U.worlds.forEach(function (w) {
      s += "<g class='cc-lnode world'><rect x='" + (colX.world - 70) + "' y='" + (wyBy[w.id] - 13) + "' width='140' height='26' rx='13'/>" +
        "<text x='" + colX.world + "' y='" + (wyBy[w.id] + 4) + "' text-anchor='middle'>" + E(H.cut(w.title, 20)) + "</text></g>";
    });
    U.lines.forEach(function (ln) {
      var y = lyBy[ln.key];
      var routed = ln.stars.some(function (st) { return st.routes.length; });
      s += "<g class='cc-lnode line st-flow" + (isSelected("uline", ln.key) ? " selected" : "") + "'" + sel("uline", ln.key) + " tabindex='0'>" +
        "<rect x='" + (colX.line - 90) + "' y='" + (y - 12) + "' width='180' height='24' rx='7'/>" +
        "<polygon points='" + hexPoints(colX.line - 76, y, 7) + "'/>" +
        "<text x='" + (colX.line - 63) + "' y='" + (y + 4) + "'>" + E(H.cut(ln.title, 22)) + "</text>" +
        (ln.capital != null ? "<text class='cc-lnode-cap' x='" + (colX.line + 82) + "' y='" + (y + 4) + "' text-anchor='end'>$</text>" : "") +
        (routed ? "<circle class='cc-lnode-route' cx='" + (colX.line + 96) + "' cy='" + y + "' r='4'/>" : "") + "</g>";
    });
    U.stars.forEach(function (st) {
      var y = syBy[st.key];
      s += "<g class='cc-lnode star" + (st.verified ? " verified" : "") + (isSelected("star", st.key) ? " selected" : "") + "'" + sel("star", st.key) + " tabindex='0'>" +
        "<rect x='" + (colX.star - 90) + "' y='" + (y - 12) + "' width='180' height='24' rx='12'/>" +
        "<circle cx='" + (colX.star - 76) + "' cy='" + y + "' r='4'/>" +
        "<text x='" + (colX.star - 66) + "' y='" + (y + 4) + "'>" + E(H.cut(st.title, 21)) + "</text></g>";
    });
    s += "</svg>";
    return "<div class='cc-layer-wrap'>" + s + "</div>" +
      "<div class='cc-legend'><span><i class='ln own'></i>мир → линия</span><span><i class='ln star'></i>линия → проверенная звезда</span>" +
      "<span><i class='ln unver'></i>линия → непроверенная звезда</span><span><i class='mk route'></i>есть маршрут Оркестратора по точному ID</span><span>$ — у линии есть поле capital</span></div>";
  }

  function routeObjectMap() {
    var lines = M.active, objs = M.objs;
    var rowH = 34, top = 44;
    var rows = Math.max(lines.length, objs.length, 1);
    var Wd = 1000, Ht = top + rows * rowH + 20;
    var colX = { line: 300, obj: 760 };
    function spread(list) {
      var span = rows * rowH, step = list.length ? span / list.length : 0, out = {};
      list.forEach(function (k, i) { out[k] = top + step * i + step / 2; });
      return out;
    }
    var ly = spread(lines.map(function (l) { return l.key; }));
    var oy = spread(objs.map(function (x) { return x.key; }));
    var s = "<svg class='cc-layer-svg' viewBox='0 0 " + Wd + " " + Ht + "' role='img' aria-label='Маршруты и объекты'>" +
      "<defs><marker id='ccArrow2' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>" +
      "<path d='M0,0 L10,5 L0,10 z' class='cc-arrow-head'/></marker></defs>" +
      "<text class='cc-layer-h' x='" + colX.line + "' y='22' text-anchor='middle'>МАРШРУТЫ</text>" +
      "<text class='cc-layer-h' x='" + colX.obj + "' y='22' text-anchor='middle'>ОБЪЕКТЫ CONTINUITY</text>";
    lines.forEach(function (l) {
      if (!l.obj || oy[l.objId] == null) return;
      s += curve(colX.line + 90, ly[l.key], colX.obj - 90, oy[l.objId], "cc-edge own st-" + l.state);
    });
    M.edges.forEach(function (e) {
      if (ly[e.from] == null || ly[e.to] == null) return;
      var y1 = ly[e.from], y2 = ly[e.to], bend = colX.line - 110 - Math.min(120, Math.abs(y2 - y1) * 0.35);
      s += "<path class='cc-edge dep' d='M" + (colX.line - 90) + "," + y1 + " C" + bend + "," + y1 + " " + bend + "," + y2 + " " + (colX.line - 90) + "," + y2 + "' marker-end='url(#ccArrow2)'/>";
    });
    lines.forEach(function (l) {
      var y = ly[l.key];
      s += "<g class='cc-lnode line st-" + l.state + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + " tabindex='0'>" +
        "<rect x='" + (colX.line - 90) + "' y='" + (y - 13) + "' width='180' height='26' rx='7'/>" +
        "<polygon points='" + hexPoints(colX.line - 76, y, 8) + "'/>" +
        "<text x='" + (colX.line - 62) + "' y='" + (y + 4) + "'>" + E(H.cut(l.title, 22)) + "</text></g>";
    });
    objs.forEach(function (x) {
      var y = oy[x.key];
      s += "<g class='cc-lnode obj" + (isSelected("object", x.key) ? " selected" : "") + "'" + sel("object", x.key) + " tabindex='0'>" +
        "<rect x='" + (colX.obj - 90) + "' y='" + (y - 13) + "' width='180' height='26' rx='13'/>" +
        "<circle cx='" + (colX.obj - 76) + "' cy='" + y + "' r='4'/>" +
        "<text x='" + (colX.obj - 66) + "' y='" + (y + 4) + "'>" + E(H.cut(x.title, 21)) + "</text></g>";
    });
    s += "</svg>";
    return "<div class='cc-layer-wrap'>" + s + "</div>" +
      "<div class='cc-legend'><span><i class='ln own'></i>маршрут → объект (точный ID)</span><span><i class='ln dep'></i>явная зависимость</span></div>";
  }

  function curve(x1, y1, x2, y2, cls) {
    if (y1 == null || y2 == null) return "";
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

    page.querySelector("[data-cc='ulines']").innerHTML = !M.tu.ok ?
      unavailable("Канонические линии недоступны", "Temporal Universe не ответил (" + M.tu.reason + ").") :
      M.U.worlds.map(function (w) {
        return "<div class='cc-objgroup'><div class='cc-world-head'><span class='cc-world-dot'></span><b>" + E(w.title) + "</b><small>" + w.lines.length + " лин.</small></div>" +
          "<div class='cc-objgrid'>" + w.lines.map(function (ln) {
            var ver = ln.stars.filter(function (s) { return s.verified; }).length;
            var routes = ln.stars.reduce(function (n, s) { return n + s.routes.length; }, 0);
            return "<button class='cc-obj pl-placed" + (isSelected("uline", ln.key) ? " selected" : "") + "'" + sel("uline", ln.key) + ">" +
              "<span class='cc-obj-top'><b>" + E(H.cut(ln.title, 32)) + "</b>" + (ln.capital != null ? "<i class='cc-flag cap'>капитал</i>" : "") + "</span>" +
              "<small>" + E(ln.key) + "</small>" +
              "<span class='cc-obj-meta'><em>звёзд " + ln.stars.length + " · проверено " + ver + "</em>" +
              (routes ? "<em>маршрутов " + routes + "</em>" : "") + (ln.history.length ? "<em>событий " + ln.history.length + "</em>" : "") + "</span></button>";
          }).join("") + "</div></div>";
      }).join("");

    var objBox = page.querySelector("[data-cc='objects']");
    if (!ok("objects")) { objBox.innerHTML = unavailable("Реестр объектов недоступен", "Объекты не показываются по прошлым данным."); return; }
    var groups = {}, order = [];
    M.objs.forEach(function (x) {
      var g = !M.tu.ok ? "Мир не проверен" : (x.star ? x.star.world.title : "Вне Founder Universe");
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(x);
    });
    order.sort(function (a, b) {
      var tail = ["Вне Founder Universe", "Мир не проверен"];
      return (tail.indexOf(a) >= 0) - (tail.indexOf(b) >= 0) || a.localeCompare(b);
    });
    objBox.innerHTML = order.length ? order.map(function (g) {
      return "<div class='cc-objgroup'><div class='cc-world-head'><span class='cc-world-dot" + (g === "Вне Founder Universe" || g === "Мир не проверен" ? " off" : "") + "'></span><b>" + E(g) + "</b><small>" + groups[g].length + " объект.</small></div>" +
        "<div class='cc-objgrid'>" + groups[g].map(objectTile).join("") + "</div></div>";
    }).join("") : empty("Реестр пуст", "Continuity ответил без объектов.");
  }

  function objectTile(x) {
    var o = x.o, p = placementOfObject(x);
    return "<button class='cc-obj pl-" + p.bucket + (isSelected("object", x.key) ? " selected" : "") + "'" + sel("object", x.key) + ">" +
      "<span class='cc-obj-top'><b>" + E(H.cut(x.title, 30)) + "</b>" + (x.founder ? "<i class='cc-flag founder'>Основатель</i>" : "") + "</span>" +
      "<small>" + E(x.key) + " · " + E(H.ruStatus(o.declared_status)) + (x.origin ? " · происхождение: " + E(x.origin) : "") + "</small>" +
      "<span class='cc-obj-meta'><em>" + E(p.label) + "</em>" +
      (x.lines.length ? "<em>маршрут: " + E(H.cut(x.lines[0].title, 18)) + (x.lines.length > 1 ? " +" + (x.lines.length - 1) : "") + "</em>" : "") +
      (x.blockers.length ? "<em class='risk'>блокеров " + x.blockers.length + "</em>" : "") +
      "<em>" + E(H.ago(o.last_event_at)) + "</em></span></button>";
  }

  // ------------------------------------------------------------------ Размещение

  function renderPlacement(page) {
    page.querySelector("[data-cc='stamp']").innerHTML = readStamp();
    page.querySelector("[data-cc='source']").innerHTML = sourceBadge("adm") + sourceBadge("tu");
    var board = page.querySelector("[data-cc='placement']");
    var sums = page.querySelector("[data-cc='placement-sum']");
    var rules = page.querySelector("[data-cc='placement-rules']");
    if (!M.adm.ok) {
      sums.innerHTML = "";
      rules.innerHTML = empty("Правила допуска недоступны", "rules приходят только из Portfolio Admission.");
      board.innerHTML = "<div class='cc-pboard-off'>" + banner("unchecked", "Размещение не проверено",
        "Portfolio Admission недоступен (" + M.adm.reason + "). Панель не вычисляет кандидатов, сверку или конфликты сама — ни один объект не помечается как «требует сверки».") +
        (M.tu.ok ? "<div class='cc-foot-note'>Для справки: на Founder Map сейчас " + M.U.stars.length + " звёзд (Temporal Universe). Это видимость, а не результат допуска.</div>" : "") + "</div>";
      return;
    }
    var AD = M.AD, c = AD.counts;
    var sumDefs = [
      ["memory", "в памяти", "none"], ["placed", "размещены", "placed"], ["exact_owner_candidates", "кандидаты", "candidate"],
      ["review_required", "требуют сверки", "review"], ["owner_conflicts", "конфликты", "conflict"]
    ];
    var known = sumDefs.map(function (s) { return s[0]; });
    sums.innerHTML = sumDefs.map(function (s) {
      return "<div class='cc-psum pl-" + s[2] + "'><strong>" + E(c[s[0]] != null ? c[s[0]] : "—") + "</strong><span>" + E(s[1]) + " <i>" + E(s[0]) + "</i></span></div>";
    }).join("") + Object.keys(c).filter(function (k) { return known.indexOf(k) < 0; }).map(function (k) {
      return "<div class='cc-psum pl-none'><strong>" + E(scalar(c[k])) + "</strong><span><i>" + E(k) + "</i></span></div>";
    }).join("");

    var placedStars = M.tu.ok ? M.U.stars : [];
    board.innerHTML = ["placed", "candidate", "review", "conflict", "archive"].map(function (b) {
      var meta = BUCKET_META[b], body, n;
      if (b === "placed") {
        n = M.tu.ok ? placedStars.length : (c.placed != null ? c.placed : AD.trustedCount);
        body = M.tu.ok ? (placedStars.length ? placedStars.map(starCard).join("") : empty("Звёзд нет", "")) :
          empty("Список звёзд недоступен", "Temporal Universe не ответил. Счётчик placed — из Portfolio Admission" + (AD.trustedCount ? ", trusted_owner_map: " + AD.trustedCount + " записей" : "") + ".");
      } else {
        var items = AD.buckets[b];
        n = items.length;
        body = items.length ? items.map(admCard).join("") : empty("Пусто", "");
      }
      var archived = b === "candidate" || b === "review" || b === "conflict" ? AD.buckets.archive.filter(function (it) { return it.sourceBucket === b; }).length : 0;
      return "<section class='cc-pcol pl-" + b + "'><header><b>" + E(meta.title) + " <em>" + E(n) + "</em></b><small>" + E(meta.hint) +
        (archived ? " · ещё " + archived + " в архиве" : "") + "</small></header><div class='cc-pcol-body'>" + body + "</div></section>";
    }).join("");

    rules.innerHTML = "<ul class='cc-bounds'>" + AD.rules.map(function (r) { return "<li><b>Правило допуска:</b> " + E(scalar(r)) + "</li>"; }).join("") +
      "<li>Кандидат с предложенной линией — это структурная принадлежность, а не видимость: на Founder Map он не появляется, пока не станет звездой.</li>" +
      "<li>owning_branch показан как происхождение объекта, а не как его мир.</li>" +
      "<li>Архив — элементы допуска с архивным или историческим state; исходная группа указана на карточке.</li></ul>";
  }

  function starCard(s) {
    return "<div class='cc-pcard pl-placed" + (isSelected("star", s.key) ? " selected" : "") + "'" + sel("star", s.key) + ">" +
      "<b>" + E(H.cut(s.title, 32)) + "</b><small>" + E((s.memoryId || "без memory_id") + " · " + s.world.title + " › " + s.line.title) + "</small>" +
      "<div class='cc-pflags'><span class='yes'>линия: " + E(H.cut(s.line.title, 20)) + "</span><span class='yes'>звезда на Founder Map</span>" +
      "<span class='" + (s.verified ? "yes" : "no") + "'>" + (s.verified ? "проверена" : "не проверена") + "</span></div></div>";
  }

  function admCard(it) {
    var r = it.raw, vis = mapVisibility(it.memoryId);
    var member = it.sourceBucket === "candidate" ?
      (it.proposedLine ? { cls: "maybe", text: "предложена линия: " + H.cut(it.proposedLine.title, 22) } : { cls: "maybe", text: "предложена линия: " + (r.proposed_line || "—") }) :
      { cls: "no", text: "линия не определена" };
    var reason = it.sourceBucket === "review" ? r.reason : (it.sourceBucket === "candidate" ? r.basis : (r.reason || kvText(r, ["memory_id", "title", "kind", "state", "evidence_status", "owning_branch"])));
    return "<div class='cc-pcard pl-" + it.bucket + (isSelected("adm", it.key) ? " selected" : "") + "'" + sel("adm", it.key) + ">" +
      "<b>" + E(H.cut(it.title, 34)) + "</b>" +
      "<small>" + E([it.memoryId, r.kind, r.state, r.evidence_status].filter(Boolean).join(" · ")) + "</small>" +
      (r.owning_branch ? "<small>происхождение: " + E(r.owning_branch) + "</small>" : "") +
      (reason ? "<small class='" + (it.sourceBucket === "candidate" ? "basis" : "warn") + "'>" + E(H.cut(scalar(reason), 110)) + "</small>" : "") +
      (it.bucket === "archive" ? "<small>из группы " + E(it.source) + "</small>" : "") +
      "<div class='cc-pflags'><span class='" + member.cls + "'>" + E(member.text) + "</span><span class='" + vis.cls + "'>" + E(vis.text) + "</span></div></div>";
  }

  // ------------------------------------------------------------------ Inspector

  function section(title, body) {
    return "<section class='cc-insp-sec'><h4>" + E(title) + "</h4>" + body + "</section>";
  }

  function ceilingRow(kind, text) {
    var icon = { ok: "✓", warn: "!", no: "✕", info: "i" }[kind];
    return "<li class='" + kind + "'><span>" + icon + "</span>" + E(text) + "</li>";
  }

  function crumbs(parts) {
    return "<div class='cc-crumbs'>" + parts.map(function (p, i) {
      return (i ? "<i>›</i>" : "") + "<span" + (p.cur ? " class='cur'" : "") + ">" + E(p.t) + "</span>";
    }).join("") + "</div>";
  }

  function inspectLine(l) {
    var r = l.r, place = routePlace(l);
    var blockers = A(r.blockers).map(function (b) { return typeof b === "object" ? (b.title || b.blocker || b.id || "блокер") : String(b); });
    var objBlockers = l.objBlockers.map(function (b) { return (b.title || b.blocker || "открытый блокер") + " · объект " + (b.object_id || ""); });
    var explain = [];
    explain.push("Маршрут «" + l.title + "» " + (r.stage || r.status ? "сейчас на этапе «" + H.humanCode(r.stage || r.status) + "»." : "не передаёт этап."));
    explain.push(l.risk.stale == null ? "Дата последнего движения источником не передана." : "Последнее движение — " + H.ago(r.last_movement_at) + ".");
    explain.push(!r.ball_owner ? "Владелец хода не назначен." : (l.waiting ? "Ход у «" + r.ball_owner + "» — система ждёт его действия." : "Ход у Основателя."));
    if (l.risk.blockers || l.objBlockers.length) explain.push("Открытых блокеров: " + (l.risk.blockers + l.objBlockers.length) + ".");
    if (l.downstream.length) explain.push("От него явно зависят " + l.downstream.length + " маршрута — остановка задержит их.");
    if (l.star) explain.push("В Founder Universe это звезда «" + l.star.title + "» линии «" + l.star.line.title + "» (мир «" + l.star.world.title + "»).");

    var hist = [];
    if (l.star) l.star.line.history.forEach(function (h) {
      hist.push("<li><b>" + E(pickTime(h) ? H.ago(pickTime(h)) : "без даты") + "</b>" + E(H.cut(pickText(h) || "событие линии", 110)) + " <em>· Temporal Universe</em></li>");
    });
    if (l.obj && l.obj.last_event_at) hist.push("<li><b>" + E(H.ago(l.obj.last_event_at)) + "</b>" + E((l.obj.last_meaning_kind ? H.signalKindRu(l.obj.last_meaning_kind) : "событие объекта") + (l.obj.last_summary ? " — " + H.cut(l.obj.last_summary, 110) : "")) + " <em>· Continuity</em></li>");
    if (r.last_movement_at) hist.push("<li><b>" + E(H.ago(r.last_movement_at)) + "</b>движение по маршруту <em>· Оркестратор</em></li>");

    var ceiling = [
      ceilingRow("ok", "Этап, ход и условие — из Оркестратора (observer/routes)"),
      !M.tu.ok ? ceilingRow("warn", "Мир и каноническая линия не проверены — Temporal Universe недоступен") :
        (l.star ? ceilingRow("ok", "Мир и линия — Temporal Universe, точное совпадение " + l.objId + " = memory_id") : ceilingRow("warn", "Нет звезды с memory_id " + (l.objId || "—") + " — маршрут вне Founder Universe")),
      l.obj ? ceilingRow("ok", "Объект " + l.objId + " есть в реестре Continuity") :
        (l.objMissing ? ceilingRow("warn", "Объект " + l.objId + " не найден в реестре — нужна сверка") : ceilingRow("warn", "Маршрут не ссылается на объект")),
      ceilingRow(l.upstream.length || l.downstream.length ? "ok" : "info", l.upstream.length || l.downstream.length ? "Зависимости — только явные поля источника" : "Явных зависимостей нет; по догадке не строятся"),
      ceilingRow("no", "Причинное влияние на другие линии — не доказано"),
      ceilingRow("info", "Цвет состояния — диагностика панели, не канонический приоритет")
    ];

    var step = r.next_move ? { text: r.next_move, src: "Оркестратор · next_move" } :
      (l.rd1 && l.rd1.next_move ? { text: l.rd1.next_move, src: "RD1 · next_move" } :
        { text: "Источник не передал следующий ход. Минимальный шаг — сверить маршрут с владельцем хода и зафиксировать next_move в Оркестраторе.", src: "рекомендация панели: нужна сверка" });

    return "<div class='cc-insp-head'>" + hexBadge(initials(l.title), l.state, "lg") +
      "<div><h3>" + E(l.title) + "</h3><small>Маршрут Оркестратора" + (l.area ? " · " + E(H.humanCode(l.area)) : "") + "</small></div></div>" +
      section("Где в структуре", crumbs([{ t: "ICAM" }, { t: place.world ? place.world.title : (M.tu.ok ? "вне Founder Universe" : "мир не проверен") },
        { t: place.uline ? H.cut(place.uline.title, 22) : "линия не определена" }, { t: l.objId || "без объекта", cur: true }]) +
        (l.origin ? "<p class='muted'>Происхождение объекта (owning_branch): " + E(l.origin) + "</p>" : "")) +
      section("Текущее состояние", "<div class='cc-insp-state st-" + l.state + "'>" + stateDot(l.state) +
        "<small>" + E(STATE_META[l.state].hint) + "</small><em>" + E(H.humanCode(r.stage || r.status || "этап не передан")) + "</em></div>") +
      section("Человеческим языком", "<p>" + E(explain.join(" ")) + "</p>") +
      section("Почему важна", "<p>" + E(r.priority ? "Приоритет в источнике: " + r.priority + "." : "Источник не передаёт обоснование важности.") +
        (l.downstream.length ? " " + E("Её остановка явно задержит " + l.downstream.length + " маршрута.") : "") +
        (l.star && l.star.line.capital != null ? " " + E("У канонической линии есть поле capital.") : "") + "</p>") +
      section("Недавняя история", hist.length ? "<ul class='cc-hist'>" + hist.join("") + "</ul>" : "<p class='muted'>Датированных событий нет.</p>") +
      section("Что система ждёт", "<p>" + E(r.review_condition || (l.waiting ? "Действия от «" + r.ball_owner + "»." : "Условие не передано.")) + "</p>" +
        (l.star && temporalCells(l.star.temporal).cells["Ожидание"] ? "<p class='muted'>Temporal Universe · ожидание: " + E(temporalCells(l.star.temporal).cells["Ожидание"]) + "</p>" : "") +
        (l.rd1 && l.rd1.next_gate ? "<p class='muted'>RD1 · следующий гейт: " + E(l.rd1.next_gate) + "</p>" : "")) +
      section("Следующий переход", "<p>" + E(l.next || "Не передан источником.") + "</p>" + (l.nextSource ? "<p class='muted'>" + E(l.nextSource) + "</p>" : "")) +
      section("Блокеры", blockers.length || objBlockers.length ?
        "<ul class='cc-blockers'>" + blockers.concat(objBlockers).map(function (b) { return "<li>" + E(H.cut(b, 110)) + "</li>"; }).join("") + "</ul>" :
        (l.risk.blockers ? "<p>Источник сообщает " + l.risk.blockers + " блокер(а) без описания.</p>" : "<p class='muted'>Открытых блокеров нет.</p>")) +
      section("Связи", (l.star ? "<small>Звезда Founder Universe</small><div class='cc-refs'><button class='cc-ref uni'" + sel("star", l.star.key) + ">★ " + E(H.cut(l.star.title, 26)) + "</button>" + ulineRef(l.star.line) + "</div>" : "") +
        (l.upstream.length ? "<small>Зависит от</small><div class='cc-refs'>" + lineRefs(l.upstream) + "</div>" : "") +
        (l.downstream.length ? "<small>От него зависят</small><div class='cc-refs'>" + lineRefs(l.downstream) + "</div>" : "") +
        (l.bridges.length ? "<small>Общий объект с</small><div class='cc-refs'>" + lineRefs(l.bridges) + "</div>" : "") +
        (l.obj ? "<small>Объект Continuity</small><div class='cc-refs'><button class='cc-ref'" + sel("object", l.objId) + ">" + E(H.cut(l.obj.name || l.objId, 26)) + "</button></div>" : "") +
        (!l.upstream.length && !l.downstream.length && !l.bridges.length && !l.obj && !l.star ? "<p class='muted'>Доказанных связей нет.</p>" : "")) +
      section("Доказательный потолок", "<ul class='cc-ceiling'>" + ceiling.join("") + "</ul>") +
      "<div class='cc-insp-step'><h4>Минимальный следующий шаг</h4><p>" + E(step.text) + "</p><small>" + E(step.src) + "</small></div>" +
      "<div class='cc-insp-nav'><a href='#timeline'>Во времени →</a><a href='#links'>Связи →</a></div>";
  }

  function inspectObject(x) {
    var o = x.o, p = placementOfObject(x);
    var explain = [];
    explain.push("Объект «" + x.title + "» (" + x.key + ") в реестре Continuity со статусом «" + H.ruStatus(o.declared_status) + "».");
    if (!M.tu.ok) explain.push("Мир не проверен: Temporal Universe недоступен.");
    else explain.push(x.star ? "На Founder Map это звезда линии «" + x.star.line.title + "» в мире «" + x.star.world.title + "»." : "Звезды с таким memory_id на Founder Map нет.");
    explain.push("Допуск: " + p.label + ".");
    if (x.lines.length) explain.push("Маршрут Оркестратора: «" + x.lines[0].title + "»" + (x.lines.length > 1 ? " и ещё " + (x.lines.length - 1) : "") + ".");
    if (x.founder) explain.push("Помечен как требующий Основателя.");
    if (x.blockers.length) explain.push("Открытых блокеров: " + x.blockers.length + ".");
    var step = p.bucket === "unchecked" ? "Дождаться Portfolio Admission: без него размещение не оценивается." :
      p.bucket === "review" ? "Разобрать причину сверки из слоя допуска: " + (x.adm && x.adm.raw.reason || "причина не указана") + "." :
      p.bucket === "candidate" ? "Подтвердить или отклонить предложенную линию — до этого объект не звезда." :
      p.bucket === "conflict" ? "Решить конфликт владельцев вручную." :
      p.bucket === "archive" ? "Действий не требуется: архив." :
      p.bucket === "absent" ? "Объекта нет в слое допуска — проверить, попадает ли он в память портфеля." :
      (x.lines[0] && x.lines[0].next) || "Следующий ход не передан источником.";
    return "<div class='cc-insp-head'><span class='cc-obj-badge pl-" + p.bucket + "'>" + E(initials(x.title)) + "</span>" +
      "<div><h3>" + E(x.title) + "</h3><small>Объект Continuity · " + E(x.key) + "</small></div></div>" +
      section("Где в структуре", crumbs([{ t: "ICAM" }, { t: x.star ? x.star.world.title : (M.tu.ok ? "вне Founder Universe" : "мир не проверен") },
        { t: x.star ? H.cut(x.star.line.title, 20) : "линия не определена" }, { t: x.key, cur: true }]) +
        (x.origin ? "<p class='muted'>Происхождение (owning_branch): " + E(x.origin) + "</p>" : "")) +
      section("Текущее состояние", "<div class='cc-insp-state'><span class='cc-state st-flow'><i></i>" + E(H.ruStatus(o.declared_status)) + "</span>" +
        "<small>допуск: " + E(p.label) + "</small></div>") +
      section("Человеческим языком", "<p>" + E(explain.join(" ")) + "</p>") +
      section("Недавняя история", o.last_event_at ? "<ul class='cc-hist'><li><b>" + E(H.ago(o.last_event_at)) + "</b>" +
        E((o.last_meaning_kind ? H.signalKindRu(o.last_meaning_kind) : "событие") + (o.last_summary ? " — " + H.cut(o.last_summary, 120) : "")) + "</li></ul>" : "<p class='muted'>Событий нет — last_event_at не передан.</p>") +
      section("Следующий переход", "<p>" + E(x.star && temporalCells(x.star.temporal).cells["Следующий переход"] || x.rd1 && (x.rd1.next_gate || x.rd1.next_move) || (x.lines[0] && x.lines[0].next) || "Не передан источником.") + "</p>") +
      section("Блокеры", x.blockers.length ? "<ul class='cc-blockers'>" + x.blockers.map(function (b) {
        return "<li>" + E(H.cut(b.title || b.blocker || "открытый блокер", 110)) + " · " + E(b.status || "открыт") + "</li>";
      }).join("") + "</ul>" : "<p class='muted'>Открытых нетестовых блокеров нет.</p>") +
      section("Связи", (x.star ? "<small>Звезда</small><div class='cc-refs'><button class='cc-ref uni'" + sel("star", x.star.key) + ">★ " + E(H.cut(x.star.title, 26)) + "</button>" + ulineRef(x.star.line) + "</div>" : "") +
        (x.lines.length ? "<small>Маршруты</small><div class='cc-refs'>" + lineRefs(x.lines.map(function (l) { return l.key; })) + "</div>" : "") +
        (x.adm ? "<small>Слой допуска</small><div class='cc-refs'><button class='cc-ref'" + sel("adm", x.adm.key) + ">" + E(x.adm.source) + "</button></div>" : "") +
        (!x.star && !x.lines.length && !x.adm ? "<p class='muted'>Доказанных связей нет.</p>" : "")) +
      section("Доказательный потолок", "<ul class='cc-ceiling'>" +
        ceilingRow("ok", "Идентичность и статус — реестр Continuity") +
        (M.tu.ok ? ceilingRow(x.star ? "ok" : "warn", x.star ? "Мир и линия — Temporal Universe по точному memory_id" : "Звезды с этим ID нет — мир не определён") : ceilingRow("warn", "Мир не проверен — Temporal Universe недоступен")) +
        (M.adm.ok ? ceilingRow("ok", "Статус допуска — Portfolio Admission") : ceilingRow("warn", "Допуск не проверен — Portfolio Admission недоступен")) +
        ceilingRow("info", "owning_branch — происхождение, не мир") +
        ceilingRow("no", "Кандидаты по сходству названий не вычисляются") + "</ul>") +
      "<div class='cc-insp-step'><h4>Минимальный следующий шаг</h4><p>" + E(step) + "</p><small>по данным слоя допуска и Continuity</small></div>" +
      "<div class='cc-insp-nav'><a href='#placement'>Размещение →</a><a href='#timeline'>Во времени →</a></div>";
  }

  function inspectStar(s) {
    var tc = temporalCells(s.temporal);
    var explain = "Звезда «" + s.title + "»" + (s.canonical && s.canonical !== s.title ? " (каноническое имя «" + s.canonical + "»)" : "") +
      " размещена в линии «" + s.line.title + "» мира «" + s.world.title + "». " +
      (s.verified ? "Принадлежность проверена источником." : "Принадлежность источником не проверена (verified = false).") +
      (s.routes.length ? " По ней идёт маршрут Оркестратора «" + s.routes[0].title + "»." : " Маршрута Оркестратора с этим ID нет.");
    var extraKeys = Object.keys(tc.extra);
    return "<div class='cc-insp-head'><span class='cc-obj-badge pl-placed star'>★</span>" +
      "<div><h3>" + E(s.title) + "</h3><small>Звезда Founder Universe · " + E(s.memoryId || "без memory_id") + "</small></div></div>" +
      section("Где в структуре", crumbs([{ t: "ICAM" }, { t: s.world.title }, { t: H.cut(s.line.title, 22) }, { t: s.memoryId || s.key, cur: true }])) +
      section("Текущее состояние", "<div class='cc-insp-state st-" + (s.verified ? "flow" : "unknown") + "'><span class='cc-state st-" + (s.verified ? "flow" : "unknown") + "'><i></i>" +
        (s.verified ? "проверена" : "не проверена") + "</span><small>на Founder Map</small><em>" + E(tc.cells["Настоящее"] || "настоящее не передано") + "</em></div>") +
      section("Человеческим языком", "<p>" + E(explain) + "</p>") +
      section("Во времени", "<ul class='cc-hist'>" + TEMPORAL_ORDER.map(function (lab) {
        return "<li><b>" + E(lab) + "</b>" + E(tc.cells[lab] || "не передано") + "</li>";
      }).join("") + extraKeys.map(function (k) { return "<li><b>" + E(k) + "</b>" + E(scalar(tc.extra[k])) + "</li>"; }).join("") + "</ul>" +
        (!s.temporal ? "<p class='muted'>Поле temporal у звезды пустое.</p>" : "")) +
      section("Связи", "<small>Линия</small><div class='cc-refs'>" + ulineRef(s.line) + "</div>" +
        (s.routes.length ? "<small>Маршруты</small><div class='cc-refs'>" + lineRefs(s.routes.map(function (l) { return l.key; })) + "</div>" : "") +
        (s.obj ? "<small>Объект Continuity</small><div class='cc-refs'><button class='cc-ref'" + sel("object", s.memoryId) + ">" + E(H.cut(s.obj.name || s.memoryId, 26)) + "</button></div>" : "")) +
      section("Доказательный потолок", "<ul class='cc-ceiling'>" +
        ceilingRow("ok", "Мир, линия и размещение — Temporal Universe") +
        ceilingRow(s.verified ? "ok" : "warn", s.verified ? "verified = true" : "verified = false: принадлежность не подтверждена") +
        ceilingRow(s.routes.length ? "ok" : "info", s.routes.length ? "Маршрут связан по точному ID" : "Маршрута с этим ID нет") +
        ceilingRow("no", "Связи с другими звёздами, кроме общей линии, не передаются") + "</ul>") +
      "<div class='cc-insp-step'><h4>Минимальный следующий шаг</h4><p>" + E(s.routes[0] && s.routes[0].next || tc.cells["Следующий переход"] || (s.verified ? "Следующий переход не передан." : "Подтвердить принадлежность звезды линии.")) +
      "</p><small>" + E(s.routes[0] && s.routes[0].next ? "Оркестратор · next_move" : (tc.cells["Следующий переход"] ? "Temporal Universe · temporal" : "рекомендация панели")) + "</small></div>" +
      "<div class='cc-insp-nav'><a href='#timeline'>Во времени →</a><a href='#links'>Связи →</a></div>";
  }

  function inspectULine(ln) {
    var ver = ln.stars.filter(function (s) { return s.verified; }).length;
    var routes = [];
    ln.stars.forEach(function (s) { s.routes.forEach(function (r) { routes.push(r.key); }); });
    var trajs = M.U.trajectories.filter(function (t) { return trajectoryLines(t).some(function (x) { return x.ul === ln; }); });
    return "<div class='cc-insp-head'>" + hexBadge(initials(ln.title), "flow", "lg") +
      "<div><h3>" + E(ln.title) + "</h3><small>Каноническая линия · " + E(ln.key) + "</small></div></div>" +
      section("Где в структуре", crumbs([{ t: "ICAM" }, { t: ln.world.title }, { t: H.cut(ln.title, 24), cur: true }])) +
      section("Человеческим языком", "<p>" + E("Линия «" + ln.title + "» мира «" + ln.world.title + "»: " + ln.stars.length + " звёзд, проверено " + ver + ". " +
        (routes.length ? "По её звёздам идёт " + routes.length + " маршрут(а) Оркестратора." : "Маршрутов Оркестратора по её звёздам нет.") +
        (trajs.length ? " Входит в траекторию «" + pickText(trajs[0]) + "»." : "")) + "</p>") +
      section("Недавняя история", ln.history.length ? "<ul class='cc-hist'>" + ln.history.map(function (h) {
        return "<li><b>" + E(pickTime(h) ? H.ago(pickTime(h)) : "без даты") + "</b>" + E(H.cut(pickText(h) || kvText(h, []), 110)) + "</li>";
      }).join("") + "</ul>" : "<p class='muted'>recent_history пуст.</p>") +
      section("Капитал", ln.capital == null ? "<p class='muted'>Поле capital не передано — ресурсная связь не показывается.</p>" :
        "<div class='cc-kvs'>" + (typeof ln.capital === "object" ? kvHTML(ln.capital) : "<span class='cc-kv'>" + E(scalar(ln.capital)) + "</span>") + "</div>") +
      section("Звёзды", ln.stars.length ? "<div class='cc-refs'>" + ln.stars.map(function (s) {
        return "<button class='cc-ref uni" + (s.verified ? "" : " dim") + "'" + sel("star", s.key) + ">★ " + E(H.cut(s.title, 24)) + "</button>";
      }).join("") + "</div>" : "<p class='muted'>Звёзд нет.</p>") +
      (routes.length ? section("Маршруты", "<div class='cc-refs'>" + lineRefs(routes) + "</div>") : "") +
      (trajs.length ? section("Траектории", "<p>" + trajs.map(function (t) { return E(pickText(t)); }).join(" · ") + "</p>") : "") +
      section("Доказательный потолок", "<ul class='cc-ceiling'>" +
        ceilingRow("ok", "Состав, история и капитал — Temporal Universe") +
        ceilingRow("no", "Влияние на другие линии не передаётся источником") + "</ul>") +
      "<div class='cc-insp-nav'><a href='#timeline'>Во времени →</a><a href='#links'>Связи →</a></div>";
  }

  function inspectAdm(it) {
    var r = it.raw, vis = mapVisibility(it.memoryId);
    var what = it.sourceBucket === "candidate" ? "Кандидат на точную связь: слой допуска предлагает линию «" + (it.proposedLine ? it.proposedLine.title : r.proposed_line || "—") + "». Это ещё не звезда: на Founder Map объект не виден, пока его не разместят." :
      it.sourceBucket === "review" ? "Объект памяти требует сверки: " + (r.reason || "причина не указана") + "." :
      "Конфликт владельцев: " + (r.reason || kvText(r, ["title", "memory_id"]) || "подробности не переданы") + ".";
    var skip = ["title"];
    return "<div class='cc-insp-head'><span class='cc-obj-badge pl-" + it.bucket + "'>" + E(initials(it.title)) + "</span>" +
      "<div><h3>" + E(it.title) + "</h3><small>Portfolio Admission · " + E(it.source) + "</small></div></div>" +
      section("Человеческим языком", "<p>" + E(what) + (it.bucket === "archive" ? " " + E("Состояние «" + r.state + "» — показан в архиве.") : "") + "</p>") +
      section("Поля источника", "<div class='cc-kvs'>" + kvHTML(r, skip) + "</div>") +
      section("Принадлежность и видимость", "<div class='cc-pflags'><span class='" + (it.sourceBucket === "candidate" ? "maybe" : "no") + "'>" +
        E(it.sourceBucket === "candidate" ? "предложенная линия (структурно)" : "линия не определена") + "</span><span class='" + vis.cls + "'>" + E(vis.text) + "</span></div>" +
        (r.owning_branch ? "<p class='muted'>owning_branch «" + E(r.owning_branch) + "» — происхождение объекта, не мир.</p>" : "")) +
      (it.proposedLine ? section("Связи", "<small>Предложенная линия</small><div class='cc-refs'>" + ulineRef(it.proposedLine) + "</div>") : "") +
      "<div class='cc-insp-step'><h4>Минимальный следующий шаг</h4><p>" + E(
        it.sourceBucket === "candidate" ? "Подтвердить или отклонить предложенную линию." :
        it.sourceBucket === "review" ? "Разобрать причину сверки." : "Решить конфликт владельцев вручную.") + "</p><small>решение принимается вне панели — панель только читает</small></div>" +
      "<div class='cc-insp-nav'><a href='#placement'>Размещение →</a></div>";
  }

  function renderInspectors() {
    var html, label = "Инспектор";
    var s = ui.selected;
    if (s && s.kind === "line" && M.lineByKey[s.key]) { html = inspectLine(M.lineByKey[s.key]); label = "Инспектор маршрута"; }
    else if (s && s.kind === "object" && M.objByKey[s.key]) { html = inspectObject(M.objByKey[s.key]); label = "Инспектор объекта"; }
    else if (s && s.kind === "star" && M.U && M.U.starByKey[s.key]) { html = inspectStar(M.U.starByKey[s.key]); label = "Инспектор звезды"; }
    else if (s && s.kind === "uline" && M.U && M.U.lineById[s.key]) { html = inspectULine(M.U.lineById[s.key]); label = "Инспектор линии"; }
    else if (s && s.kind === "adm" && M.AD && M.AD.items[s.key]) { html = inspectAdm(M.AD.items[s.key]); label = "Инспектор допуска"; }
    else html = "<div class='cc-insp-idle'><b>Инспектор</b><span>Выберите маршрут, линию, звезду или объект — здесь появятся состояние, история, связи и доказательный потолок.</span></div>";
    document.querySelectorAll("[data-cc-inspector]").forEach(function (el) {
      el.innerHTML = "<div class='cc-insp-title'><span>" + E(label) + "</span></div>" + html;
    });
  }

  // ------------------------------------------------------------------ wiring

  function selectionValid(s) {
    if (!s) return false;
    if (s.kind === "line") return !!M.lineByKey[s.key];
    if (s.kind === "object") return !!M.objByKey[s.key];
    if (s.kind === "star") return !!(M.U && M.U.starByKey[s.key]);
    if (s.kind === "uline") return !!(M.U && M.U.lineById[s.key]);
    if (s.kind === "adm") return !!(M.AD && M.AD.items[s.key]);
    return false;
  }

  function defaultSelection() {
    if (selectionValid(ui.selected)) return;
    var pick = M.active.filter(function (l) { return l.state === "critical"; })[0] ||
      M.active.filter(function (l) { return l.state === "return"; })[0] || M.active[0];
    ui.selected = pick ? { kind: "line", key: pick.key } : (M.U && M.U.lines[0] ? { kind: "uline", key: M.U.lines[0].key } : null);
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
    if (navCount) {
      var n = M.adm.ok ? reviewTotal() : 0;
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
