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
  var ui = { selected: null, lineFilter: "all", routesAll: false };
  var M = null; // current model

  var TU_SCHEMA = "atlas-temporal-universe.v0.";
  var ADM_SCHEMA = "atlas-portfolio-admission.v0.";
  var FP_SCHEMA = "founder-projection.v0.";
  var OI_SCHEMA = "organizational-intelligence-projection.v0.";
  var SR_SCHEMA = "steward-reconciliation-projection.v0.";
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

  // Columns of a star's `temporal` block (atlas-temporal-universe.v0.1):
  // history[] → История, now.state → Сейчас, waiting[] → Ждём,
  // next_transition[] → Следующий переход.
  var TEMPORAL_ORDER = ["История", "Сейчас", "Ждём", "Следующий переход"];

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
  var TEXT_KEYS = ["change", "title", "summary", "label", "text", "name", "description", "event", "what"];
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

  // Temporal Universe history event: {event_id, change, transition, subject,
  // line, world, evidence_count, truth_status, why_it_matters, next_milestone,
  // source_branch, scope, binding_class, target, date}. Known fields are read
  // by name; only an event without them falls back to the generic readers.
  function eventView(h) {
    if (h == null || typeof h !== "object") return { main: h == null ? "" : String(h), why: "", next: "", at: null, proof: "", known: false, raw: h };
    var known = h.change != null || h.why_it_matters != null || h.next_milestone != null || h.event_id != null;
    return {
      main: h.change || pickText(h) || "",
      why: h.why_it_matters || "",
      next: h.next_milestone || "",
      at: h.date && isFinite(new Date(h.date).getTime()) ? h.date : pickTime(h),
      proof: [h.truth_status, h.binding_class].filter(Boolean).join(" · "),
      transition: h.transition || "",
      subject: h.subject || "",
      known: known, raw: h
    };
  }

  function eventBody(v, title) {
    return "<b>" + E(H.cut(title || v.main || "событие", 90)) + "</b>" +
      (title && v.main ? "<small>" + E(H.cut(v.main, 110)) + "</small>" : "") +
      (v.why ? "<small class='why'>" + E(H.cut(v.why, 120)) + "</small>" : "") +
      (v.next ? "<small class='next'>→ " + E(H.cut(v.next, 90)) + "</small>" : "") +
      (!v.known && v.raw && typeof v.raw === "object" ? "<small>" + E(H.cut(kvText(v.raw, TEXT_KEYS.concat(TIME_KEYS)), 120)) + "</small>" : "") +
      proofTags(v, true);
  }

  function temporalTextRu(value) {
    var raw = String(value == null ? "" : value).trim();
    var exact = {
      "External response / fresh status confirmation.": "Внешний ответ или новое подтверждение статуса.",
      "Complete authorized packet not yet recognized by current Testing run: execution lock, execution script, parent artifacts, frozen source data.": "Текущий прогон Testing ещё не распознал полный разрешённый пакет: фиксацию запуска, сценарий исполнения, родительские артефакты и замороженные исходные данные.",
      "External NIST consideration / no response required from system now.": "Идёт внешнее рассмотрение NIST; сейчас ответ или действие системы не требуется.",
      "Operationalized mechanisms and frozen scoring/calibration rules are not complete.": "Операционализация механизмов и замороженные правила оценки/калибровки ещё не завершены.",
      "Outcome windows not yet resolved; first gate around 2026-10-13.": "Окна исходов ещё не разрешились; первый контрольный рубеж ожидается примерно 13 октября 2026 года.",
      "Outcome windows not yet mature.": "Окна исходов ещё не созрели для оценки.",
      "External replies / opportunity creation.": "Внешние ответы или появление возможности.",
      "External program decision/credits.": "Внешнее решение программы или начисление кредитов."
    };
    return exact[raw] || raw;
  }

  function listItems(v) {
    if (v == null) return [];
    return (Array.isArray(v) ? v : [v]).map(function (x) {
      if (x && typeof x === "object") return { title: temporalTextRu(x.title || pickText(x) || x.id || "—"), timeClass: x.time_class || null };
      return { title: temporalTextRu(String(x)), timeClass: null };
    });
  }

  function temporalView(t) {
    var out = { history: [], now: null, waiting: [], next: [], extra: {}, any: false };
    if (!t || typeof t !== "object") return out;
    Object.keys(t).forEach(function (k) {
      var v = t[k];
      if (k === "history") out.history = out.history.concat(A(v).map(eventView));
      else if (k === "now") out.now = v && typeof v === "object" ? (v.state != null ? String(v.state) : null) : (v != null ? String(v) : null);
      else if (k === "waiting") out.waiting = out.waiting.concat(listItems(v));
      else if (k === "next_transition") out.next = out.next.concat(listItems(v));
      // legacy aliases, kept only for compatibility with older payloads
      else if (k === "present" || k === "current") { if (out.now == null && v != null) out.now = scalar(v); }
      else if (k === "past") { if (v != null) out.history.push(eventView(typeof v === "object" ? v : { change: String(v) })); }
      else if (k === "waiting_for" || k === "pending") out.waiting = out.waiting.concat(listItems(v));
      else if (k === "next" || k === "expected") out.next = out.next.concat(listItems(v));
      else out.extra[k] = v;
    });
    out.any = !!(out.history.length || out.now || out.waiting.length || out.next.length);
    return out;
  }

  function temporalCells(tv) {
    var last = tv.history.slice().sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); })[0];
    var join = function (xs) { return xs.map(function (x) { return x.title; }).join("; "); };
    return {
      "История": last ? last.main + (last.at ? " · " + H.ago(last.at) : "") + (tv.history.length > 1 ? " (+" + (tv.history.length - 1) + ")" : "") : null,
      "Сейчас": tv.now,
      "Ждём": tv.waiting.length ? join(tv.waiting) : null,
      "Следующий переход": tv.next.length ? join(tv.next) : null
    };
  }

  // Exact title equality only. A title shared by several lines resolves to
  // nothing rather than to a guess.
  function lineByExactTitle(title) { return exactTitle(M && M.U, title); }

  function capitalItems(ln) {
    var c = ln && ln.fp && ln.fp.capital && ln.fp.capital.length ? ln.fp.capital : ln.capital;
    if (c == null) return [];
    if (Array.isArray(c)) return c.map(function (x) {
      if (x && typeof x === "object") return x.resource || x.preserved_resource || x.title || x.id || pickText(x);
      return String(x);
    }).filter(Boolean);
    if (typeof c === "object") return Object.keys(c).length ? [kvText(c, [])] : [];
    return [String(c)];
  }
  function hasCapital(ln) { return capitalItems(ln).length > 0; }

  // Human-readable labels for source codes. The source value is never changed:
  // it stays available as a secondary caption / tooltip next to the label.
  var CODE_LABELS = {
    // truth_status
    VERIFIED: "подтверждено", CONFIRMED: "подтверждено", PENDING_RECONCILIATION: "ждёт сверки", UNVERIFIED: "не подтверждено",
    DISPUTED: "оспорено", REJECTED: "отклонено",
    // binding_class / scope
    EXACT_OBJECT: "точно привязано к объекту", PENDING_EXACT_OBJECT_PROOF: "привязка ждёт доказательства",
    KNOWN_OBJECT_UNRESOLVED_PORTFOLIO: "объект известен, место в портфеле не определено",
    EXACT_OWNER_FROM_ADMITTED_OBJECTS: "владелец — из допущенных объектов", UNBOUND: "не привязано",
    COMPANY: "уровень компании", WORLD: "уровень мира", LINE: "уровень линии", PENDING_BINDING: "ждёт привязки",
    // evidence_status
    EXACT_OWNER_MATCH: "владелец совпадает точно", INSUFFICIENT: "доказательств недостаточно",
    // transition
    ADVANCED: "продвинулось", BLOCKED: "заблокировано", DEFERRED: "отложено", OBSERVED: "замечено", CREATED: "создано",
    PROPOSED: "предложено", PRIORITIZED: "получило приоритет", REGRESSED: "откатилось", COMPLETED: "завершено", STARTED: "начато",
    // time_class
    CURRENT_STATE: "текущее условие", FUTURE_CONDITION: "будущее условие", PAST_EVENT: "прошлое событие",
    // state / status
    ACTIVE: "активно", ARCHIVED: "в архиве", HISTORICAL: "историческое", FORMING: "формируется", PAUSED: "на паузе", CLOSED: "закрыто", CLOSED_NO_GO: "закрыт без продолжения",
    // kind
    NOTE: "заметка", DOCUMENT: "документ", TASK: "задача", ARTIFACT: "артефакт", IDEA: "идея", SERVICE: "сервис",
    REPORT: "отчёт", DATASET: "набор данных",
    DEPENDENCY_CONCENTRATION_CANDIDATE: "концентрация использования капитала",
    COMPOUNDING_LOOP: "повторное использование капитала",
    CANONICAL_ROUTE_GAP: "капитал без канонического маршрута",
    FOUNDER_AUTHORITY_GATE: "шлюз полномочий Основателя",
    INSUFFICIENT_ORDERED_PATH_EVIDENCE: "недостаточно упорядоченных доказательств",
    LEADING_MILESTONE_REQUIRED: "нужен ведущий рубеж", CYCLE_EVIDENCE_REQUIRED: "нужно доказательство полного цикла",
    PORTFOLIO_NOT_DEFINED_BY_ITEMS: "портфель не определён набором объектов", ROUTE_NOT_CANONICAL: "маршрут не канонизирован",
    SYSTEM_RECONCILIATION: "системная сверка"
  };

  function human(code) {
    if (code == null || code === "") return "";
    var k = String(code).trim();
    if (CODE_LABELS[k]) return CODE_LABELS[k];
    var h = H.humanCode(k);
    return h !== k ? h : k;
  }

  // Label first, source code second (small, and in the tooltip).
  function codeTag(code, cls) {
    if (code == null || code === "") return "";
    var k = String(code), lab = human(k), isCode = /^[A-Z0-9_\-\.]+$/.test(k) && k.indexOf("_") >= 0 || CODE_LABELS[k];
    return "<span class='cc-code" + (cls ? " " + cls : "") + "' title='" + E(k) + "'>" + E(lab) + (isCode && lab !== k ? "<i>" + E(k) + "</i>" : "") + "</span>";
  }

  // Evidence tags. Compact mode (feeds, rows) spells out uncertainty and
  // folds proven status into one calm mark; the inspector shows everything.
  function proofTags(v, compact) {
    var raw = v && v.raw && typeof v.raw === "object" ? v.raw : {};
    var tags = [raw.truth_status, raw.binding_class].filter(Boolean);
    if (!tags.length && v && v.proof) tags = v.proof.split(" · ");
    if (!tags.length) return "";
    var weak = function (t) { return /PENDING|UNVERIFIED|INSUFFICIENT|UNRESOLVED|UNBOUND|DISPUTED/.test(t); };
    if (compact) {
      var unc = tags.filter(weak);
      return "<span class='cc-proof-tags'>" + (unc.length ? unc.map(function (t) { return codeTag(t, "uncertain"); }).join("") :
        "<span class='cc-code okmark' title='" + E(tags.join(" · ")) + "'>✓ подтверждено</span>") + "</span>";
    }
    return "<span class='cc-proof-tags'>" + tags.map(function (t) { return codeTag(t, weak(t) ? "uncertain" : "proven"); }).join("") + "</span>";
  }

  // Visual tone of a route for Founder attention. It is presentation only and
  // does not change the source state or the diagnostic risk from live.js:
  //   act     — the move is the Founder's and the route is not simply flowing
  //   blocked — explicit blockers exist
  //   wait    — the move is with an external owner (waiting, not risk)
  //   stale   — no movement for a while, nothing else known (calm, not alarm)
  //   unknown — movement date not provided (evidence uncertainty)
  //   flow    — recent movement recorded; no diagnostic blocker signal
  var TONE_META = {
    act: { label: "Ход на вашей стороне", hint: "владелец следующего хода — вы; срочность этим не определяется" },
    blocked: { label: "Есть блокер", hint: "источник сообщает открытые блокеры" },
    wait: { label: "Ждём внешнего", hint: "следующий ход у внешней стороны; это ожидание, не оценка риска" },
    stale: { label: "Давно без движения", hint: "движения не было 7+ дней; других сигналов нет" },
    unknown: { label: "Нужна сверка", hint: "дата движения не передана — неопределённость, не авария" },
    flow: { label: "Недавнее движение", hint: "дата последнего движения — менее 7 дней назад; блокеров маршрута не видно" },
    closed: { label: "Закрыт", hint: "маршрут закрыт" }
  };

  function ownerLabel(value) {
    if (value == null || value === "") return "не назначен";
    var k = String(value).trim();
    if (H.isFounderOwner(k)) return "вы";
    if (/^SYSTEM$/i.test(k)) return "система";
    if (/^EXTERNAL$/i.test(k)) return "внешний владелец";
    if (/^NONE$/i.test(k)) return "не назначен";
    if (/^AGENT$/i.test(k)) return "агент";
    return human(k);
  }

  function humanActionText(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return raw;
    var exact = {
      "Founder Panel Product Sprint": "Спринт панели Основателя",
      "Implement and verify authenticated state write-back + founder_outcome projection, then regenerate the 10-line semantic pilot.": "Внедрить и проверить авторизованную запись состояния и проекцию результата Основателя, затем заново собрать 10-строчный смысловой пилот.",
      "Run a distribution pass (outreach/media) for the published synthesis.": "Провести цикл распространения опубликованного синтеза через адресные контакты и медиа.",
      "Decide whether to send the drafted preview; no outreach has occurred yet.": "Решить, отправлять ли подготовленное превью; исходящих контактов пока не было.",
      "Follow up if silence exceeds 5 working days (per tracker note).": "Повторно связаться, если ответа не будет более 5 рабочих дней — согласно трекеру.",
      "Supply the authorized frozen 96-slot pre-cutoff GitHub evidence dataset and re-execute testing.": "Передать разрешённый замороженный набор из 96 GitHub-слотов до отсечки и повторно запустить тестирование.",
      "Supply complete source custody artifacts, including the delivered execution lock, execution script, exact parent artifacts, and frozen PSID source environment.": "Передать полный пакет исходных материалов: зафиксированный запуск, сценарий выполнения, точные родительские артефакты и замороженную среду исходных данных PSID.",
      "Commission independent Third Coder adjudication or resolve coder tooling/linguistic parity before unblinding and scoring primary/genealogical claims.": "Провести независимую сверку третьим кодировщиком либо устранить различия инструментов и языковой паритет до раскрытия данных и оценки основных и генеалогических утверждений.",
      "Security follow-up required: internal localhost service credentials were exposed in diagnostic tool output. Rotate affected credentials and move any inline/unit or CLI-visible secret transport to protected credential files; never reuse exposed values.": "Нужно устранить последствие утечки: внутренние учётные данные локального сервиса попали в диагностический вывод. Сменить затронутые секреты, перенести их из командной строки и inline-конфигурации в защищённые файлы учётных данных и не использовать раскрытые значения повторно."
    };
    if (exact[raw]) return exact[raw];
    if (raw.indexOf("External reproducibility Gate v0.1") === 0) return raw.replace("External reproducibility Gate v0.1", "Внешний гейт воспроизводимости v0.1");
    if (raw.indexOf("Service operating normally:") === 0) return raw.replace("Service operating normally:", "Сервис работает штатно:");
    return raw;
  }

  function routeDisplayTitle(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return raw;
    var exact = {
      "Continuity / Context Steward": "Непрерывность системы (Continuity) / хранитель контекста",
      "Founder Environment / Founder Layer": "Среда Основателя / управленческий слой",
      "Observer Engine / Orchestrator by ICAM": "Наблюдатель / Оркестратор ICAM",
      "Scientific Reputation Engine / External Scientific Contour": "Научная репутация / внешний научный контур",
      "ATLAS — Empirical Temporal-Blind Validation": "ATLAS — эмпирическая проверка без доступа к временному порядку",
      "H008 — Corridors / Mobility (Q25 weight decomposition line)": "H008 — Коридоры возможного / мобильность (декомпозиция веса Q25)",
      "Meta-Structure / Spiral-Recursive Architecture (blind test)": "Метаструктура / спирально-рекурсивная архитектура (слепой тест)",
      "ICAM Testing Department (service)": "Служба тестирования ICAM",
      "ICAM public site + console": "Публичный сайт и консоль ICAM",
      "Personal Orchestrator v1.1": "Персональный Оркестратор v1.1",
      "Same Industry, Different Decision Space (Steel & Metals Industry Synthesis 001)": "Одна отрасль — разные пространства решений (синтез Steel & Metals 001)",
      "Observer Flexibility & Assembly Control — G1 Artificial Configuration Lab (AI line)": "Гибкость наблюдателя и контроль сборки — G1, лаборатория искусственных конфигураций (линия ИИ)",
      "AI and Ethics — Construction-Voice Coupling": "ИИ и этика — связь конструкции и голоса",
      "HSA → CVC → Representation Pipeline → Recursive Human–AI Systems → «Коридоры возможного»": "HSA → CVC → контур представления → рекурсивные человеко-ИИ системы → «Коридоры возможного»",
      "HSA — Corridors of the Possible: Economic Mobility": "HSA — «Коридоры возможного»: экономическая мобильность"
    };
    if (exact[raw]) return exact[raw];
    var m = raw.match(/^(.*?) — Commercial Decision Audit$/);
    if (m) return m[1] + " — коммерческий аудит решений";
    return raw;
  }

  function toneOf(l) {
    if (l.closed) return "closed";
    var routeBlockers = l.risk.blockers;
    if (l.r.ball_owner && H.isFounderOwner(l.r.ball_owner) && (routeBlockers || l.state !== "flow")) return "act";
    if (routeBlockers) return "blocked";
    if (l.waiting) return "wait";
    if (l.risk.stale == null) return "unknown";
    if (l.risk.stale >= H.STALE_DAYS) return "stale";
    return "flow";
  }

  function canonicalTone(ln) {
    var v = ln && ln.fp ? String(ln.fp.state || "").toLowerCase() : "";
    if (!v) return "unknown";
    if (v.indexOf("движ") >= 0) return "flow";
    if (v.indexOf("ожидан") >= 0) return "wait";
    if (v.indexOf("закрыт") >= 0) return "closed";
    if (v.indexOf("сверк") >= 0) return "unknown";
    return "unknown";
  }

  function routeToneLabel(l) {
    if (!l) return "—";
    if (l.tone !== "wait") return TONE_META[l.tone].label;
    var owner = String(l.r && l.r.ball_owner || "").trim();
    if (/^EXTERNAL$/i.test(owner)) return "Ждём внешнего";
    if (/^SYSTEM$/i.test(owner)) return "Ход у системы";
    if (/^AGENT$/i.test(owner)) return "Ход у агента";
    if (!owner || /^NONE$|^UNAVAILABLE$/i.test(owner)) return "Ход не назначен";
    return "Ход у: " + ownerLabel(owner);
  }

  function routeToneHint(l) {
    if (!l) return "состояние не передано";
    if (l.tone !== "wait") return TONE_META[l.tone].hint;
    var owner = String(l.r && l.r.ball_owner || "").trim();
    if (/^EXTERNAL$/i.test(owner)) return "следующий ход у внешней стороны; это ожидание, не риск";
    if (/^SYSTEM$/i.test(owner)) return "следующий ход назначен системе; это не действие Основателя";
    if (/^AGENT$/i.test(owner)) return "следующий ход назначен агенту; это не действие Основателя";
    if (!owner || /^NONE$|^UNAVAILABLE$/i.test(owner)) return "владелец следующего хода не определён";
    return "следующий ход у «" + ownerLabel(owner) + "»";
  }

  function toneDot(tone, label) {
    return "<span class='cc-tone t-" + tone + "'><i></i>" + E(label || TONE_META[tone].label) + "</span>";
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

  function schemaOf(j) { return j && (j.schema_id || j.schema || j.schema_version) || null; }

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

  function readFounderProjection(d, sources) {
    var st = sources.founderProjection;
    if (!st || !st.ok) return { ok: false, reason: st && st.error ? st.error : "источник не ответил" };
    var j = d.founderProjection, sch = schemaOf(j);
    if (!j || !Array.isArray(j.lines)) return { ok: false, reason: "ответ без lines[] — не соответствует контракту" };
    if (sch && String(sch).indexOf(FP_SCHEMA) !== 0) return { ok: false, reason: "неподдерживаемая схема " + sch };
    return { ok: true, data: j, schema: sch };
  }

  function readOrgIntelligence(d, sources) {
    var st = sources.organizationalIntelligence;
    if (!st || !st.ok) return { ok: false, reason: st && st.error ? st.error : "источник не ответил" };
    var j = d.organizationalIntelligence, sch = schemaOf(j);
    if (!j || !Array.isArray(j.signals)) return { ok: false, reason: "ответ без signals[] — не соответствует контракту" };
    if (sch && String(sch).indexOf(OI_SCHEMA) !== 0) return { ok: false, reason: "неподдерживаемая схема " + sch };
    return { ok: true, data: j, schema: sch };
  }

  function readStewardReconciliation(d, sources) {
    var st = sources.stewardReconciliation;
    if (!st || !st.ok) return { ok: false, reason: st && st.error ? st.error : "источник не ответил" };
    var j = d.stewardReconciliation, sch = schemaOf(j);
    if (!j || !Array.isArray(j.system_reconciliation)) return { ok: false, reason: "ответ без system_reconciliation[] — не соответствует контракту" };
    if (sch && String(sch).indexOf(SR_SCHEMA) !== 0) return { ok: false, reason: "неподдерживаемая схема " + sch };
    return { ok: true, data: j, schema: sch };
  }

  // ------------------------------------------------------------------ model

  function buildUniverse(j) {
    var U = { worlds: [], worldById: {}, lines: [], stars: [], lineById: {}, titleIndex: {}, starByMemory: {}, starByKey: {}, events: [], eventByKey: {}, trajByKey: {} };
    function indexEvent(e, key) { e.key = key; U.eventByKey[key] = e; return e; }
    A(j.worlds).forEach(function (w, wi) {
      var world = { kind: "world", id: String(w.id || w.world_id || "W" + wi), title: w.title || w.name || w.id || "Мир " + (wi + 1), raw: w, lines: [] };
      world.key = world.id;
      U.worldById[world.key] = world;
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
            memoryId: b.memory_id ? String(b.memory_id) : null, verified: b.verified === true, verifiedKnown: typeof b.verified === "boolean",
            temporal: b.temporal && typeof b.temporal === "object" ? b.temporal : null,
            line: line, world: world, routes: [], obj: null
          };
          star.events = temporalView(star.temporal).history.map(function (v, hi) {
            return indexEvent({ scope: "star", star: star, line: line, world: world, item: v.raw, v: v, at: v.at, text: v.main || "событие звезды" }, "s|" + star.key + "|" + hi);
          });
          line.stars.push(star);
          U.stars.push(star);
          U.starByKey[star.key] = star;
          if (star.memoryId) U.starByMemory[star.memoryId] = star;
        });
        line.history.forEach(function (h, hi) {
          var v = eventView(h);
          U.events.push(indexEvent({ scope: "line", line: line, world: world, item: h, v: v, at: v.at, text: v.main || "событие линии" }, "l|" + line.key + "|" + hi));
        });
        world.lines.push(line);
        U.lines.push(line);
        U.lineById[line.key] = line;
        (U.titleIndex[String(line.title)] = U.titleIndex[String(line.title)] || []).push(line);
      });
      U.worlds.push(world);
    });
    U.company = A(j.company_history).map(function (h, i) { var v = eventView(h); return indexEvent({ scope: "company", item: h, v: v, at: v.at, text: v.main || "событие компании" }, "c|" + i); });
    U.unresolved = A(j.unresolved_history).map(function (h, i) { var v = eventView(h); return indexEvent({ scope: "unresolved", item: h, v: v, at: v.at, text: v.main || "событие" }, "u|" + i); });
    U.trajectories = A(j.strategic_trajectories);
    U.trajectories.forEach(function (t, i) { U.trajByKey[String(t && t.id || "T" + i)] = t; });
    U.rules = Array.isArray(j.rules) ? j.rules : (j.rules && typeof j.rules === "object" ? Object.keys(j.rules).map(function (k) { return k + ": " + scalar(j.rules[k]); }) : []);
    U.window = j.window || null;
    return U;
  }

  function buildAdmission(j, U) {
    var AD = { counts: j.counts || {}, compiledAt: j.compiled_at || null, rules: [], items: {}, byMemory: {}, buckets: {} };
    AD.rules = Array.isArray(j.rules) ? j.rules : (j.rules && typeof j.rules === "object" ? Object.keys(j.rules).map(function (k) { return k + ": " + scalar(j.rules[k]); }) : []);
    // trusted_owner_map: owning_branch → exact canonical line title.
    var trusted = j.trusted_owner_map && typeof j.trusted_owner_map === "object" && !Array.isArray(j.trusted_owner_map) ? j.trusted_owner_map : {};
    AD.trusted = Object.keys(trusted).map(function (branch) {
      return { branch: branch, title: trusted[branch] == null ? null : String(trusted[branch]), ul: exactTitle(U, trusted[branch]) };
    });
    Object.keys(BUCKET_META).forEach(function (k) { AD.buckets[k] = []; });

    function add(bucket, src, raw, i) {
      var archived = ARCHIVE_STATE.test(upper(raw.state));
      var it = {
        kind: "adm", key: src + "|" + i, source: src, bucket: archived ? "archive" : bucket, sourceBucket: bucket,
        raw: raw, memoryId: raw.memory_id ? String(raw.memory_id) : null,
        title: raw.title || pickText(raw) || raw.memory_id || "объект памяти",
        star: raw.memory_id && U ? U.starByMemory[String(raw.memory_id)] || null : null,
        proposedLine: raw.proposed_line != null ? exactTitle(U, raw.proposed_line) : null,
        conflictLines: raw.lines ? A(raw.lines).map(function (t) { return { title: String(t), ul: exactTitle(U, t) }; }) : null
      };
      AD.items[it.key] = it;
      AD.buckets[it.bucket].push(it);
      if (it.memoryId && !AD.byMemory[it.memoryId]) AD.byMemory[it.memoryId] = it;
    }
    // owner_conflicts: {owning_branch: [competing exact line titles]} (array form tolerated).
    var oc = j.owner_conflicts;
    var ocList = Array.isArray(oc) ? oc : (oc && typeof oc === "object" ? Object.keys(oc).map(function (k) {
      return { owning_branch: k, lines: A(oc[k]).map(String) };
    }) : []);
    ocList.forEach(function (x, i) {
      var raw = x || {};
      if (raw.owning_branch && !raw.title) raw = { owning_branch: raw.owning_branch, lines: raw.lines, title: "«" + raw.owning_branch + "» указывает на несколько линий" };
      add("conflict", "owner_conflicts", raw, i);
    });
    j.exact_owner_candidates.forEach(function (x, i) { add("candidate", "exact_owner_candidates", x || {}, i); });
    j.review_required.forEach(function (x, i) { add("review", "review_required", x || {}, i); });
    return AD;
  }

  function buildFounderProjection(j, U) {
    var FP = {
      raw: j, compiledAt: j.compiled_at || null, coverage: j.coverage || {},
      lines: [], byTitle: {}, decisions: [], decisionByKey: {},
      movements: [], movementByKey: {},
      capital: A(j.company_capital && j.company_capital.items),
      hardRules: A(j.hard_rules), intersections: [],
      organizational: j.organizational_intelligence || {}, steward: j.steward || {}
    };
    var titleBuckets = {}, edgeSeen = {};
    A(j.lines).forEach(function (row, i) {
      var title = String(row.line || row.title || "Линия " + (i + 1));
      var it = {
        kind: "fpline", key: "fp|" + i, title: title, world: row.world || null, raw: row,
        state: row.state || null, stateBasis: row.state_basis || null,
        capital: A(row.capital_in_use), intersections: A(row.intersections),
        reconciliation: row.system_reconciliation || null,
        founderAction: row.founder_action_required === true,
        ul: exactTitle(U, title)
      };
      FP.lines.push(it);
      (titleBuckets[title] = titleBuckets[title] || []).push(it);
      if (it.ul) it.ul.fp = it;
    });
    Object.keys(titleBuckets).forEach(function (title) {
      if (titleBuckets[title].length === 1) FP.byTitle[title] = titleBuckets[title][0];
    });
    FP.lines.forEach(function (line) {
      line.intersections.forEach(function (edge) {
        var other = edge && edge.with != null ? String(edge.with) : "";
        if (!other) return;
        var pair = [line.title, other].sort();
        var refs = A(edge.bridge_refs).map(String).sort();
        var key = pair.join("||") + "||" + refs.join(",");
        if (edgeSeen[key]) return;
        edgeSeen[key] = 1;
        FP.intersections.push({
          aTitle: pair[0], bTitle: pair[1],
          a: exactTitle(U, pair[0]), b: exactTitle(U, pair[1]),
          bridgeRefs: refs, evidenceCeiling: edge.evidence_ceiling || null
        });
      });
    });
    A(j.today && j.today.founder_decisions).forEach(function (row, i) {
      var key = String(row.decision_id || "decision|" + i);
      var it = { kind: "decision", key: key, raw: row, title: row.question || "Решение Основателя" };
      FP.decisions.push(it);
      FP.decisionByKey[key] = it;
    });
    A(j.today && j.today.company_movements).forEach(function (row, i) {
      var key = String(row.movement_id || "movement|" + i);
      var it = { kind: "movement", key: key, raw: row, title: row.human_change || "Движение компании" };
      FP.movements.push(it);
      FP.movementByKey[key] = it;
    });
    return FP;
  }

  function buildOrgIntelligence(j, U) {
    var OI = { raw: j, compiledAt: j.compiled_at || null, items: [], byKey: {}, counts: {} };
    A(j.signals).forEach(function (row, i) {
      var key = String(row.signal_id || "oi|" + i), cls = String(row.class || "");
      var it = { kind: "org", key: key, raw: row, cls: cls, title: row.subject || key,
        founderAction: row.founder_action_required === true, founderActionKnown: typeof row.founder_action_required === "boolean", lines: A(row.affected_lines).map(function (t) {
          return { title: String(t), ul: exactTitle(U, t) };
        }) };
      OI.items.push(it); OI.byKey[key] = it; OI.counts[cls] = (OI.counts[cls] || 0) + 1;
    });
    return OI;
  }

  function buildStewardReconciliation(j, U) {
    var SR = { raw: j, compiledAt: j.compiled_at || null, items: [], byKey: {}, counts: {},
      founderGates: A(j.founder_gates), hardRules: A(j.hard_rules) };
    A(j.system_reconciliation).forEach(function (row, i) {
      var key = String(row.reconciliation_id || "rec|" + i), subject = String(row.subject || key);
      var it = { kind: "sysrec", key: key, raw: row, title: subject,
        gap: String(row.gap_class || ""), source: String(row.source || ""),
        founderAction: row.founder_action_required === true, founderActionKnown: typeof row.founder_action_required === "boolean", ul: exactTitle(U, subject) };
      SR.items.push(it); SR.byKey[key] = it; SR.counts[it.source] = (SR.counts[it.source] || 0) + 1;
    });
    return SR;
  }

  function exactTitle(U, title) {
    if (!U || title == null) return null;
    var ls = U.titleIndex[String(title)];
    return ls && ls.length === 1 ? ls[0] : null;
  }

  function verifiedLabel(s) {
    return s.verified ? "проверена" : (s.verifiedKnown ? "не подтверждена (verified=false)" : "verified не передан");
  }

  function verifiedSummary(stars) {
    var yes = 0, no = 0, unknown = 0;
    A(stars).forEach(function (s) {
      if (s.verified) yes += 1;
      else if (s.verifiedKnown) no += 1;
      else unknown += 1;
    });
    return { yes: yes, no: no, unknown: unknown };
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
    var fp = readFounderProjection(d, sources);
    var oi = readOrgIntelligence(d, sources);
    var sr = readStewardReconciliation(d, sources);
    var U = tu.ok ? buildUniverse(tu.data) : null;
    var AD = adm.ok ? buildAdmission(adm.data, U) : null;
    var FP = fp.ok ? buildFounderProjection(fp.data, U) : null;
    var OI = oi.ok ? buildOrgIntelligence(oi.data, U) : null;
    var SR = sr.ok ? buildStewardReconciliation(sr.data, U) : null;

    var objectsOk = !!(sources.objects && sources.objects.ok);
    var routesOk = !!(sources.routes && sources.routes.ok);
    var objById = {};
    objects.forEach(function (o) { if (o && o.object_id) objById[String(o.object_id)] = o; });

    var lines = routes.map(function (r, idx) {
      var key = H.routeKey(r);
      var sourceObjectId = r.source_object_id ? String(r.source_object_id) : null;
      var mappingState = String(r.canonical_mapping_status || "").toUpperCase();
      // source_object_id is provenance, not a canonical Continuity binding.
      // Bind only when the route exposes an explicit canonical object ID, a
      // direct object_id, or a positively resolved mapping state.
      var mappedSource = sourceObjectId && /^(RESOLVED|MAPPED|EXACT|VERIFIED|BOUND)$/.test(mappingState) ? sourceObjectId : null;
      var objId = r.canonical_object_id ? String(r.canonical_object_id) : (r.object_id ? String(r.object_id) : mappedSource);
      var obj = objId ? objById[objId] || null : null;
      var risk = H.riskInfo(r, dep);
      var closed = H.isClosed(r);
      var state = closed ? "closed" : (risk.level !== "stable" ? risk.level : (risk.stale == null ? "unknown" : "flow"));
      var rd1 = objId && d.rd1 ? d.rd1[objId] || null : null;
      var area = r.area && !/^(PROJECTS?|ПРОЕКТЫ?)$/i.test(String(r.area).trim()) ? String(r.area) : null;
      var star = U && objId ? U.starByMemory[objId] || null : null;
      return {
        kind: "line", key: key, r: r, idx: idx,
        title: titleOf(r), objId: objId, sourceObjectId: sourceObjectId, mappingState: mappingState || null,
        obj: obj, objMissing: !!(objectsOk && objId && !obj),
        risk: risk, closed: closed, state: state, rd1: rd1, area: area, star: star,
        origin: obj ? (obj.owning_branch || obj.owner || null) : null,
        waiting: !closed && /^EXTERNAL$/i.test(String(r.ball_owner || "").trim()),
        next: r.next_move || (rd1 && (rd1.next_gate || rd1.next_move)) || null,
        nextSource: r.next_move ? "Оркестратор · next_move" : (rd1 && rd1.next_gate ? "RD1 · next_gate" : (rd1 && rd1.next_move ? "RD1 · next_move" : null)),
        upstream: [], downstream: [], bridges: [],
        objBlockers: obj ? openBlockers.filter(function (b) { return String(b.object_id || "") === objId; }) : []
      };
    });

    var lineByKey = {};
    lines.forEach(function (l) { lineByKey[l.key] = l; if (l.star) l.star.routes.push(l); l.tone = toneOf(l); });
    dep.edges.forEach(function (e) {
      if (lineByKey[e.to] && lineByKey[e.from]) {
        lineByKey[e.to].upstream.push(e.from);
        lineByKey[e.from].downstream.push(e.to);
      }
    });

    var linesByObj = {};
    lines.forEach(function (l) {
      // A shared-object bridge requires the object itself to exist in Continuity.
      // Two routes merely claiming the same unknown ID is not enough.
      if (!l.objId || !l.obj) return;
      (linesByObj[l.objId] = linesByObj[l.objId] || []).push(l);
    });

    // Structural bridge: two routes point at the same registry-confirmed object.
    // This is a shared-identity fact, not a causal, strategic or resource claim.
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
        summary: humanActionText(x.o.last_summary || ""), placed: x.lines.length > 0
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
    var msSignalsKnown = !!(ms && Array.isArray(ms.signals));

    return {
      d: d, sources: sources, tu: tu, adm: adm, fp: fp, oi: oi, sr: sr, U: U, AD: AD, FP: FP, OI: OI, SR: SR,
      lines: lines, active: lines.filter(function (l) { return !l.closed; }), lineByKey: lineByKey,
      objs: objs, objByKey: objByKey, bridges: bridges, edges: dep.edges.filter(function (e) {
        return lineByKey[e.from] && lineByKey[e.to];
      }),
      openBlockers: openBlockers, inboxItems: inboxItems, events: events,
      dangling: lines.filter(function (l) { return l.objMissing && !l.closed; }),
      marketCount: msActivated && msSignalsKnown ? ms.signals.length : null,
      marketState: ms ? ms.activation_state : null,
      marketSignalsKnown: msSignalsKnown
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
      "<span class='cc-stamp-sep'>·</span><span>проекций чтения " + good + " / " + keys.length + "</span>" +
      "<a href='#diagnostics'>диагностика →</a></div>";
  }

  function sourceBadge(which) {
    var g, name, extra = "";
    if (which === "tu") {
      g = M.tu; name = "Temporal Universe";
      extra = g.ok ? windowLabel(M.U.window) : "";
    } else if (which === "adm") {
      g = M.adm; name = "Portfolio Admission";
      extra = g.ok && M.AD.compiledAt ? "собран " + timeLabel(M.AD.compiledAt) : "";
    } else {
      g = M.fp; name = "Founder Projection";
      extra = g.ok && M.FP.compiledAt ? "собран " + timeLabel(M.FP.compiledAt) : "";
    }
    if (g.ok) {
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

  function lineRefs(keys) {
    return keys.map(function (k) {
      var l = M.lineByKey[k];
      return l ? "<button class='cc-ref'" + sel("line", l.key) + ">" + E(H.cut(routeDisplayTitle(l.title), 26)) + "</button>" : "";
    }).join("");
  }

  function ulineRef(ul) {
    return "<button class='cc-ref uni'" + sel("uline", ul.key) + ">" + E(H.cut(ul.title, 28)) + "</button>";
  }

  // Where a route sits in the canonical universe: exact memory_id match only.
  function routePlace(l) {
    if (!M.tu.ok) return { world: null, uline: null, text: "мир не проверен — Temporal Universe недоступен" };
    if (l.star) return { world: l.star.world, uline: l.star.line, text: "мир: " + l.star.world.title + " · линия: " + l.star.line.title };
    return { world: null, uline: null, text: "не связан с Founder Universe по точному ID" };
  }

  function placementOfObject(x) {
    if (!M.adm.ok) return { bucket: "unchecked", label: "не проверено — Portfolio Admission недоступен" };
    if (x.star) return { bucket: "placed", label: "размещена звездой" };
    if (x.adm) return { bucket: x.adm.bucket, label: BUCKET_META[x.adm.bucket].title.toLowerCase() + (x.adm.bucket === "archive" ? " (из " + x.adm.source + ")" : "") };
    return { bucket: "absent", label: "нет в слое допуска" };
  }

  function mapVisibility(memoryId) {
    if (!M.tu.ok) return { cls: "no", text: "видимость не проверена" };
    return memoryId && M.U.starByMemory[memoryId] ? { cls: "yes", text: "звезда на Founder Map" } : { cls: "no", text: "точного совпадения memory_id на текущей Founder Map нет" };
  }

  // ------------------------------------------------------------------ Командный центр

  function renderKPIs() {
    var routesOk = ok("routes");
    var act = M.active;
    var n = { act: 0, blocked: 0, wait: 0, stale: 0, unknown: 0, flow: 0 };
    act.forEach(function (l) { n[l.tone] = (n[l.tone] || 0) + 1; });
    // Blocker is an orthogonal fact, not a presentation tone. A route whose
    // move belongs to the Founder may or may not have a blocker.
    var blockerRoutes = act.filter(function (l) { return l.risk.blockers > 0; });
    var founderBlocked = blockerRoutes.filter(function (l) { return l.r.ball_owner && H.isFounderOwner(l.r.ball_owner); }).length;
    function tile(tone, label, value, detail, href) {
      return "<a class='cc-pulse-tile st-" + tone + "' href='" + href + "'><span class='cc-pulse-dot'></span>" +
        "<span class='cc-pulse-body'><small>" + E(label) + "</small><strong>" + E(value) + "</strong><em>" + E(detail) + "</em></span></a>";
    }
    if (!routesOk) return tile("unknown", "Маршруты", "Недоступно", "чтение маршрутов не удалось — состояние не показывается", "#diagnostics");
    return tile("flow", "Маршруты с недавним движением", n.flow, "дата последнего движения — менее 7 дней назад; блокеров маршрута не видно", "#lines") +
      tile("wait", "Маршруты: ждём внешнего", n.wait, "следующий ход явно назначен внешней стороне; это ожидание, не оценка риска", "#lines") +
      tile("blocked", "Маршруты с явным блокером", blockerRoutes.length, founderBlocked ? "из них " + founderBlocked + " одновременно назначены вам" : "только blocker-факты самого маршрута", "#lines") +
      tile("stale", "Маршруты без движения", n.stale, "операционные маршруты: 7+ дней без движения, других сигналов нет", "#lines") +
      tile("unknown", "Маршруты на сверке", n.unknown, "нет даты движения — неопределённость, не авария", "#lines");
  }

  function reviewCounts() {
    var c = M.AD.counts;
    return {
      review: Number(c.review_required != null ? c.review_required : M.AD.buckets.review.length) || 0,
      conflicts: Number(c.owner_conflicts != null ? c.owner_conflicts : M.AD.buckets.conflict.length) || 0
    };
  }

  // Source totals vs the active (non-archived) queue, so the numbers on the
  // Command Center and on «Размещение» always reconcile visibly.
  function activeQueue() {
    var r = reviewCounts();
    var archivedReview = M.AD.buckets.archive.filter(function (it) { return it.sourceBucket === "review"; }).length;
    var archivedConflict = M.AD.buckets.archive.filter(function (it) { return it.sourceBucket === "conflict"; }).length;
    return {
      sourceTotal: r.review + r.conflicts,
      archived: archivedReview + archivedConflict,
      review: M.AD.buckets.review.length, conflicts: M.AD.buckets.conflict.length,
      active: M.AD.buckets.review.length + M.AD.buckets.conflict.length
    };
  }

  // What needs the Founder: explicit needs_founder items and routes whose move
  // is the Founder's. The strongest accent on the screen.
  // «Требует вашего участия»: two different classes kept apart.
  //   Нужно решить — explicit needs_founder items from the Founder inbox
  //   Ваш ход      — routes whose next move is the Founder's
  // Order: decisions first, then moves; inside a group by the date the source
  // gives (most recent first, undated last, otherwise source order). No
  // priority engine: an older item is never promoted for being old.
  var HERO_LIMIT = 6;

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many);
  }

  function byDateDesc(list) {
    return list.map(function (it, i) { return { it: it, i: i, t: it.age ? new Date(it.age).getTime() : NaN }; })
      .sort(function (a, b) {
        var ha = isFinite(a.t), hb = isFinite(b.t);
        if (ha && hb && a.t !== b.t) return b.t - a.t;
        if (ha !== hb) return ha ? -1 : 1;
        return a.i - b.i;
      }).map(function (x) { return x.it; });
  }

  function renderHero() {
    var decisions = [], assigned = [];
    function decisionState(v) {
      var s = String(v || "").toUpperCase();
      if (s === "READY") return "готово к решению";
      if (s === "PENDING") return "ожидает решения";
      if (s === "RESOLVED") return "решение зафиксировано";
      return v ? human(v) : "формальное решение";
    }
    if (M.fp.ok) M.FP.decisions.forEach(function (d) {
      var r = d.raw || {};
      decisions.push({
        kind: "decision", title: d.title,
        why: r.why_now || r.deadline_or_condition || "",
        ref: decisionState(r.presentation_state),
        age: r.created_at || r.recorded_at || null,
        attr: sel("decision", d.key)
      });
    });
    // ball_owner=ME proves assignment, not urgency. Keep these routes visible,
    // but never promote all of them into "actions required now".
    M.active.filter(function (l) { return l.r.ball_owner && H.isFounderOwner(l.r.ball_owner); }).forEach(function (l) {
      var priority = l.r.priority ? "приоритет источника: " + l.r.priority : "приоритет источником не передан";
      assigned.push({
        kind: "route", title: humanActionText(l.next || "Следующий ход не передан"),
        why: routeDisplayTitle(l.title) + " · маршрут назначен вам · " + priority +
          (l.risk.blockers ? " · блокеров маршрута " + l.risk.blockers : "") +
          (l.objBlockers.length ? " · у объекта blocker-записей " + l.objBlockers.length + " (не доказаны как блокеры маршрута)" : "") +
          (l.risk.stale != null && l.risk.stale >= H.STALE_DAYS ? " · последнее движение " + l.risk.stale + " дн. назад" : ""),
        ref: l.objId || (l.sourceObjectId ? l.sourceObjectId + " · связь с объектом не подтверждена" : "локальный маршрут"), age: l.r.last_movement_at,
        attr: sel("line", l.key)
      });
    });
    decisions = byDateDesc(decisions);
    assigned = byDateDesc(assigned);
    var nd = decisions.length, na = assigned.length, total = nd + na;
    var anyOk = M.fp.ok || ok("routes");
    var head = "<div class='cc-hero-head'><span class='cc-hero-mark'>!</span><div><h2>Требует вашего решения</h2>" +
      "<small>здесь считаются только формальные решения из проекции Основателя; назначенный вам маршрут сам по себе не означает срочность</small></div>" +
      "<div class='cc-hero-counts'><strong class='cc-hero-count'>" + (M.fp.ok ? nd : "—") + "</strong>" +
      "<span><b>" + (M.fp.ok ? nd : "—") + "</b> " + (M.fp.ok ? plural(nd, "формальное решение", "формальных решения", "формальных решений") : "формальных решений") +
      " · <b>" + (ok("routes") ? na : "—") + "</b> маршрутов на вашей стороне</span></div></div>";
    if (!anyOk) return head + unavailable("Источники недоступны", "Проекция решений Основателя и маршруты не прочитаны — состояние внимания не подтверждено.");
    if (!total && M.fp.ok && ok("routes")) return head + "<div class='cc-hero-calm'>Формальных решений и назначенных вам маршрутов сейчас нет.</div>";
    var shownD = ui.heroAll ? nd : Math.min(nd, HERO_LIMIT);
    var shownA = ui.heroAll ? na : Math.min(na, HERO_LIMIT - shownD);
    var hidden = total - shownD - shownA;
    function card(it) {
      return "<div class='cc-hero-item " + it.kind + "'" + it.attr + " tabindex='0'>" +
        "<b>" + E(H.cut(it.title, 90)) + "</b><small>" + E(H.cut(it.why, 150)) + "</small>" +
        "<em>" + E(it.ref || "") + (it.age ? (it.ref ? " · " : "") + H.ago(it.age) : "") + "</em></div>";
    }
    function group(cls, title, sub, list, shown, srcOk, srcName) {
      var body;
      if (!srcOk) body = "<div class='cc-hero-empty'>" + E(srcName) + " недоступен — эта группа не проверена.</div>";
      else if (!list.length) body = "<div class='cc-hero-empty'>Нет.</div>";
      else if (!shown) body = "<div class='cc-hero-empty'>" + list.length + " — под «Показать ещё».</div>";
      else body = "<div class='cc-hero-list'>" + list.slice(0, shown).map(card).join("") + "</div>";
      return "<section class='cc-hero-group " + cls + "'><header><span class='cc-hero-kind'>" + E(title) + "</span><b>" + (srcOk ? list.length : "—") + "</b><small>" + E(sub) + "</small></header>" + body + "</section>";
    }
    return head +
      group("decide", "Нужно решить", "только формальные решения Основателя", decisions, shownD, M.fp.ok, "Проекция решений Основателя") +
      group("move", "Маршруты на вашей стороне", "владелец следующего хода — вы; это назначение, а не оценка срочности", assigned, shownA, ok("routes"), "Источник маршрутов") +
      (hidden > 0 ? "<button class='cc-hero-more' data-cc-hero-more>Показать ещё " + hidden + "</button>" :
        (ui.heroAll && total > HERO_LIMIT ? "<button class='cc-hero-more' data-cc-hero-more>Свернуть</button>" : "")) +
      (ok("inbox") && M.inboxItems.length ? "<div class='cc-foot-note'>Входящие Основателя: " + M.inboxItems.length + " запрос(ов) на участие. Они не становятся формальными решениями без проекции решений Основателя.</div>" : "") +
      "<div class='cc-foot-note'>Панель не повышает срочность по давности, владельцу хода или локальной оценке. Приоритет показывается только таким, каким его отдал источник.</div>";
  }

  function renderMeta() {
    var recent = recentEventCount(7), q = M.adm.ok ? activeQueue() : null;
    var chips = [];
    if (M.fp.ok) {
      var moving = M.FP.lines.filter(function (x) { return /движ/i.test(String(x.state || "")); }).length;
      chips.push("<a class='cc-meta' href='#links'><i>◎</i>канонические линии: <b>" + M.FP.lines.length + "</b><span class='cc-meta-sub'>в движении " + moving + " · пересечений " + M.FP.intersections.length + "</span></a>");
    }
    chips.push("<a class='cc-meta' href='#timeline'><i>↻</i>изменений за 7 дней: <b>" + E(recent == null ? "—" : recent) + "</b>" + sparkDays() + "</a>");
    var scan = M.d.scannerDiagnostics || null;
    var scanCov = scan && scan.source_coverage ? scan.source_coverage : null;
    var scanTotal = scanCov && scanCov.total_sources != null ? Number(scanCov.total_sources) : null;
    var scanOk = scanCov && scanCov.ok_count != null ? Number(scanCov.ok_count) : null;
    var scanDegraded = scanCov && String(scanCov.status || "").indexOf("DEGRADED") === 0;
    var marketLabel = !ok("marketSignals") ? "источник недоступен" :
      (M.marketCount != null ? M.marketCount : (M.marketState === "NOT_ACTIVATED" ? "не активирован" : (M.marketSignalsKnown ? "состояние активации не передано" : "signals[] не передан")));
    var marketSub = !ok("scannerDiagnostics") ? "диагностика Scanner недоступна" :
      (scanCov && scanTotal != null && scanOk != null ?
        ("накоплено в хранилище · текущий Scanner " + scanOk + "/" + scanTotal + " источников") :
        "свежесть и покрытие Scanner не подтверждены");
    chips.push("<a class='cc-meta" + (scanDegraded ? " warn" : "") + "' href='#signals'><i>◉</i>рыночные сигналы: <b>" + E(marketLabel) + "</b><span class='cc-meta-sub'>" + E(marketSub) + "</span></a>");
    chips.push("<a class='cc-meta' href='#placement'><i>⌖</i>качество карты: <b>" + (q ? q.active + " в активной очереди" : "Не проверено") + "</b>" +
      (q ? "<span class='cc-meta-sub'>по источнику " + q.sourceTotal + (q.archived ? " · " + q.archived + " в архиве" : "") + "</span>" : "") + "</a>");
    if (ok("inbox") && M.inboxItems.length) {
      chips.push("<span class='cc-meta'><i>!</i>Входящие Основателя: <b>" + M.inboxItems.length + "</b><span class='cc-meta-sub'>запросы на участие, не автоматически решения</span></span>");
    }
    return chips.join("");
  }

  function datedEvents() {
    if (M.tu.ok) return M.U.company.concat(M.U.events).filter(function (e) { return e.at; });
    if (!ok("objects") && !ok("routes")) return null;
    return M.events;
  }

  function recentEventCount(days) {
    if (M.tu.ok && !Array.isArray(M.tu.data && M.tu.data.company_history)) return null;
    var ev = datedEvents();
    if (!ev) return null;
    return ev.filter(function (e) { var n = H.daysSince(e.at); return n != null && n <= days; }).length;
  }

  // Real per-day event counts over the last 14 days (not a trend line).
  function sparkDays() {
    if (M.tu.ok && !Array.isArray(M.tu.data && M.tu.data.company_history)) return "";
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
      return banner("fallback", "Каноническая карта компании недоступна", "Временная модель компании (Temporal Universe) не ответила (" + M.tu.reason + "). Миры и канонические линии не показываются; маршруты ниже — из Оркестратора.");
    }
    return "<div class='cc-worlds'>" + M.U.worlds.map(function (w) {
      var stars = 0, ev = 0, cap = 0, worldStars = [];
      w.lines.forEach(function (ln) {
        stars += ln.stars.length; ev += ln.history.length; if (hasCapital(ln)) cap += 1;
        ln.stars.forEach(function (s) { worldStars.push(s); });
      });
      var ver = verifiedSummary(worldStars);
      var routes = M.active.filter(function (l) { return l.star && l.star.world === w; });
      var health = { flow: 0, wait: 0, closed: 0, unknown: 0 };
      w.lines.forEach(function (ln) { var t = canonicalTone(ln); health[t] = (health[t] || 0) + 1; });
      var healthText = [health.flow ? "движется " + health.flow : "", health.wait ? "ждёт " + health.wait : "",
        health.closed ? "закрыто " + health.closed : "", health.unknown ? "сверка " + health.unknown : ""].filter(Boolean).join(" · ");
      return "<button class='cc-world-card" + (isSelected("world", w.key) ? " selected" : "") + "'" + sel("world", w.key) + ">" +
        "<span class='cc-world-orbit'><i></i></span>" +
        "<span class='cc-world-body'><b>" + E(w.title) + "</b>" +
        "<small>" + w.lines.length + " лин. · " + stars + " звёзд · verified=true " + ver.yes + (ver.no ? " · false " + ver.no : "") + (ver.unknown ? " · не передан " + ver.unknown : "") + "</small>" +
        "<span class='cc-world-stars'>" + w.lines.map(function (ln) {
          return "<i title='" + E(ln.title + ": " + ln.stars.length + " звёзд") + "' style='--n:" + Math.min(ln.stars.length, 4) + "'></i>";
        }).join("") + "</span>" +
        (M.fp.ok ? "<span class='cc-world-health' title='Каноническое состояние линий: " + E(healthText) + "'>" +
          ["flow","wait","closed","unknown"].map(function (t) { return health[t] ? "<i class='" + t + "' style='--w:" + health[t] + "'></i>" : ""; }).join("") + "</span>" +
          "<small class='cc-world-health-text'>" + E(healthText) + "</small>" : "") +
        "<em>" + (!ok("routes") ? "маршруты не проверены" : (routes.length ? routes.length + " маршрут(а) с точным ID" : "маршрутов с точным ID в текущем чтении нет")) + (ev ? " · событий линий " + ev : "") + (cap ? " · капитал в " + cap + " лин." : "") + "</em></span></button>";
    }).join("") + "</div>";
  }

  function renderDeepLinks() {
    if (!M.tu.ok) return "";
    var specs = [
      { title: "Исследовательский ATLAS", href: "#atlas", note: "специализированное состояние ATLAS", ok: M.U.worlds.some(function (w) { return w.title === "Исследовательский ATLAS"; }) },
      { title: "Digital Twin", href: "#digital-twin", note: "линия «Двойники и синтетические миры»", ok: !!lineByExactTitle("Двойники и синтетические миры") }
    ].filter(function (x) { return x.ok; });
    if (!specs.length) return "";
    return "<div class='cc-deep-head'><span>Глубже в контур</span><small>специализированные поверхности только по точному каноническому соответствию</small></div>" +
      "<div class='cc-deep-grid'>" + specs.map(function (x) {
        return "<a class='cc-deep-card' href='" + x.href + "'><b>" + E(x.title) + "</b><small>" + E(x.note) + "</small><em>открыть контур →</em></a>";
      }).join("") + "</div>" +
      (lineByExactTitle("BrazilPortal") ? "<div class='cc-peripheral-row'><span>Периферийный контур</span><a href='#brazilportal'>BrazilPortal · открыть малое окно →</a></div>" : "");
  }

  function lineCard(l) {
    var r = l.r;
    var blockersN = l.risk.blockers;
    var why = r.priority ? "приоритет в источнике: " + r.priority : (l.downstream.length ? "от него явно зависят " + l.downstream.length + " маршрута" : "обоснование важности источником не передано");
    var place = routePlace(l);
    var identityText = l.objId ? l.objId : (l.sourceObjectId ? l.sourceObjectId + " (исходный ID; каноническая связь не подтверждена)" : "канонический объект не связан");
    var where = [place.text, l.area ? "область: " + H.humanCode(l.area) : null, identityText].filter(Boolean).join(" · ");
    return "<article class='cc-line st-" + l.tone + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + " tabindex='0'>" +
      hexBadge(initials(routeDisplayTitle(l.title)), l.tone) +
      "<div class='cc-line-head'>" +
      "<div class='cc-line-id'><b>" + E(H.cut(routeDisplayTitle(l.title), 40)) + "</b><small>" + E(where) + "</small></div>" +
      "<div class='cc-line-state'>" + toneDot(l.tone, routeToneLabel(l)) + "<em>" + E(H.cut(human(r.stage || r.status || "этап не передан"), 42)) + "</em></div>" +
      "<div class='cc-line-block' title='явные blocker-факты самого маршрута; записи объекта считаются отдельно'><small>Блокеры маршрута</small>" +
      (blockersN ? "<span class='cc-count risk'>" + blockersN + "</span>" : "<span class='cc-count ok'>0</span>") + "</div></div>" +
      "<div class='cc-line-cells'>" +
      "<div class='cc-line-col next'><small>Следующий переход</small><span title='" + E(l.next || "") + "'>" + E(H.cut(humanActionText(l.next || "не передан источником"), 90)) + "</span></div>" +
      "<div class='cc-line-col'><small>Ход у</small><span>" + E(ownerLabel(r.ball_owner)) + (l.waiting ? " <em class='wait'>· ждём</em>" : "") + "</span></div>" +
      "<div class='cc-line-col'><small>Условие движения</small><span>" + E(H.cut(r.review_condition || "не передано", 70)) + "</span></div>" +
      "</div>" +
      "<div class='cc-line-foot'><span class='cc-why'>" + E(why) + "</span>" +
      "<span class='cc-links'>" +
      (l.star ? "<i class='uni' title='звезда Founder Universe по точному ID'>★ " + E(H.cut(l.star.line.title, 18)) + "</i>" : "") +
      (l.upstream.length ? "<i title='зависит от'>↑ " + l.upstream.length + "</i>" : "") +
      (l.downstream.length ? "<i title='от него зависят'>↓ " + l.downstream.length + "</i>" : "") +
      (l.bridges.length ? "<i title='общий объект'>⇄ " + l.bridges.length + "</i>" : "") +
      (!l.upstream.length && !l.downstream.length && !l.bridges.length && !l.star ?
        "<i class='muted'>" + E((ok("objects") && M.tu.ok) ? "явных связей в текущих источниках не найдено" : "часть контуров связей не проверена") + "</i>" : "") +
      "</span><span class='cc-move'>" + E(l.risk.stale == null ? "движение без даты" : "движение " + H.ago(r.last_movement_at)) + "</span></div>" +
      "</article>";
  }

  function renderRecentChanges(limit) {
    var rows = [];
    if (M.fp.ok) M.FP.movements.forEach(function (m) {
      var r = m.raw || {};
      var at = r.last_seen || r.first_seen || null;
      if (at) rows.push({ type: "movement", at: at, ent: m });
    });
    if (M.tu.ok) M.U.company.concat(M.U.events).forEach(function (e) {
      if (e.at) rows.push({ type: "event", at: e.at, ent: e });
    });
    rows.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    rows = rows.slice(0, limit || 7);
    if (rows.length) {
      return "<div class='cc-feed'>" + rows.map(function (row) {
        if (row.type === "movement") {
          var m = row.ent, r = m.raw || {};
          return "<div class='cc-feed-item material'" + sel("movement", m.key) + "><i></i><div><b>Движение компании</b><small>" +
            E(H.cut(r.human_change || m.title, 110)) + (r.why_it_matters ? " · " + E(H.cut(r.why_it_matters, 100)) : "") +
            "</small></div><span>" + E(dateLabel(row.at)) + "</span></div>";
        }
        var e = row.ent, isLine = e.scope === "line";
        return "<div class='cc-feed-item " + (isLine ? "material" : "company") + "'" + sel("event", e.key) + "><i></i><div>" +
          eventBody({ main: e.v.main, why: e.v.why, next: "", proof: e.v.proof, known: e.v.known, raw: e.v.raw },
            (isLine ? e.line.title + " · " + e.world.title : "Компания")) +
          "</div><span>" + E(dateLabel(e.at)) + "</span></div>";
      }).join("") + "</div><div class='cc-foot-note'>Founder Projection · движения компании; Temporal Universe · история компании и линий.</div>";
    }
    if (!ok("objects") && !ok("routes")) return unavailable("Нет источников с датами", "Изменения не выводятся из прошлых данных.");
    var fallback = M.events.slice(0, limit || 7);
    if (!fallback.length) return empty("Датированных событий нет", "Источники ответили, но не передали отметок времени.");
    return "<div class='cc-feed'>" + fallback.map(function (e) {
      return "<div class='cc-feed-item " + (e.kind === "line" ? "line" : (e.material ? "material" : "")) + "'" + sel(e.kind, e.key) + ">" +
        "<i></i><div><b>" + E(H.cut(e.title, 40)) + "</b><small>" + E(e.what) + (e.summary ? " · " + H.cut(e.summary, 70) : "") + "</small></div>" +
        "<span>" + E(H.ago(e.at)) + "</span></div>";
    }).join("") + "</div><div class='cc-foot-note'>Реконструкция: канонические источники изменений недоступны.</div>";
  }

  function renderLanes(lines) {
    if (!lines.length) return empty("Нет активных линий", "");
    var scaleNote = "<div class='cc-lane-axis'><span>−" + LANE_DAYS + " дн.</span><span>−30</span><span>−15</span><span class='now'>сейчас</span><span class='wait'>→ ожидание</span></div>";
    function x(days) { return days == null ? null : Math.max(0, 68 - Math.min(days, LANE_DAYS) / LANE_DAYS * 68); }
    return scaleNote + "<div class='cc-lanes'>" + lines.map(function (l) {
      var lx = x(l.risk.stale), ox = l.obj && l.obj.last_event_at ? x(H.daysSince(l.obj.last_event_at)) : null;
      var start = [lx, ox].filter(function (v) { return v != null; });
      var from = start.length ? Math.max.apply(null, start) : null;
      return "<div class='cc-lane st-" + l.tone + "'" + sel("line", l.key) + ">" +
        "<div class='cc-lane-name'>" + hexBadge(initials(routeDisplayTitle(l.title)), l.tone, "sm") + "<b>" + E(H.cut(routeDisplayTitle(l.title), 18)) + "</b></div>" +
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
      var hot = a.l.tone === "act" || a.l.tone === "blocked";
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
      svg += "<g class='cc-node st-" + l.tone + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + " tabindex='0'>" +
        "<polygon class='cc-node-glow' points='" + hexPoints(p.x, p.y, 36) + "'/>" +
        "<polygon class='cc-node-hex' points='" + hexPoints(p.x, p.y, 30) + "'/>" +
        "<text x='" + p.x.toFixed(1) + "' y='" + (p.y + 4).toFixed(1) + "' text-anchor='middle'>" + E(H.cut(routeDisplayTitle(l.title), 10)) + "</text>" +
        (l.risk.blockers ? "<circle class='cc-node-alert' cx='" + (p.x + 24).toFixed(1) + "' cy='" + (p.y - 22).toFixed(1) + "' r='7'/>" +
          "<text class='cc-node-alert-t' x='" + (p.x + 24).toFixed(1) + "' y='" + (p.y - 19).toFixed(1) + "' text-anchor='middle'>!</text>" : "") +
        "</g>";
    });
    svg += "</svg>";
    var note = (!M.edges.length && !M.bridges.length) ?
      "<div class='cc-graph-note'>" + E(!ok("objects") ?
        "В текущем чтении маршрутов явных route-dependencies не найдено; связи через общий объект не проверены, потому что Registry недоступен." :
        "В текущем чтении маршрутов и Registry явных route-dependencies или общих подтверждённых объектов не найдено. Стрелки по догадке не рисуются.") + "</div>" :
      "<div class='cc-graph-note'>Стрелка — явная зависимость из источника · пунктир — общий объект (структурная связь, не причинная).</div>";
    return "<div class='cc-graph'>" + svg + note + "</div>";
  }

  function renderCapitalIntersectionGraph() {
    if (!M.fp.ok || !M.FP.intersections.length) {
      return M.fp.ok ? empty("Пересечений через капитал нет", "Founder Projection не передал общих единиц капитала между линиями.") :
        unavailable("Проекция Основателя (Founder Projection) недоступна", "Пересечения через капитал не проверены.");
    }
    var edges = M.FP.intersections, titles = [], seen = {};
    edges.forEach(function (e) { [e.aTitle, e.bTitle].forEach(function (t) { if (t && !seen[t]) { seen[t] = 1; titles.push(t); } }); });
    var W = 400, Hh = 260, cx = W / 2, cy = Hh / 2, rx = 145, ry = 88, pos = {};
    titles.forEach(function (title, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / titles.length;
      pos[title] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), ul: lineByExactTitle(title) };
    });
    var svg = "<svg class='cc-graph-svg cc-capital-graph' viewBox='0 0 " + W + " " + Hh + "' role='img' aria-label='Пересечения канонических линий через общий допущенный капитал'>";
    edges.forEach(function (e) {
      var a = pos[e.aTitle], b = pos[e.bTitle]; if (!a || !b) return;
      svg += "<line class='cc-edge capital' x1='" + a.x.toFixed(1) + "' y1='" + a.y.toFixed(1) + "' x2='" + b.x.toFixed(1) + "' y2='" + b.y.toFixed(1) + "'/>";
    });
    titles.forEach(function (title) {
      var p0 = pos[title], ul = p0.ul, tone = ul ? canonicalTone(ul) : "unknown";
      var attr = ul ? sel("uline", ul.key) + " tabindex='0'" : "";
      svg += "<g class='cc-node cc-cap-node st-" + tone + (ul && isSelected("uline", ul.key) ? " selected" : "") + "'" + attr + ">" +
        "<polygon class='cc-node-glow' points='" + hexPoints(p0.x, p0.y, 31) + "'/>" +
        "<polygon class='cc-node-hex' points='" + hexPoints(p0.x, p0.y, 25) + "'/>" +
        "<text x='" + p0.x.toFixed(1) + "' y='" + (p0.y + 3).toFixed(1) + "' text-anchor='middle'>" + E(H.cut(title, 9)) + "</text></g>";
    });
    svg += "</svg>";
    return "<div class='cc-graph-sub'><div class='cc-graph-subhead'><b>Пересечения через капитал</b><span>" + edges.length + " связей · " + titles.length + " линий</span></div>" +
      svg + "<div class='cc-graph-note'>Пунктирная фиолетовая линия = две канонические линии используют один и тот же допущенный капитал. Это не зависимость и не причинное влияние.</div></div>";
  }

  function renderCommandGraph(lines) {
    var routePart = lines.length ? "<div class='cc-graph-sub'><div class='cc-graph-subhead'><b>Операционные зависимости</b><span>маршруты Оркестратора</span></div>" + renderGraph(lines) + "</div>" :
      unavailable("Маршруты недоступны", "Операционные зависимости не проверены.");
    return routePart + renderCapitalIntersectionGraph();
  }

  function renderAttention(lines) {
    var order = ["act", "blocked", "wait", "stale", "unknown", "flow"];
    return "<div class='cc-attn'>" + order.map(function (t) {
      var items = lines.filter(function (l) { return l.tone === t; });
      if (!items.length && t !== "act") return "";
      return "<div class='cc-attn-group st-" + t + "'><div class='cc-attn-head'><b>" + E(TONE_META[t].label) + "</b><span>" + items.length + "</span></div>" +
        (items.length ? items.slice(0, 4).map(function (l) {
          var reason = [];
          if (l.risk.stale != null && l.risk.stale >= H.STALE_DAYS) reason.push("без движения " + l.risk.stale + " дн.");
          if (l.risk.blockers) reason.push("блокеров маршрута " + l.risk.blockers);
          if (l.objBlockers.length) reason.push("у объекта записей " + l.objBlockers.length + " · не приписаны маршруту");
          if (t === "wait") reason.push("ход у «" + ownerLabel(l.r.ball_owner) + "»");
          if (l.downstream.length) reason.push("задерживает " + l.downstream.length);
          if (t === "unknown") reason.push("дата движения не передана");
          return "<div class='cc-attn-item'" + sel("line", l.key) + ">" + hexBadge(initials(routeDisplayTitle(l.title)), t, "xs") +
            "<span><b>" + E(H.cut(routeDisplayTitle(l.title), 22)) + "</b><small>" + E(reason.join(" · ") || "недавнее движение; диагностических сигналов нет") + "</small></span></div>";
        }).join("") : "<div class='cc-attn-none'>ничего не ждёт вашего хода</div>") + "</div>";
    }).join("") + "<div class='cc-foot-note'>Тон — подача панели по ходу, блокерам и давности. Отсутствие движения само по себе не считается аварией. Это не канонический приоритет Оркестратора.</div></div>";
  }

  function renderOrgIntel() {
    if (!M.oi.ok) return unavailable("Организационный интеллект недоступен", M.oi.reason || "источник не ответил");
    var items = M.OI.items, c = M.OI.counts;
    if (!items.length) return empty("Структурных наблюдений нет", "Источник ответил пустым signals[].");
    var summary = [
      ["COMPOUNDING_LOOP", "повторное использование"],
      ["DEPENDENCY_CONCENTRATION_CANDIDATE", "концентрация использования"],
      ["CANONICAL_ROUTE_GAP", "разрыв маршрута"],
      ["FOUNDER_AUTHORITY_GATE", "шлюз Основателя"]
    ].map(function (x) { return "<span class='cc-org-chip'><b>" + (c[x[0]] || 0) + "</b><small>" + E(x[1]) + "</small></span>"; }).join("");
    function row(it) {
      var r = it.raw, n = it.lines.length;
      return "<button class='cc-org-row" + (it.founderAction ? " founder" : "") + "'" + sel("org", it.key) + ">" +
        "<span>" + codeTag(it.cls, "tag") + "<b>" + E(H.cut(it.title, 58)) + "</b>" +
        "<small>" + (n ? n + " канонич. линий" : "линии не указаны") + (it.founderAction ? " · требует действия Основателя" : (!it.founderActionKnown ? " · флаг действия не передан" : "")) + "</small></span>" +
        "<i>›</i></button>";
    }
    return "<div class='cc-org-summary'>" + summary + "</div>" +
      "<div class='cc-foot-note'>Это структурные наблюдения источника, а не оценка риска или приоритет.</div>" +
      "<details class='cc-org-details'><summary>Все наблюдения · " + items.length + "</summary><div class='cc-org-list'>" + items.map(row).join("") + "</div></details>";
  }

  function renderSystemReconciliation() {
    if (!M.sr.ok) return unavailable("Системная сверка недоступна", M.sr.reason || "источник не ответил");
    var items = M.SR.items, byPath = M.SR.counts.COMPANY_PATH || 0, byCapital = M.SR.counts.COMPANY_CAPITAL || 0;
    var founderN = items.filter(function (x) { return x.founderAction; }).length;
    var founderUnknown = items.filter(function (x) { return !x.founderActionKnown; }).length;
    if (!items.length) return empty("Системная очередь пуста", "Steward Reconciliation не передал system_reconciliation[].");
    function row(it) {
      return "<button class='cc-sys-row'" + sel("sysrec", it.key) + "><span><b>" + E(H.cut(it.title, 58)) + "</b>" +
        "<small>" + E(human(it.gap)) + " · " + E(it.source || "источник не указан") + "</small></span><i>›</i></button>";
    }
    return "<div class='cc-system-summary'><strong>" + items.length + "</strong><span>пунктов системной сверки</span></div>" +
      "<div class='cc-system-stats'><span><b>" + byPath + "</b> по каноническим линиям</span><span><b>" + byCapital + "</b> по капиталу без маршрута</span><span><b>" + founderN + "</b> явно требуют вас" + (founderUnknown ? " · у " + founderUnknown + " флаг не передан" : "") + "</span></div>" +
      "<div class='cc-foot-note'>Жёсткое правило источника: системные разрывы не становятся задачами Основателя по умолчанию. Founder gate показывается отдельно выше.</div>" +
      "<details class='cc-system-details'><summary>Открыть системную очередь · " + items.length + "</summary><div class='cc-system-list'>" + items.map(row).join("") + "</div></details>";
  }

  function renderSignalLab() {
    var d = M.d.signalLabStatus || null;
    if (!ok("signalLabStatus") || !d) {
      return "<div class='cc-siglab-head'><span>ATLAS · SIGNAL LAB</span><em class='off'>источник недоступен</em></div>" +
        "<div class='cc-siglab-empty'>Живое состояние лаборатории сейчас не прочитано. Панель не подставляет последнее известное значение.</div>";
    }

    var st = d.current_stage || {};
    var live = d.live || {};
    var control = live.control || {}, treatment = live.treatment || {};
    function countOrNull(v) {
      if (v == null || v === "") return null;
      var n = Number(v);
      return isFinite(n) ? n : null;
    }
    function pairTotal(a, b) {
      a = countOrNull(a); b = countOrNull(b);
      return a != null && b != null ? a + b : null;
    }
    var observations = pairTotal(control.observations, treatment.observations);
    var confirmed = pairTotal(control.confirmed, treatment.confirmed);
    var restarts = [d.last_restart && d.last_restart.control, d.last_restart && d.last_restart.treatment].filter(Boolean);
    var restarted = restarts.length ? restarts.sort(function (a,b) { return new Date(b) - new Date(a); })[0] : null;
    var running = upper(d.health) === "RUNNING";
    var stageN = Number(st.index || 0), stageTotal = Number(st.total || 0);
    var gateLabels = {
      GLOBAL_UNIVERSE_FREEZE: "заморозка глобальной выборки",
      OFFICIAL_SOURCE_DISCOVERY: "квалификация официальных источников",
      BLIND_SEMANTIC_HOLDOUT: "слепой исторический тест",
      PROSPECTIVE_GLOBAL_LIVE: "глобальное проспективное наблюдение"
    };
    var gate = gateLabels[String(d.next_gate || "")] || human(d.next_gate || "следующий рубеж не передан");
    var objective = d.objective || "Цель не передана источником.";
    var stageLabel = st.label || human(st.name || "этап не передан");
    var scope = d.scope || {};
    var regionN = A(scope.regions).length;
    var sectorN = A(scope.sectors).length;

    return "<a class='cc-siglab-link' href='#atlas' aria-label='Открыть исследовательский ATLAS'>" +
      "<div class='cc-siglab-head'><span>ATLAS · SIGNAL LAB</span><em class='" + (running ? "on" : "off") + "'><i></i>" + E(running ? "наблюдение идёт" : human(d.health || "состояние не передано")) + "</em></div>" +
      "<div class='cc-siglab-main'><div class='cc-siglab-stage'><small>Текущий этап</small><b>" + E(stageN && stageTotal ? stageN + " из " + stageTotal : "—") + "</b><span>" + E(stageLabel) + "</span></div>" +
      "<div class='cc-siglab-objective'><small>Цель</small><p>" + E(objective) + "</p></div></div>" +
      "<div class='cc-siglab-metrics'>" +
        "<span><small>Наблюдений в двух потоках</small><b>" + E(observations == null ? "—" : observations) + "</b></span>" +
        "<span><small>Счётчик поля confirmed</small><b>" + E(confirmed == null ? "—" : confirmed) + "</b><i>служебное состояние двух потоков</i></span>" +
        "<span><small>Охват</small><b>" + E(regionN ? regionN + " регионов" : "—") + "</b><i>" + E(sectorN ? sectorN + " классов отраслей" : "") + "</i></span>" +
        "<span><small>Последний перезапуск</small><b>" + E(restarted ? timeLabel(restarted) : "—") + "</b></span>" +
        "<span><small>Следующий цикл</small><b>" + E(d.next_cycle ? timeLabel(d.next_cycle) : "—") + "</b></span>" +
        "<span><small>Следующий рубеж</small><b>" + E(gate) + "</b></span>" +
      "</div>" +
      "<div class='cc-siglab-foot'>Показывается состояние исследовательского контура, а не вывод о качестве ATLAS. Поля confirmed/degraded — служебные счётчики источника и не интерпретируются Панелью как подтверждение или опровержение гипотезы.</div>" +
    "</a>";
  }

  function renderSystemHealth() {
    var f = M.d.foundationAgg || null;
    var t = M.d.testingSummary || null;
    var h = M.d.hubHealth || null;

    function cell(cls, href, title, value, note) {
      return "<a class='cc-health-cell " + cls + "' href='" + href + "'><span class='cc-health-dot'></span><span><small>" + E(title) + "</small><b>" + E(value) + "</b><em>" + E(note) + "</em></span></a>";
    }

    var out = [];
    if (f) {
      var fs = f.source_status || "состояние не передано";
      var fsLabel = f.source_status ? ("источник: " + upper(f.source_status)) : "состояние не передано";
      var failDurability = A(f.dimensions).filter(function (x) { return x && x.dimension === "artifact_durability_readback" && upper(x.state) === "FAIL"; })[0] || null;
      var orphanCount = failDurability && failDurability.detail && failDurability.detail.orphan_receipts != null ? Number(failDurability.detail.orphan_receipts) : null;
      var fn = orphanCount != null && orphanCount > 0 ? (orphanCount + " осиротевшая расписка хранения: STORED без объекта на диске") :
        (orphanCount === 0 ? "источник явно передал 0 осиротевших расписок" : (upper(fs) === "DEGRADED" ? "подробная причина — в Фундаменте" : (f.freshness_state ? "данные: " + H.humanCode(f.freshness_state) : "подробности в Фундаменте")));
      out.push(cell(upper(fs) === "DEGRADED" ? "warn" : (upper(fs) === "READY" || upper(fs) === "OK" ? "ok" : "neutral"), "#foundation", "Основание", fsLabel, fn));
    } else {
      out.push(cell("neutral", "#foundation", "Основание", "нет данных", "источник не прочитан"));
    }

    if (t) {
      var c = t.counts || {};
      var parts = [];
      if (c.BLOCKED != null) parts.push(c.BLOCKED + " заблокировано");
      if (c.INCONCLUSIVE != null) parts.push(c.INCONCLUSIVE + " без окончательного вывода");
      if (c.COMPLETED != null) parts.push(c.COMPLETED + " завершено");
      if (c.INVALIDATED != null) parts.push(c.INVALIDATED + " недействительно");
      var testingHealthKnown = typeof t.ok === "boolean";
      var testingValue = t.ok === true ? "источник сообщает OK" : (t.ok === false ? "источник сообщает сбой" : "поле ok не передано");
      out.push(cell(t.ok === false ? "warn" : "neutral", "#testing", "Служба Testing", testingValue, (parts.join(" · ") || "состояния проверок не переданы") + (testingHealthKnown ? " · доступность сервиса не является оценкой исходов тестов" : " · состояние сервиса по полю ok не определено")));
    } else {
      out.push(cell("neutral", "#testing", "Тестирование", "нет данных", "источник не прочитан"));
    }

    if (h) {
      var hm = h.hash_mismatches == null ? null : Number(h.hash_mismatches);
      var orp = h.orphan_receipts == null ? null : Number(h.orphan_receipts);
      var cov = h.coverage === "FULL_END_TO_END" ? "сквозное после поступления в транспорт" : H.humanCode(h.coverage || "покрытие не передано");
      var hn = (hm == null ? "—" : hm) + " расхождений хэшей · " + (orp == null ? "—" : orp) + " осиротевших расписок" + (h.coverage === "FULL_END_TO_END" ? " · до отправки с Mac этот контур не наблюдает" : "");
      var hCls = (hm > 0 || orp > 0) ? "warn" : (hm != null && orp != null ? "ok" : "neutral");
      out.push(cell(hCls, "#documents", "Долговечность документов", cov, hn));
    } else {
      out.push(cell("neutral", "#documents", "Долговечность документов", "нет данных", "источник не прочитан"));
    }

    return "<div class='cc-health-head'><span>Состояние системных контуров</span><small>готовность основания, исполнение Testing и долговечность документов — независимые измерения</small></div><div class='cc-health-row'>" + out.join("") + "</div>";
  }

  function renderCommand(page) {
    var routesOk = ok("routes");
    var lines = M.active;
    page.querySelector("[data-cc='stamp']").innerHTML = readStamp();
    page.querySelector("[data-cc='hero']").innerHTML = renderHero();
    page.querySelector("[data-cc='kpis']").innerHTML = renderKPIs();
    page.querySelector("[data-cc='meta']").innerHTML = renderMeta();
    page.querySelector("[data-cc='universe']").innerHTML = renderUniverseStrip();
    page.querySelector("[data-cc='deep-links']").innerHTML = renderDeepLinks();
    page.querySelector("[data-cc='signal-lab']").innerHTML = renderSignalLab();
    page.querySelector("[data-cc='lines']").innerHTML = !routesOk ?
      unavailable("Источник маршрутов недоступен", "Линии не показываются по прошлым или демонстрационным данным.") :
      (lines.length ? (function () {
        var shown = ui.routesAll ? lines : lines.slice(0, 10);
        var hidden = lines.length - shown.length;
        return "<div class='cc-line-list'>" + shown.map(lineCard).join("") + "</div>" +
          (hidden > 0 ? "<button class='cc-hero-more cc-routes-more' data-cc-routes-more>Показать ещё " + hidden + " маршрутов</button>" :
            (ui.routesAll && lines.length > 10 ? "<button class='cc-hero-more cc-routes-more' data-cc-routes-more>Свернуть до 10</button>" : "")) +
          "<div class='cc-foot-note'>На главном экране — первые 10 маршрутов в исходном порядке Оркестратора; полный список раскрывается здесь или доступен в «Линии и объекты». Мир и каноническая линия — только по точному ID объекта.</div>";
      })() : empty("Оркестратор не отдал активных линий", ""));
    page.querySelector("[data-cc='changes']").innerHTML = renderRecentChanges(6);
    page.querySelector("[data-cc='org-intel']").innerHTML = renderOrgIntel();
    page.querySelector("[data-cc='system-reconciliation']").innerHTML = renderSystemReconciliation();
    page.querySelector("[data-cc='lanes']").innerHTML = routesOk ? renderLanes(lines.slice(0, 10)) : unavailable("Нет маршрутов", "Траектории не строятся.");
    page.querySelector("[data-cc='graph']").innerHTML = renderCommandGraph(routesOk ? lines.slice(0, 10) : []);
    page.querySelector("[data-cc='system-health']").innerHTML = renderSystemHealth();
    page.querySelector("[data-cc='attention']").innerHTML = routesOk ? renderAttention(lines) : unavailable("Нет current state", "Шкала не строится.");
  }

  // ------------------------------------------------------------------ Во времени

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
        " title='" + E(e.text + (e.v && e.v.why ? " — " + e.v.why : "") + " · " + dateLabel(e.at)) + "'></span>";
    }
    var lanes = [];
    var companyHistoryProvided = Array.isArray(M.tu.data && M.tu.data.company_history);
    var unresolvedHistoryProvided = Array.isArray(M.tu.data && M.tu.data.unresolved_history);
    lanes.push("<div class='cc-swim-lane company'><div class='cc-swim-name'><b>Компания</b><small>" + (companyHistoryProvided ? U.company.length + " событ. · company_history" : "company_history не передан") + "</small></div>" +
      "<div class='cc-swim-track'><span class='cc-swim-now' style='left:80%'></span>" +
      U.company.filter(function (e) { return e.at; }).map(function (e, i) { return dot(e, i, "company", sel("event", e.key)); }).join("") + "</div></div>");
    U.worlds.forEach(function (w) {
      var evs = U.events.filter(function (e) { return e.world === w && e.at; });
      var waiting = [];
      w.lines.forEach(function (ln) {
        var hasNext = ln.stars.some(function (s) { var tv = temporalView(s.temporal); return tv.waiting.length || tv.next.length; });
        if (hasNext) waiting.push(ln);
      });
      lanes.push("<div class='cc-swim-lane'><div class='cc-swim-name'><b>" + E(w.title) + "</b><small>" + w.lines.length + " лин. · " + evs.length + " событ.</small></div>" +
        "<div class='cc-swim-track'><span class='cc-swim-now' style='left:80%'></span>" +
        evs.map(function (e, i) { return dot(e, i, "material", sel("event", e.key)); }).join("") +
        waiting.map(function (ln, i) {
          return "<span class='cc-wait-chip st-flow' style='left:" + (82 + (i % 2) * 8) + "%;top:" + (14 + Math.floor(i / 2) % 3 * 26) + "%'" + sel("uline", ln.key) +
            " title='" + E(ln.title + " — ожидает перехода") + "'>" + E(initials(ln.title)) + "</span>";
        }).join("") +
        "</div></div>");
    });
    lanes.push("<div class='cc-swim-lane unresolved'><div class='cc-swim-name'><b>Не размещено</b><small>" + (unresolvedHistoryProvided ? U.unresolved.length + " · unresolved_history" : "unresolved_history не передан") + "</small></div>" +
      "<div class='cc-swim-track'><span class='cc-swim-now' style='left:80%'></span>" +
      U.unresolved.filter(function (e) { return e.at; }).map(function (e, i) { return dot(e, i, "unplaced", sel("event", e.key)); }).join("") + "</div></div>");

    page.querySelector("[data-cc='swim']").innerHTML = "<div class='cc-swim'><div class='cc-swim-axis'>" + ticks +
      "<span class='future' style='left:81%'>ожидание →</span></div>" + lanes.join("") + "</div>" +
      "<div class='cc-legend'><span><i class='mk company'></i>событие компании</span><span><i class='mk material'></i>событие линии</span>" +
      "<span><i class='mk unplaced'></i>неразмещённая история</span><span><i class='mk next'></i>линия со звездой в ожидании перехода (без даты)</span></div>";

    // company → world → line → star
    var tree = U.worlds.map(function (w) {
      return "<div class='cc-world'><div class='cc-world-head'><span class='cc-world-dot'></span><b>" + E(w.title) + "</b>" +
        "<small>" + w.lines.length + " лин. · " + w.lines.reduce(function (n, l) { return n + l.stars.length; }, 0) + " звёзд</small></div>" +
        w.lines.map(function (ln) {
          var last = ln.history.map(eventView).filter(function (v) { return v.at; }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); })[0];
          return "<div class='cc-uline" + (isSelected("uline", ln.key) ? " selected" : "") + "'" + sel("uline", ln.key) + ">" +
            "<div class='cc-uline-head'>" + hexBadge(initials(ln.title), "flow", "sm") + "<span><b>" + E(ln.title) + "</b><small>" +
            ln.stars.length + " звёзд" + (last ? " · " + E(H.cut(last.main, 60)) + " · " + E(dateLabel(last.at)) : (Array.isArray(ln.raw && ln.raw.recent_history) ? " · событий в текущей истории нет" : " · recent_history не передан")) + "</small>" +
            (last && last.why ? "<small class='why'>" + E(H.cut(last.why, 110)) + "</small>" : "") +
            (last ? proofTags(last, true) : "") + "</span>" +
            (hasCapital(ln) ? "<i class='cc-capchip'>капитал</i>" : "") + "</div>" +
            (ln.stars.length ? ln.stars.map(starAxisRow).join("") : "<div class='cc-uline-empty'>У линии нет размещённых звёзд.</div>") +
            "</div>";
        }).join("") + "</div>";
    }).join("");
    page.querySelector("[data-cc='tree']").innerHTML = "<div class='cc-company'><div class='cc-company-head'>" + hexBadge("IC", "flow") +
      "<span><b>ICAM · компания</b><small>" + U.worlds.length + " мир(а) · " + U.lines.length + " линий · " + U.stars.length + " звёзд · " +
      (companyHistoryProvided ? U.company.length + " событий компании" : "company_history не передан") + "</small></span></div>" + (tree || empty("Миров нет", "Temporal Universe ответил без миров.")) + "</div>";

    page.querySelector("[data-cc='unplaced-title']").textContent = "Неразрешённая история";
    page.querySelector("[data-cc='unplaced-sub']").textContent = unresolvedHistoryProvided ? "unresolved_history — не привязана ни к одному объекту" : "unresolved_history не передан источником";
    page.querySelector("[data-cc='unplaced']").innerHTML = !unresolvedHistoryProvided ?
      unavailable("Неразрешённая история не проверена", "Temporal Universe прочитан, но поле unresolved_history не передано.") :
      (U.unresolved.length ? "<div class='cc-feed'>" + U.unresolved.map(function (e) {
        return "<div class='cc-feed-item unplaced" + (isSelected("event", e.key) ? " selected" : "") + "'" + sel("event", e.key) + "><i></i><div>" + eventBody(e.v) + "</div><span>" + E(e.at ? dateLabel(e.at) : "без даты") + "</span></div>";
      }).join("") + "</div><div class='cc-foot-note'>Панель не привязывает эти события к объектам по тематическому сходству. Они остаются неразмещёнными, пока источник не разместит их явно.</div>" :
      empty("Неразрешённой истории нет в текущей проекции", "Temporal Universe явно передал пустой unresolved_history[]."));

    page.querySelector("[data-cc='bounds']").innerHTML = "<ul class='cc-bounds'>" +
      U.rules.map(function (r) { return "<li><b>Правило источника:</b> " + E(scalar(r)) + "</li>"; }).join("") +
      "<li>История / Сейчас / Ждём / Следующий переход звезды — <b>temporal.history</b>, <b>now.state</b>, <b>waiting</b>, <b>next_transition</b> из Temporal Universe; пустое значение означает, что источник его не передал.</li>" +
      "<li>События показываются как изменение → почему важно → следующая веха; пометка — truth_status и binding_class источника.</li>" +
      "<li>У ожидания и следующего перехода нет даты — они стоят в зоне ожидания без срока.</li>" +
      "<li>Маршруты Оркестратора связаны со звёздами только по точному совпадению ID объекта и memory_id.</li>" +
      "</ul>";
  }

  // One star moving through time: История → Сейчас → Ждём → Следующий переход.
  function starAxisRow(s) {
    var tv = temporalView(s.temporal);
    var last = tv.history.slice().sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); })[0];
    var items = function (xs) {
      return xs.map(function (x) { return "<b>" + E(H.cut(x.title, 60)) + "</b>" + (x.timeClass ? "<span class='tc' title='" + E(x.timeClass) + "'>" + E(human(x.timeClass)) + "</span>" : ""); }).join("");
    };
    var name = "<div class='cc-star-name'><span class='cc-star-dot" + (s.verified ? " v" : "") + "'></span><span><b>" + E(H.cut(s.title, 30)) + "</b><small>" +
      E(s.memoryId || "без memory_id") + " · " + E(verifiedLabel(s)) + "</small></span></div>";
    var body = !tv.any ? "<div class='cc-axis-empty'>temporal звезды пуст: истории, состояния, ожидания и перехода источник не передал.</div>" :
      "<div class='cc-axis'>" +
      "<div class='cc-ax past" + (last ? "" : " none") + "'><i></i><small>История" + (tv.history.length > 1 ? " · " + tv.history.length : "") + "</small>" +
        (last ? "<b>" + E(H.cut(last.main, 60)) + "</b>" + (last.why ? "<span>" + E(H.cut(last.why, 80)) + "</span>" : "") +
          "<em>" + E(last.at ? dateLabel(last.at) : "без даты") + "</em>" : "<span>истории нет</span>") + "</div>" +
      "<div class='cc-ax now" + (tv.now ? "" : " none") + "'><i></i><small>Сейчас</small>" + (tv.now ? "<b>" + E(H.cut(tv.now, 60)) + "</b>" : "<span>состояние не передано</span>") + "</div>" +
      "<div class='cc-ax wait" + (tv.waiting.length ? "" : " none") + "'><i></i><small>Ждём</small>" + (tv.waiting.length ? items(tv.waiting) : "<span>—</span>") + "</div>" +
      "<div class='cc-ax next" + (tv.next.length ? "" : " none") + "'><i></i><small>Следующий переход</small>" + (tv.next.length ? items(tv.next) : "<span>—</span>") + "</div>" +
      "</div>";
    return "<div class='cc-star-row" + (s.verified ? " verified" : "") + (isSelected("star", s.key) ? " selected" : "") + "'" + sel("star", s.key) + ">" + name + body + "</div>";
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
            return "<span class='cc-wait-chip st-" + l.tone + "' style='left:" + (82 + (i % 2) * 8) + "%;top:" + (14 + Math.floor(i / 2) % 3 * 26) + "%'" + sel("line", l.key) +
              " title='" + E(routeDisplayTitle(l.title) + " → " + humanActionText(l.next || "переход не передан")) + "'>" + E(initials(routeDisplayTitle(l.title))) + "</span>";
          }).join("") + "</div></div>";
      }).join("") +
      "</div><div class='cc-legend'><span><i class='mk material'></i>материальное событие объекта</span><span><i class='mk obj'></i>прочее событие объекта</span>" +
      "<span><i class='mk line'></i>движение маршрута</span><span><i class='mk unplaced'></i>объект без маршрута</span><span><i class='mk next'></i>маршрут в ожидании перехода</span></div>";

    tree.innerHTML = "<div class='cc-company'><div class='cc-company-head'>" + hexBadge("IC", "unknown") +
      "<span><b>ICAM · реконструкция</b><small>" + M.active.length + " активн. маршрутов · " + M.objs.length + " объектов · миры не определены</small></span></div>" +
      (M.active.length ? M.active.map(function (l) {
        var o = l.obj;
        return "<div class='cc-flow st-" + l.tone + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + ">" +
          "<div class='cc-flow-name'>" + hexBadge(initials(routeDisplayTitle(l.title)), l.tone, "sm") + "<span><b>" + E(H.cut(routeDisplayTitle(l.title), 30)) + "</b><small>" + E((l.objId || (l.sourceObjectId ? l.sourceObjectId + " · связь не подтверждена" : "без канонического объекта")) + (l.origin ? " · происхождение: " + l.origin : "")) + "</small></span></div>" +
          "<div class='cc-flow-step past'><small>Прошлое</small><span>" +
          E(o && o.last_event_at ? (o.last_summary ? H.cut(humanActionText(o.last_summary), 60) : H.humanCode(o.last_meaning_kind || "событие")) + " · " + H.ago(o.last_event_at) :
            (l.r.last_movement_at ? "движение " + H.ago(l.r.last_movement_at) : "история не передана")) + "</span></div>" +
          "<div class='cc-flow-step now'><small>Настоящее</small><span>" + E(human(l.r.stage || l.r.status || "этап не передан")) + "</span>" + toneDot(l.tone, routeToneLabel(l)) + "</div>" +
          "<div class='cc-flow-step wait'><small>Ожидание</small><span>" + E(l.r.review_condition ? H.cut(l.r.review_condition, 60) : (l.waiting ? "ждём: " + ownerLabel(l.r.ball_owner) : "условие не передано")) + "</span></div>" +
          "<div class='cc-flow-step next'><small>Следующий переход</small><span title='" + E(l.next || "") + "'>" + E(l.next ? H.cut(humanActionText(l.next), 60) : "не передан") + "</span></div></div>";
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
    page.querySelector("[data-cc='source']").innerHTML = sourceBadge("tu") + sourceBadge("fp") + (M.tu.ok ? "" :
      banner("fallback", "Реконструкция связей", "Временная модель компании (Temporal Universe) недоступна: миры, канонические линии, траектории и капитал не показываются. Ниже — только маршруты Оркестратора и их объекты по точному ID."));
    var mapBox = page.querySelector("[data-cc='linkmap']");
    if (M.tu.ok) mapBox.innerHTML = universeMap();
    else if (!ok("routes") && !ok("objects")) mapBox.innerHTML = unavailable("Источники недоступны", "Карта связей не строится.");
    else mapBox.innerHTML = routeObjectMap();

    var rows = [];
    if (M.tu.ok) {
      var ver = verifiedSummary(M.U.stars);
      rows.push(proofRow("ok", "Мир → линия", M.U.lines.length, "каноническая структура временной модели компании (Temporal Universe)"));
      rows.push(proofRow("ok", "Линия → звезда", M.U.stars.length, "branches[] линии; verified=true " + ver.yes + (ver.no ? ", verified=false " + ver.no : "") + (ver.unknown ? ", verified не передан " + ver.unknown : "")));
      var trajProvided = Array.isArray(M.tu.data && M.tu.data.strategic_trajectories);
      var unresolvedProvided = Array.isArray(M.tu.data && M.tu.data.unresolved_history);
      rows.push(!trajProvided ? proofRow("warn", "Стратегические траектории", "—", "поле strategic_trajectories не передано — отсутствие траекторий не подтверждено") :
        proofRow(M.U.trajectories.length ? "ok" : "none", "Стратегические траектории", M.U.trajectories.length, M.U.trajectories.length ? "strategic_trajectories" : "источник передал пустой strategic_trajectories[]"));
      rows.push(!unresolvedProvided ? proofRow("warn", "Неразрешённая история", "—", "поле unresolved_history не передано — нулевое состояние не подтверждено") :
        proofRow(M.U.unresolved.length ? "warn" : "ok", "Неразрешённая история", M.U.unresolved.length, M.U.unresolved.length ? "не привязана ни к чему; по сходству не привязывается" : "источник передал пустой unresolved_history[]"));
      var routed = M.lines.filter(function (l) { return l.star; }).length;
      rows.push(!ok("routes") ? proofRow("warn", "Маршрут → звезда", "—", "Источник маршрутов недоступен — связи маршрутов со звёздами не проверены") :
        proofRow(routed ? "ok" : "none", "Маршрут → звезда", routed, "точное совпадение ID объекта маршрута и memory_id звезды"));
    } else {
      rows.push(proofRow("no", "Мир → линия → звезда", "—", "Временная модель компании (Temporal Universe) недоступна: " + M.tu.reason));
    }
    rows.push(!ok("routes") ? proofRow("warn", "Маршрут → маршрут", "—", "Источник маршрутов недоступен — зависимости не проверены") :
      proofRow(M.edges.length ? "ok" : "none", "Маршрут → маршрут", M.edges.length, M.edges.length ? "явные dependency-поля маршрутов" : "текущий источник маршрутов не передаёт явных зависимостей"));
    rows.push(proofRow(M.fp.ok && M.FP.intersections.length ? "ok" : (M.fp.ok ? "none" : "warn"), "Линия ⇄ линия через общий капитал", M.fp.ok ? M.FP.intersections.length : "—", M.fp.ok ? "Проекция Основателя (Founder Projection): совместное подтверждённое использование допущенного капитала; не причинность" : "Проекция Основателя (Founder Projection) недоступна"));
    rows.push(!ok("routes") || !ok("objects") ? proofRow("warn", "Общий объект", "—", "Маршруты или реестр Continuity недоступны — общие объекты не проверены") :
      proofRow(M.bridges.length ? "ok" : "none", "Общий объект", M.bridges.length, M.bridges.length ? "два маршрута ссылаются на один объект, подтверждённый реестром Continuity — структурная связь" : "в текущих маршрутах и реестре общих подтверждённых объектов не найдено"));
    rows.push(!ok("routes") || !ok("objects") ? proofRow("warn", "Висячие ссылки маршрутов", "—", "Маршруты или реестр Continuity недоступны — отсутствие висячих ссылок не подтверждено") :
      proofRow(M.dangling.length ? "warn" : "ok", "Висячие ссылки маршрутов", M.dangling.length, M.dangling.length ? "маршрут ссылается на object_id, которого нет в текущем реестре Continuity" : "в текущем чтении маршрутов и реестра таких ссылок не найдено"));
    rows.push(proofRow("no", "Причинные связи", "—", "ни один источник не передаёт causal-отношений; не рисуются"));
    page.querySelector("[data-cc='proven']").innerHTML = "<div class='cc-proof'>" + rows.join("") + "</div>";

    var impact = page.querySelector("[data-cc='impact']");
    var withDown = M.active.filter(function (l) { return l.downstream.length; });
    impact.innerHTML = withDown.length ? "<div class='cc-impact'>" + withDown.map(function (l) {
      return "<div class='cc-impact-row st-" + l.tone + "'" + sel("line", l.key) + ">" + hexBadge(initials(routeDisplayTitle(l.title)), l.tone, "sm") +
        "<div><b>Если остановится «" + E(H.cut(routeDisplayTitle(l.title), 30)) + "»</b><small>явно задержит:</small><div class='cc-refs'>" + lineRefs(l.downstream) + "</div></div></div>";
    }).join("") + "</div>" :
      empty("Влияние остановки не представлено", "Ни один активный маршрут не объявляет зависимых явно. Панель не выводит влияние по догадке.");

    page.querySelector("[data-cc='strategy']").innerHTML = renderTrajectories();
    page.querySelector("[data-cc='resources']").innerHTML = renderCapital();
  }

  // strategic_trajectories[].path is a sequence of human-readable stages, not
  // line IDs. A stage becomes a link only when it equals a canonical line title
  // exactly; everything else stays a plain stage of the strategy.
  function trajectoryTextRu(value) {
    var raw = String(value == null ? "" : value).trim();
    var exact = {
      "STATE": "Состояние",
      "FORECAST": "Прогноз",
      "OUTCOME": "Исход",
      "ERROR": "Ошибка",
      "MODEL CHANGE": "Изменение модели",
      "BETTER FORECAST": "Улучшенный прогноз",
      "Dynamic World Twin": "Динамическая модель мира",
      "Founder/CEO readiness": "Готовность Основателя / CEO",
      "US move-ready": "Готовность к возможному переезду в США",
      "CURRENT_TO_6M": "от текущего момента до 6 месяцев",
      "LONG": "долгосрочный",
      "canonical commercial architecture": "каноническая коммерческая архитектура",
      "publication strategy previously established": "ранее утверждённая публикационная стратегия",
      "North Star decision D-003": "решение North Star D-003",
      "ATLAS research roadmap": "исследовательская дорожная карта ATLAS",
      "Forecast Core architecture": "архитектура Forecast Core",
      "Founder-confirmed strategy event": "стратегическое событие, подтверждённое Основателем",
      "ESTABLISHED_DIRECTION": "утверждённое направление",
      "NORTH_STAR_ESTABLISHED": "North Star зафиксирована",
      "FOUNDER_CONFIRMED_PENDING_CANON_RECONCILIATION": "подтверждено Основателем; ожидает канонической сверки"
    };
    return exact[raw] || raw;
  }

  function trajectoryStatusRu(value) {
    return trajectoryTextRu(value || "статус не передан");
  }

  function trajectoryValueText(v) {
    if (v == null || v === "") return "";
    if (Array.isArray(v)) return v.map(function (x) { return trajectoryTextRu(scalar(x)); }).join(" · ");
    if (typeof v === "object") {
      // Structured objects stay structured; never collapse them into JSON in Founder UI.
      return Object.keys(v).map(function (k) {
        var labels = { horizon: "горизонт", role: "роль", known_anchor: "известный якорь" };
        return (labels[k] || human(k)) + ": " + trajectoryTextRu(scalar(v[k]));
      }).join(" · ");
    }
    return trajectoryTextRu(String(v));
  }

  function trajectoryPath(t) {
    var raw = t && typeof t === "object" ? (t.path || t.steps || t.lines || []) : [];
    return A(raw).map(function (x) {
      var text = x && typeof x === "object" ? (x.title || pickText(x) || x.id || "") : String(x);
      return { text: text, display: trajectoryTextRu(text), ul: lineByExactTitle(text) };
    });
  }

  // Position on the path is shown only when the source states it; the panel
  // never infers where a strategy "is" from line activity.
  var POSITION_KEYS = ["current_stage", "current_step", "current_position", "position", "current"];
  function trajectoryPosition(t) {
    for (var i = 0; i < POSITION_KEYS.length; i++) if (t && t[POSITION_KEYS[i]] != null && t[POSITION_KEYS[i]] !== "") return { key: POSITION_KEYS[i], value: scalar(t[POSITION_KEYS[i]]) };
    return null;
  }

  function trajectoryKey(t, i) { return String(t && t.id || "T" + i); }

  function trajectoryLane(t) {
    var steps = trajectoryPath(t), pos = trajectoryPosition(t);
    return "<div class='cc-lane-road'>" +
      "<span class='cc-road-node start'><i></i><small>старт</small></span>" +
      steps.map(function (st) {
        var here = pos && pos.value === st.text;
        return "<span class='cc-road-seg'></span>" + (st.ul ?
          "<button class='cc-road-node stage linked" + (here ? " here" : "") + "' title='точное совпадение с линией Founder Universe'" + sel("uline", st.ul.key) + "><i></i><b>" + E(H.cut(st.display, 30)) + "</b>" + (here ? "<em>мы здесь</em>" : "<em>линия</em>") + "</button>" :
          "<span class='cc-road-node stage" + (here ? " here" : "") + "'><i></i><b>" + E(H.cut(st.display, 30)) + "</b>" + (here ? "<em>мы здесь</em>" : "") + "</span>");
      }).join("") +
      "<span class='cc-road-seg last'></span><span class='cc-road-node star'><i>✦</i><b>Целевая звезда</b></span></div>";
  }

  function trajectoryFacts(t) {
    var pos = trajectoryPosition(t);
    function fact(label, v, cls) {
      var has = v != null && v !== "" && !(Array.isArray(v) && !v.length);
      return "<div class='cc-tfact" + (has ? "" : " none") + (cls ? " " + cls : "") + "'><small>" + E(label) + "</small><span>" + E(has ? H.cut(trajectoryValueText(v), 220) : "источник не передаёт") + "</span></div>";
    }
    return "<div class='cc-tfacts'>" +
      fact("Зачем", t.north_star, "why") +
      fact("Горизонт", t.horizon) +
      "<div class='cc-tfact" + (pos ? "" : " none") + "'><small>Где мы сейчас</small><span>" + E(pos ? trajectoryTextRu(pos.value) : "положение на пути источником не сообщается") + "</span></div>" +
      fact("Возвращается в систему", t.feeds_back_to) +
      fact("Доказательная основа", t.evidence_basis) +
      (t.rule ? fact("Правило", t.rule) : "") +
      (t.publication_contour ? fact("Публикационный контур", t.publication_contour) : "") +
      (t.growth_programs ? fact("Программы роста", t.growth_programs) : "") +
      "</div>";
  }

  function renderTrajectories() {
    if (!M.tu.ok) return unavailable("Траектории недоступны", "strategic_trajectories приходят только из Temporal Universe.");
    if (!Array.isArray(M.tu.data && M.tu.data.strategic_trajectories)) return unavailable("Траектории не проверены", "Temporal Universe прочитан, но поле strategic_trajectories не передано.");
    if (!M.U.trajectories.length) return empty("Стратегических траекторий нет в текущей проекции", "Temporal Universe явно передал пустой strategic_trajectories[].");
    return "<div class='cc-tracks'>" + M.U.trajectories.map(function (t, i) {
      if (!t || typeof t !== "object") return "<div class='cc-track'><div class='cc-track-head'><b>" + E(scalar(t)) + "</b></div></div>";
      var key = trajectoryKey(t, i);
      return "<div class='cc-track" + (isSelected("strategy", key) ? " selected" : "") + "'" + sel("strategy", key) + " tabindex='0'>" +
        "<div class='cc-track-head'><b>" + E(t.title || t.id || "Траектория") + "</b>" +
        (t.status ? "<i class='cc-tag tag' title='формальный код: " + E(String(t.status)) + "'>" + E(trajectoryStatusRu(t.status)) + "</i>" : "") +
        (t.horizon ? "<i class='cc-tag hz'>горизонт: " + E(trajectoryTextRu(scalar(t.horizon))) + "</i>" : "") + "</div>" +
        trajectoryLane(t) + trajectoryFacts(t) + "</div>";
    }).join("") + "</div><div class='cc-foot-note'>Этапы — поле path. Этап-ссылка точно совпадает с названием канонической линии; остальные — этапы стратегии без привязки. Положение на пути отмечается, только если источник его сообщает.</div>";
  }

  function renderCapital() {
    if (M.fp.ok) {
      var caps = M.FP.capital, edges = M.FP.intersections;
      var used = M.FP.lines.filter(function (x) { return x.capital.length; }).length;
      var html = "<div class='cc-proof'>" +
        proofRow(caps.length ? "ok" : "none", "Допущенный капитал компании", caps.length, "Founder Projection · company_capital") +
        proofRow(used ? "ok" : "none", "Линии, использующие капитал", used, "явное поле capital_in_use") +
        proofRow(edges.length ? "ok" : "none", "Подтверждённые пересечения линий", edges.length, "общий допущенный капитал; не причинная связь") +
        "</div>";
      if (caps.length) {
        html += "<div class='cc-owner-list'>" + caps.map(function (c) {
          var consumers = A(c.consumer_lines).map(function (title) {
            var ln = lineByExactTitle(title);
            return ln ? ulineRef(ln) : "<span class='cc-ref dim'>" + E(title) + "</span>";
          }).join("");
          return "<div class='cc-owner'><b>" + E(c.preserved_resource || c.resource || c.id || "Капитал") + "</b>" +
            "<small>" + E([human(c.type), human(c.maturity)].filter(Boolean).join(" · ")) + "</small>" +
            (consumers ? "<div class='cc-refs'>" + consumers + "</div>" : "") +
            (c.evidence_ceiling ? "<p class='muted'>Предел: " + E(c.evidence_ceiling) + "</p>" : "") + "</div>";
        }).join("") + "</div>";
      }
      if (edges.length) {
        html += "<details class='cc-raw cc-intersections'><summary>Пересечения линий через капитал · " + edges.length + "</summary><div class='cc-owner-list'>" +
          edges.map(function (x) {
            var a = x.a ? ulineRef(x.a) : "<span class='cc-ref dim'>" + E(x.aTitle) + "</span>";
            var b = x.b ? ulineRef(x.b) : "<span class='cc-ref dim'>" + E(x.bTitle) + "</span>";
            return "<div class='cc-owner'><div class='cc-refs'>" + a + "<span class='cc-inter-arrow'>⇄</span>" + b + "</div>" +
              (x.bridgeRefs.length ? "<small>через " + E(x.bridgeRefs.join(", ")) + "</small>" : "") +
              (x.evidenceCeiling ? "<p class='muted'>" + E(x.evidenceCeiling) + "</p>" : "") + "</div>";
          }).join("") + "</div></details>";
      }
      return html;
    }
    if (!M.tu.ok) {
      return "<div class='cc-proof'>" + proofRow("no", "Капитал и ресурсы", "—", "Founder Projection и Temporal Universe недоступны") + "</div>";
    }
    var withCap = M.U.lines.filter(hasCapital);
    var total = withCap.reduce(function (n, ln) { return n + capitalItems(ln).length; }, 0);
    return "<div class='cc-proof'>" +
      proofRow(withCap.length ? "ok" : "none", "Капитал линий", total, "fallback: explicit capital Temporal Universe") +
      proofRow("warn", "Пересечения линий", "—", "Founder Projection недоступен — общий капитал между линиями не проверен") + "</div>";
  }

  // Which part of the universe the current selection lights up. Only existing
  // structural links are followed (world ⊃ line ⊃ star, exact route/object IDs,
  // exact-title trajectory stages); nothing new is inferred.
  function selectionContext() {
    var sel0 = ui.selected, U = M.U;
    if (!sel0 || !U) return null;
    var c = { worlds: {}, lines: {}, stars: {} };
    function star(s) { c.stars[s.key] = 1; c.lines[s.line.key] = 1; c.worlds[s.world.key] = 1; }
    function line(ln, withStars) { c.lines[ln.key] = 1; c.worlds[ln.world.key] = 1; if (withStars) ln.stars.forEach(function (s) { c.stars[s.key] = 1; }); }
    var k = sel0.key;
    if (sel0.kind === "star" && U.starByKey[k]) star(U.starByKey[k]);
    else if (sel0.kind === "uline" && U.lineById[k]) line(U.lineById[k], true);
    else if (sel0.kind === "world" && U.worldById[k]) U.worldById[k].lines.forEach(function (ln) { line(ln, true); });
    else if (sel0.kind === "line" && M.lineByKey[k] && M.lineByKey[k].star) star(M.lineByKey[k].star);
    else if (sel0.kind === "object" && M.objByKey[k] && M.objByKey[k].star) star(M.objByKey[k].star);
    else if (sel0.kind === "event" && U.eventByKey[k]) {
      var e = U.eventByKey[k];
      if (e.star) star(e.star); else if (e.line) line(e.line, false); else return null;
    } else if (sel0.kind === "strategy" && U.trajByKey[k]) {
      trajectoryPath(U.trajByKey[k]).forEach(function (st) { if (st.ul) line(st.ul, false); });
    } else return null;
    return Object.keys(c.worlds).length ? c : null;
  }

  function universeMap() {
    var U = M.U, ctx = selectionContext();
    var rowH = 28, gap = 30, top = 48, y = top;
    var sy = {}, ly = {}, wy = {}, bands = [];
    U.worlds.forEach(function (w, wi) {
      if (wi) y += gap;
      var w0 = y;
      w.lines.forEach(function (ln) {
        var l0 = y;
        if (ln.stars.length) ln.stars.forEach(function (st) { sy[st.key] = y + rowH / 2; y += rowH; });
        else y += rowH;
        ly[ln.key] = (l0 + y) / 2;
      });
      wy[w.key] = (w0 + y) / 2;
      bands.push({ w: w, y0: w0 - 10, y1: y + 10 });
    });
    var Wd = 1000, Ht = y + 20;
    var colX = { world: 110, line: 470, star: 840 };
    function st(kind, key) { return !ctx ? "" : (ctx[kind][key] ? " hl" : " dim"); }

    var s = "<svg class='cc-layer-svg" + (ctx ? " has-sel" : "") + "' viewBox='0 0 " + Wd + " " + Ht + "' role='img' aria-label='Миры, линии и звёзды Founder Universe'>" +
      "<text class='cc-layer-h' x='" + colX.world + "' y='22' text-anchor='middle'>МИРЫ</text>" +
      "<text class='cc-layer-h' x='" + colX.line + "' y='22' text-anchor='middle'>ЛИНИИ</text>" +
      "<text class='cc-layer-h' x='" + colX.star + "' y='22' text-anchor='middle'>ЗВЁЗДЫ</text>";
    bands.forEach(function (b, i) {
      s += "<rect class='cc-band" + (i % 2 ? " alt" : "") + st("worlds", b.w.key) + "' x='12' y='" + b.y0 + "' width='" + (Wd - 24) + "' height='" + (b.y1 - b.y0) + "' rx='14'/>";
    });
    U.lines.forEach(function (ln) {
      var on = ctx && ctx.worlds[ln.world.key] && ctx.lines[ln.key];
      s += curve(colX.world + 70, wy[ln.world.key], colX.line - 90, ly[ln.key], "cc-edge own st-" + canonicalTone(ln) + (ctx ? (on ? " hl" : " dim") : ""));
    });
    U.stars.forEach(function (sr) {
      var on = ctx && ctx.lines[sr.line.key] && ctx.stars[sr.key];
      s += curve(colX.line + 90, ly[sr.line.key], colX.star - 90, sy[sr.key], "cc-edge star" + (sr.verified ? "" : " unverified") + (ctx ? (on ? " hl" : " dim") : ""));
    });
    U.worlds.forEach(function (w) {
      s += "<g class='cc-lnode world" + st("worlds", w.key) + (isSelected("world", w.key) ? " selected" : "") + "'" + sel("world", w.key) + " tabindex='0'>" +
        "<rect x='" + (colX.world - 74) + "' y='" + (wy[w.key] - 15) + "' width='148' height='30' rx='15'/>" +
        "<text x='" + colX.world + "' y='" + (wy[w.key] + 4) + "' text-anchor='middle'>" + E(H.cut(w.title, 20)) + "</text></g>";
    });
    U.lines.forEach(function (ln) {
      var yy = ly[ln.key];
      var routed = ln.stars.some(function (x) { return x.routes.length; });
      s += "<g class='cc-lnode line st-" + canonicalTone(ln) + st("lines", ln.key) + (isSelected("uline", ln.key) ? " selected" : "") + "'" + sel("uline", ln.key) + " tabindex='0'>" +
        "<rect x='" + (colX.line - 90) + "' y='" + (yy - 12) + "' width='180' height='24' rx='7'/>" +
        "<polygon points='" + hexPoints(colX.line - 76, yy, 7) + "'/>" +
        "<text x='" + (colX.line - 63) + "' y='" + (yy + 4) + "'>" + E(H.cut(ln.title, 22)) + "</text>" +
        (hasCapital(ln) ? "<text class='cc-lnode-cap' x='" + (colX.line + 82) + "' y='" + (yy + 4) + "' text-anchor='end'>$</text>" : "") +
        (routed ? "<circle class='cc-lnode-route' cx='" + (colX.line + 96) + "' cy='" + yy + "' r='4'/>" : "") + "</g>";
    });
    U.stars.forEach(function (sr) {
      var yy = sy[sr.key];
      s += "<g class='cc-lnode star" + (sr.verified ? " verified" : "") + st("stars", sr.key) + (isSelected("star", sr.key) ? " selected" : "") + "'" + sel("star", sr.key) + " tabindex='0'>" +
        "<rect x='" + (colX.star - 90) + "' y='" + (yy - 11) + "' width='180' height='22' rx='11'/>" +
        "<circle cx='" + (colX.star - 76) + "' cy='" + yy + "' r='4'/>" +
        "<text x='" + (colX.star - 66) + "' y='" + (yy + 4) + "'>" + E(H.cut(sr.title, 21)) + "</text></g>";
    });
    s += "</svg>";
    return (ctx ? "<div class='cc-map-hint'>Подсвечен путь выбранного элемента. <button class='cc-map-clear' data-cc-clear>Снять выделение</button></div>" :
        "<div class='cc-map-hint'>Нажмите на мир, линию или звезду — подсветится её путь, справа откроется инспектор.</div>") +
      "<div class='cc-layer-wrap'>" + s + "</div>" +
      "<div class='cc-legend'><span><i class='ln own'></i>мир → линия</span><span><i class='ln star'></i>линия → проверенная звезда</span>" +
      "<span><i class='ln unver'></i>линия → непроверенная звезда</span><span><i class='mk route'></i>есть маршрут Оркестратора по точному ID</span><span>$ — у линии есть доказанный капитал</span></div>";
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
      s += curve(colX.line + 90, ly[l.key], colX.obj - 90, oy[l.objId], "cc-edge own st-" + l.tone);
    });
    M.edges.forEach(function (e) {
      if (ly[e.from] == null || ly[e.to] == null) return;
      var y1 = ly[e.from], y2 = ly[e.to], bend = colX.line - 110 - Math.min(120, Math.abs(y2 - y1) * 0.35);
      s += "<path class='cc-edge dep' d='M" + (colX.line - 90) + "," + y1 + " C" + bend + "," + y1 + " " + bend + "," + y2 + " " + (colX.line - 90) + "," + y2 + "' marker-end='url(#ccArrow2)'/>";
    });
    lines.forEach(function (l) {
      var y = ly[l.key];
      s += "<g class='cc-lnode line st-" + l.tone + (isSelected("line", l.key) ? " selected" : "") + "'" + sel("line", l.key) + " tabindex='0'>" +
        "<rect x='" + (colX.line - 90) + "' y='" + (y - 13) + "' width='180' height='26' rx='7'/>" +
        "<polygon points='" + hexPoints(colX.line - 76, y, 8) + "'/>" +
        "<text x='" + (colX.line - 62) + "' y='" + (y + 4) + "'>" + E(H.cut(routeDisplayTitle(l.title), 22)) + "</text></g>";
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
    { id: "act", label: "Ход у вас", test: function (l) { return l.tone === "act"; } },
    { id: "blocked", label: "Блокеры", test: function (l) { return l.tone === "blocked"; } },
    { id: "waiting", label: "Ход не у вас", test: function (l) { return l.tone === "wait"; } },
    { id: "stale", label: "Давно без движения", test: function (l) { return l.tone === "stale"; } },
    { id: "unknown", label: "Нужна сверка", test: function (l) { return l.tone === "unknown"; } },
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
      unavailable("Канонические линии недоступны", "Временная модель компании (Temporal Universe) не ответила (" + M.tu.reason + ").") :
      M.U.worlds.map(function (w) {
        return "<div class='cc-objgroup'><div class='cc-world-head'><span class='cc-world-dot'></span><b>" + E(w.title) + "</b><small>" + w.lines.length + " лин.</small></div>" +
          "<div class='cc-objgrid'>" + w.lines.map(function (ln) {
            var ver = verifiedSummary(ln.stars);
            var routes = ln.stars.reduce(function (n, s) { return n + s.routes.length; }, 0);
            var fp = ln.fp || null, tone = canonicalTone(ln);
            var capN = fp ? fp.capital.length : capitalItems(ln).length;
            var crossN = fp ? fp.intersections.length : 0;
            return "<button class='cc-obj cc-canonical-line st-" + tone + (isSelected("uline", ln.key) ? " selected" : "") + "'" + sel("uline", ln.key) + ">" +
              "<span class='cc-obj-top'><b>" + E(H.cut(ln.title, 32)) + "</b>" + (capN ? "<i class='cc-flag cap'>капитал " + capN + "</i>" : "") + "</span>" +
              (fp ? "<span class='cc-tone t-" + tone + "'><i></i>" + E(fp.state) + "</span>" : "<span class='cc-tone t-unknown'><i></i>состояние не передано</span>") +
              (fp && fp.stateBasis ? "<small class='cc-line-basis'>Основание: " + E(human(fp.stateBasis)) + "</small>" : "<small>" + E(ln.key) + "</small>") +
              "<span class='cc-obj-meta'><em>звёзд " + ln.stars.length + " · verified=true " + ver.yes + (ver.unknown ? " · неизвестно " + ver.unknown : "") + (ver.no ? " · false " + ver.no : "") + "</em>" +
              (routes ? "<em>маршрутов " + routes + "</em>" : "") + (capN ? "<em>капитал " + capN + "</em>" : "") +
              (crossN ? "<em>пересечений " + crossN + "</em>" : "") + (ln.history.length ? "<em>событий " + ln.history.length + "</em>" : "") + "</span></button>";
          }).join("") + "</div></div>";
      }).join("");

    var objBox = page.querySelector("[data-cc='objects']");
    if (!ok("objects")) { objBox.innerHTML = unavailable("Реестр объектов недоступен", "Объекты не показываются по прошлым данным."); return; }
    var groups = {}, order = [];
    M.objs.forEach(function (x) {
      var g = !M.tu.ok ? "Мир не проверен" : (x.star ? x.star.world.title : "Связь с Founder Universe не подтверждена");
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(x);
    });
    order.sort(function (a, b) {
      var tail = ["Связь с Founder Universe не подтверждена", "Мир не проверен"];
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
    var slots = {};
    ["placement-sum", "pl-map", "pl-cand", "pl-queue", "pl-conflict", "pl-archive", "pl-archive-n", "placement-trusted", "placement-rules"].forEach(function (k) {
      slots[k] = page.querySelector("[data-cc='" + k + "']");
    });
    if (!M.adm.ok) {
      slots["placement-sum"].innerHTML = banner("unchecked", "Размещение не проверено",
        "Portfolio Admission недоступен (" + M.adm.reason + "). Панель не вычисляет кандидатов, сверку или конфликты сама — ни один объект не помечается как «требует сверки».");
      slots["pl-map"].innerHTML = M.tu.ok ? founderMap() + "<div class='cc-foot-note'>Это видимость по Temporal Universe, а не результат допуска.</div>" : unavailable("Founder Map недоступна", "Temporal Universe тоже не ответил.");
      ["pl-cand", "pl-queue", "pl-conflict", "pl-archive"].forEach(function (k) { slots[k].innerHTML = empty("Не проверено", "Portfolio Admission недоступен."); });
      slots["pl-archive-n"].textContent = "—";
      slots["placement-rules"].innerHTML = empty("Правила допуска недоступны", "rules приходят только из Portfolio Admission.");
      slots["placement-trusted"].innerHTML = empty("Доверенная карта недоступна", "trusted_owner_map приходит только из Portfolio Admission.");
      return;
    }
    var AD = M.AD, c = AD.counts, q = activeQueue();
    var candActive = AD.buckets.candidate.length;
    var candSource = Number(c.exact_owner_candidates != null ? c.exact_owner_candidates : candActive) || 0;
    function tile(cls, label, value, sub) {
      return "<div class='cc-plt pl-" + cls + "'><small>" + E(label) + "</small><strong>" + E(value) + "</strong><span>" + E(sub) + "</span></div>";
    }
    var srcKeys = ["memory", "placed", "exact_owner_candidates", "review_required", "owner_conflicts"];
    var srcNames = { memory: "в памяти", placed: "размещено", exact_owner_candidates: "кандидатов", review_required: "на сверку", owner_conflicts: "конфликтов" };
    slots["placement-sum"].innerHTML = "<div class='cc-plts'>" +
      tile("placed", "На Founder Map", M.tu.ok ? M.U.stars.length : (c.placed != null ? c.placed : "—"), M.tu.ok ? "звёзд в Temporal Universe" : "по счётчику источника") +
      tile("candidate", "Кандидаты на точную связь", candActive, candSource !== candActive ? "из " + candSource + " по источнику · " + (candSource - candActive) + " в архиве" : "точный владелец найден источником; ещё не звёзды") +
      tile("review", "Активная очередь сверки", q.review, "из " + reviewCounts().review + " по источнику" + (q.archived ? " · " + (reviewCounts().review - q.review) + " в архиве" : "")) +
      tile("conflict", "Конфликт владельцев", q.conflicts, q.conflicts ? "решается вручную" : "конфликтов нет") +
      tile("archive", "Архив", AD.buckets.archive.length, "архивные и исторические элементы допуска") + "</div>" +
      "<div class='cc-pl-source'><b>Счётчики источника</b> " + srcKeys.filter(function (k) { return c[k] != null; }).map(function (k) {
        return "<span title='" + E(k) + "'>" + E(srcNames[k]) + " <b>" + E(c[k]) + "</b></span>";
      }).join("") + Object.keys(c).filter(function (k) { return srcKeys.indexOf(k) < 0; }).map(function (k) {
        return "<span title='" + E(k) + "'>" + E(H.humanCode(k)) + " <b>" + E(scalar(c[k])) + "</b></span>";
      }).join("") + "<em>Активная очередь = элементы без архивного state; архив показан отдельно ниже.</em></div>";

    slots["pl-map"].innerHTML = M.tu.ok ? founderMap() : unavailable("Список звёзд недоступен", "Temporal Universe не ответил. Счётчик placed — из Portfolio Admission counts.");
    slots["pl-cand"].innerHTML = AD.buckets.candidate.length ? AD.buckets.candidate.map(admCard).join("") : empty("Кандидатов нет", "");
    slots["pl-queue"].innerHTML = AD.buckets.review.length ? AD.buckets.review.map(admCard).join("") : empty("Активная очередь пуста", "");
    slots["pl-conflict"].innerHTML = AD.buckets.conflict.length ? AD.buckets.conflict.map(admCard).join("") : empty("Конфликтов нет", "");
    slots["pl-archive"].innerHTML = AD.buckets.archive.length ? "<div class='cc-archive-grid'>" + AD.buckets.archive.map(admCard).join("") + "</div>" : empty("Архив пуст", "");
    slots["pl-archive-n"].textContent = String(AD.buckets.archive.length);

    slots["placement-trusted"].innerHTML = AD.trusted.length ? "<div class='cc-trusted'>" + AD.trusted.map(function (t) {
      return "<div class='cc-trusted-row'" + (t.ul ? sel("uline", t.ul.key) : "") + "><span class='from'>" + E(t.branch) + "</span><i>→</i>" +
        (t.ul ? "<span class='to ok'>" + E(t.title) + "<small>" + E(t.ul.world.title) + "</small></span>" :
          "<span class='to miss'>" + E(t.title || "—") + "<small>" + E(M.tu.ok ? "в Temporal Universe нет линии с точно таким названием" : "линия не проверена — Temporal Universe недоступен") + "</small></span>") + "</div>";
    }).join("") + "</div><div class='cc-foot-note'>Доверенная карта: происхождение объекта (owning_branch) → точное название канонической линии. Это основание для кандидатов, а не размещение: сама по себе запись не делает объект звездой.</div>" :
      empty("Доверенная карта пуста", "trusted_owner_map не содержит записей.");

    slots["placement-rules"].innerHTML = "<ul class='cc-bounds'>" + AD.rules.map(function (r) { return "<li><b>Правило допуска:</b> " + E(scalar(r)) + "</li>"; }).join("") +
      "<li>Кандидат с предложенной линией — это структурная принадлежность, а не видимость: на Founder Map он не появляется, пока не станет звездой.</li>" +
      "<li>owning_branch показан как происхождение объекта, а не как его мир.</li>" +
      "<li>Архив — элементы допуска с архивным или историческим state; исходная группа указана на карточке.</li></ul>";
  }

  // The current Founder Map: world → line → star, compact.
  function founderMap() {
    return "<div class='cc-fmap'>" + M.U.worlds.map(function (w) {
      return "<div class='cc-fmap-world'><div class='cc-world-head'><span class='cc-world-dot'></span><b>" + E(w.title) + "</b><small>" +
        w.lines.reduce(function (n, l) { return n + l.stars.length; }, 0) + " звёзд</small></div>" +
        w.lines.filter(function (ln) { return ln.stars.length; }).map(function (ln) {
          return "<div class='cc-fmap-line'><button class='cc-fmap-lt'" + sel("uline", ln.key) + ">" + E(H.cut(ln.title, 34)) + "</button><div class='cc-fmap-stars'>" +
            ln.stars.map(function (sr) {
              return "<button class='cc-fstar" + (sr.verified ? " v" : "") + (isSelected("star", sr.key) ? " selected" : "") + "'" + sel("star", sr.key) +
                " title='" + E((sr.memoryId || "") + " · " + verifiedLabel(sr)) + "'><i></i>" + E(H.cut(sr.title, 26)) + "</button>";
            }).join("") + "</div></div>";
        }).join("") + "</div>";
    }).join("") + "</div>";
  }

  function proposedText(it) {
    var r = it.raw;
    if (r.proposed_line == null) return "линия не предложена";
    if (it.proposedLine) return "предложена линия: " + H.cut(it.proposedLine.title, 24);
    return "предложена «" + H.cut(String(r.proposed_line), 24) + "» — " + (M.tu.ok ? "точной линии нет" : "линия не проверена");
  }

  function conflictLinesHTML(it) {
    return "<div class='cc-refs'>" + (it.conflictLines || []).map(function (c) {
      return c.ul ? ulineRef(c.ul) : "<span class='cc-ref miss' title='нет линии с точно таким названием'>" + E(H.cut(c.title, 28)) + "</span>";
    }).join("") + "</div>";
  }

  function admissionKindRu(v) {
    var m={RESEARCH:"исследование",FORECAST:"прогноз",IDEA:"идея",INFRASTRUCTURE:"инфраструктура",LEARNING:"обучение",PUBLICATION:"публикация",COMMERCIAL:"коммерческий объект",TEST:"проверка"};
    return m[String(v||"").toUpperCase()]||"тип не описан";
  }

  function admissionStateRu(v) {
    var m={
      ACTIVE:"активно",ACTIVE_THEORY:"активная теория",AWAITING_OUTCOME:"ждёт исхода",BLOCKED_AUTHORITY:"остановлено границей полномочий",
      BLOCKED_EVIDENCE:"остановлено из-за недостатка доказательств",BUILD:"сборка",COMPLETED:"завершено",CONTAMINATED:"контаминировано",
      DORMANT:"неактивно",FROZEN:"заморожено",HELD:"удерживается без продолжения",HISTORICAL:"историческое",INCONCLUSIVE:"без окончательного вывода",
      NARROWED:"область вывода сужена",NEEDS_RECONCILIATION:"нужна сверка",NEGATIVE_RESULT:"отрицательный результат",PARKED:"на паузе",READY:"готово",
      SYNTHETIC_GATE_PASS:"синтетическая проверка пройдена",TO_FREEZE:"готовится к заморозке",WAITING_DATE:"ждёт даты",WAITING_EXTERNAL:"ждёт внешнего ответа"
    };
    return m[String(v||"").toUpperCase()]||"состояние не описано";
  }

  function admissionEvidenceRu(v) {
    var m={
      ARCHIVED_EVIDENCE:"архивное доказательство",CLOSED_HANDOFF:"передача закрыта",CONFIRMATORY_CLOSED:"подтверждающая проверка закрыта",
      DEPENDENCY_WAIT:"ожидание зависимости",ENGINEERING_READY_NOT_EXECUTED:"инженерно готово, но не исполнено",FORMAL_THEORY_NODE:"формальный теоретический узел",
      FROZEN_ACCESS_FAILURE:"зафиксированный отказ доступа",FROZEN_PROSPECTIVE_PROTOCOL:"замороженный проспективный протокол",GOVERNANCE_EVIDENCE:"доказательство по управлению полномочиями",
      HISTORICAL_VALIDATION_PARKED:"историческая проверка на паузе",LEDGER_ACTIVE_HARNESS:"реестр активного тестового контура",LEDGER_FOUNDER_DECISION:"решение Основателя зафиксировано в реестре",
      LEDGER_FROZEN_O1:"замороженная запись O1",LEDGER_FROZEN_R4:"замороженная запись R4",LEDGER_PLUS_DRIVE_ARTIFACTS:"реестр и артефакты хранилища",
      LEDGER_RECONCILED:"реестр сверен",MEMORY_ONLY:"только память, без отдельного артефакта",MODEL_CANDIDATE:"кандидат модели",NOT_FROZEN:"не заморожено",
      PARTIAL:"частичное подтверждение",PRE_FREEZE:"до заморозки",RECONCILED_ARTIFACT_LINEAGE:"происхождение артефактов сверено",RECONCILED_MULTI_SOURCE:"сверено по нескольким источникам",
      RECOVERED_HISTORY:"восстановленная история",REGISTRY_CORROBORATED_PRIMARY_RESULT_NOT_RECOVERED:"реестр подтверждает основной результат, исходный артефакт не восстановлен",
      STATE_MODEL_INCOMPLETE:"модель состояния неполна",SUBMITTED_VALIDATION_DEFERRED:"передано; проверка отложена",UC12_REQ10_V03_PASS:"техническая проверка UC12/REQ10 v0.3 пройдена",
      UNTESTED_HYPOTHESIS:"непроверенная гипотеза",VERIFIED_ARTIFACT:"проверенный артефакт",VERIFIED_LIVE:"проверено на живом контуре"
    };
    return m[String(v||"").toUpperCase()]||"доказательный статус не описан";
  }

  function admissionReasonRu(v) {
    var m={NO_OWNING_BRANCH:"владеющая ветка не указана",OWNER_CONFLICT:"конфликт владельцев",OWNER_NOT_REGISTERED:"владелец не зарегистрирован",EXACT_OWNER_FROM_ADMITTED_OBJECTS:"точный владелец найден среди уже допущенных объектов"};
    return m[String(v||"").toUpperCase()]||String(v||"");
  }

  function sourceCodeHint(label, code) {
    return "<span class='cc-adm-human' title='формальный код источника: "+E(String(code||"—"))+"'>"+E(label)+"</span>";
  }

  function admCard(it) {
    var r = it.raw, vis = mapVisibility(it.memoryId);
    if (it.conflictLines) {
      return "<div class='cc-pcard pl-" + it.bucket + (isSelected("adm", it.key) ? " selected" : "") + "'" + sel("adm", it.key) + ">" +
        "<b>" + E(H.cut(r.owning_branch || it.title, 40)) + "</b>" +
        "<small class='warn'>происхождение указывает на " + it.conflictLines.length + " линии — решается вручную</small>" +
        conflictLinesHTML(it) + "</div>";
    }
    var member = it.sourceBucket === "candidate" ? { cls: "maybe", text: proposedText(it) } : { cls: "no", text: "линия не определена" };
    var reason = it.sourceBucket === "review" ? r.reason : (it.sourceBucket === "candidate" ? r.basis : (r.reason || kvText(r, ["memory_id", "title", "kind", "state", "evidence_status", "owning_branch"])));
    return "<div class='cc-pcard pl-" + it.bucket + (isSelected("adm", it.key) ? " selected" : "") + "'" + sel("adm", it.key) + ">" +
      "<b>" + E(H.cut(it.title, 34)) + "</b>" +
      "<small>" + [it.memoryId ? E(it.memoryId) : "", r.kind ? sourceCodeHint(admissionKindRu(r.kind),r.kind) : "", r.state ? sourceCodeHint(admissionStateRu(r.state),r.state) : "", r.evidence_status ? sourceCodeHint(admissionEvidenceRu(r.evidence_status),r.evidence_status) : ""].filter(Boolean).join(" · ") + "</small>" +
      (r.owning_branch ? "<small>происхождение: " + E(r.owning_branch) + "</small>" : "") +
      (reason ? "<small class='" + (it.sourceBucket === "candidate" ? "basis" : "warn") + "'>" + E(H.cut(admissionReasonRu(reason), 150)) + "</small>" : "") +
      (it.bucket === "archive" ? "<small>исходная группа: " + E(it.source === "exact_owner_candidates" ? "кандидаты на точную связь" : it.source === "review_required" ? "очередь сверки" : it.source === "owner_conflicts" ? "конфликты владельцев" : it.source) + "</small>" : "") +
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

  // One inspector layout for every entity, always in the same order:
  // что это → где в системе → сейчас → почему важно → история → ждём →
  // следующий переход (+ минимальный шаг) → связи → доказательный потолок.
  function muted(t) { return "<p class='muted'>" + E(t) + "</p>"; }
  function para(t) { return "<p>" + E(t) + "</p>"; }

  function inspector(x) {
    return "<div class='cc-insp-head'>" + x.badge + "<div><h3>" + E(x.title) + "</h3><small>" + E(x.sub) + "</small></div></div>" +
      section("Что это", x.what || muted("не передано источником")) +
      section("Где в системе", x.where || muted("не определено")) +
      section("Сейчас", x.now || muted("источник не передаёт текущее состояние")) +
      section("Почему важно", x.why || muted("источник не передаёт обоснование")) +
      section("История", x.history || muted("датированных событий нет")) +
      section("Ждём", x.waiting || muted("ожидание не передано")) +
      section("Следующий переход", (x.next || muted("не передан источником")) +
        (x.step ? "<div class='cc-insp-step'><h4>Минимальный следующий шаг</h4><p>" + E(x.step.text) + "</p><small>" + E(x.step.src) + "</small></div>" : "")) +
      section("Связи", x.links || muted("доказанных связей нет")) +
      section("Доказательный потолок", "<ul class='cc-ceiling'>" + (x.ceiling || []).join("") + "</ul>") +
      (x.nav ? "<div class='cc-insp-nav'>" + x.nav + "</div>" : "");
  }

  function refsBlock(label, html) { return html ? "<small>" + E(label) + "</small><div class='cc-refs'>" + html + "</div>" : ""; }
  function worldRef(w) { return "<button class='cc-ref uni'" + sel("world", w.key) + ">◎ " + E(H.cut(w.title, 26)) + "</button>"; }
  function starRef(s) { return "<button class='cc-ref uni" + (s.verified ? "" : " dim") + "'" + sel("star", s.key) + ">★ " + E(H.cut(s.title, 24)) + "</button>"; }
  function titlesList(xs) { return "<ul class='cc-hist'>" + xs.map(function (x) { return "<li><b>" + (x.timeClass ? codeTag(x.timeClass) : "—") + "</b>" + E(x.title) + "</li>"; }).join("") + "</ul>"; }
  var NAV_TIME = "<a href='#timeline'>Во времени →</a><a href='#links'>Связи →</a>";

  function inspectLine(l) {
    var r = l.r, place = routePlace(l), tv = l.star ? temporalView(l.star.temporal) : null;
    var routeBlockerItems = A(r.blockers).map(function (b) { return typeof b === "object" ? (b.title || b.blocker || b.id || "блокер") : String(b); });
    var objectBlockerItems = l.objBlockers.map(function (b) { return (b.title || b.blocker || "открытая blocker-запись") + " · объект " + (b.object_id || ""); });
    var hist = [];
    if (l.star) l.star.line.history.map(eventView).forEach(function (v) { hist.push(histItem(v, "Temporal Universe")); });
    if (l.obj && l.obj.last_event_at) hist.push("<li><b>" + E(dateLabel(l.obj.last_event_at)) + "</b>" + E((l.obj.last_meaning_kind ? H.signalKindRu(l.obj.last_meaning_kind) : "событие объекта") + (l.obj.last_summary ? " — " + H.cut(humanActionText(l.obj.last_summary), 110) : "")) + " <em>· Continuity</em></li>");
    if (r.last_movement_at) hist.push("<li><b>" + E(dateLabel(r.last_movement_at)) + "</b>движение по маршруту <em>· Оркестратор</em></li>");
    var step = r.next_move ? { text: humanActionText(r.next_move), src: "Оркестратор · next_move" } :
      (l.rd1 && l.rd1.next_move ? { text: humanActionText(l.rd1.next_move), src: "RD1 · next_move" } :
        { text: "Источник не передал следующий ход. Минимальный шаг — сверить маршрут с владельцем хода и зафиксировать next_move в Оркестраторе.", src: "рекомендация панели: нужна сверка" });
    return inspector({
      badge: hexBadge(initials(routeDisplayTitle(l.title)), l.tone, "lg"), title: routeDisplayTitle(l.title), sub: "Маршрут Оркестратора" + (routeDisplayTitle(l.title) !== l.title ? " · исходное название: " + l.title : "") + (l.area ? " · " + H.humanCode(l.area) : ""),
      what: para("Маршрут работы в Оркестраторе" + (l.star ? " по звезде «" + l.star.title + "» линии «" + l.star.line.title + "»." : ".") +
        (r.ball_owner == null || r.ball_owner === "" ? " Поле ball_owner не передано." : " Ход: «" + ownerLabel(r.ball_owner) + "».")),
      where: crumbs([{ t: "ICAM" }, { t: place.world ? place.world.title : (M.tu.ok ? "связь с Founder Universe не подтверждена" : "мир не проверен") },
        { t: place.uline ? H.cut(place.uline.title, 22) : "линия не определена" }, { t: l.objId || (l.sourceObjectId ? l.sourceObjectId + " · не связано" : "без канонического объекта"), cur: true }]) +
        (l.origin ? muted("Происхождение объекта (owning_branch): " + l.origin) : ""),
      now: "<div class='cc-insp-state st-" + l.tone + "'>" + toneDot(l.tone, routeToneLabel(l)) + "<small>" + E(routeToneHint(l)) + "</small><em>" +
        E(human(r.stage || r.status || "этап не передан")) + "</em><small>" + E(l.risk.stale == null ? "дата движения не передана" : "последнее движение " + H.ago(r.last_movement_at)) + "</small></div>" +
        (routeBlockerItems.length ? "<small>Явные блокеры маршрута</small><ul class='cc-blockers'>" + routeBlockerItems.map(function (b) { return "<li>" + E(H.cut(b, 110)) + "</li>"; }).join("") + "</ul>" :
          (l.risk.blockers ? para("Источник сообщает " + l.risk.blockers + " блокер(а) маршрута без описания.") : "")) +
        (objectBlockerItems.length ? "<div class='cc-object-blocker-context'><small>Контекст связанного объекта · " + objectBlockerItems.length + " записей</small><p>Continuity связывает эти blocker-записи с объектом, но не доказывает, что они блокируют данный маршрут.</p><ul class='cc-blockers context'>" + objectBlockerItems.slice(0,4).map(function (b) { return "<li>" + E(H.cut(b, 110)) + "</li>"; }).join("") + "</ul></div>" : ""),
      why: para((r.priority ? "Приоритет в источнике: " + r.priority + "." : "Источник не передаёт обоснование важности.") +
        (l.downstream.length ? " Его остановка явно задержит " + l.downstream.length + " маршрута." : "") +
        (l.star && hasCapital(l.star.line) ? " У канонической линии есть доказанный капитал: " + capitalItems(l.star.line).join("; ") + "." : "")),
      history: hist.length ? "<ul class='cc-hist'>" + hist.join("") + "</ul>" : "",
      waiting: (r.review_condition ? para(r.review_condition) : (l.waiting ? para("Действия от «" + ownerLabel(r.ball_owner) + "».") : "")) +
        (tv && tv.waiting.length ? "<small>Temporal Universe</small>" + titlesList(tv.waiting) : "") +
        (l.rd1 && l.rd1.next_gate ? muted("RD1 · следующий гейт: " + l.rd1.next_gate) : ""),
      next: l.next ? para(humanActionText(l.next)) + (humanActionText(l.next) !== l.next ? muted("Исходный текст источника: " + l.next) : "") + (l.nextSource ? muted(l.nextSource) : "") : "",
      step: step,
      links: refsBlock("Звезда и линия Founder Universe", l.star ? starRef(l.star) + ulineRef(l.star.line) + worldRef(l.star.world) : "") +
        refsBlock("Зависит от", lineRefs(l.upstream)) + refsBlock("От него зависят", lineRefs(l.downstream)) +
        refsBlock("Общий объект с", lineRefs(l.bridges)) +
        refsBlock("Объект Continuity", l.obj ? "<button class='cc-ref'" + sel("object", l.objId) + ">" + E(H.cut(l.obj.name || l.objId, 26)) + "</button>" : ""),
      ceiling: [
        ceilingRow("ok", "Этап, ход и условие — из Оркестратора (observer/routes)"),
        !M.tu.ok ? ceilingRow("warn", "Мир и каноническая линия не проверены — Temporal Universe недоступен") :
          (l.star ? ceilingRow("ok", "Мир и линия — Temporal Universe, точное совпадение " + l.objId + " = memory_id") :
            (l.objId ? ceilingRow("warn", "В текущем Temporal Universe нет звезды с memory_id " + l.objId + " — связь маршрута с Founder Universe не подтверждена") : ceilingRow("info", "Founder Universe не связывается: у маршрута нет доказанного канонического object_id"))),
        l.obj ? ceilingRow("ok", "Канонический объект " + l.objId + " подтверждён реестром Continuity") :
          (l.objMissing ? ceilingRow("warn", "Заявленный канонический объект " + l.objId + " не найден в реестре — нужна сверка") :
            (l.sourceObjectId ? ceilingRow("warn", "Источник маршрута передал ID " + l.sourceObjectId + ", но canonical_mapping_status=" + (l.mappingState || "не передан") + "; это не считается связью с объектом Continuity") : ceilingRow("info", "Маршрут не передаёт каноническую объектную связь"))),
        ceilingRow(l.upstream.length || l.downstream.length ? "ok" : "info", l.upstream.length || l.downstream.length ? "Зависимости — только явные поля источника" : "Явных зависимостей нет; по догадке не строятся"),
        ceilingRow(l.objBlockers.length ? "info" : "ok", l.objBlockers.length ? "Blocker-записи объекта показаны только как контекст; связь с маршрутом не доказана" : "Blocker-записи объекта к маршруту не приписываются"),
        ceilingRow("no", "Причинное влияние на другие линии — не доказано"),
        ceilingRow("info", "Тон — подача панели, не канонический приоритет")
      ],
      nav: NAV_TIME
    });
  }

  function trustedNote(origin) {
    if (!M.adm.ok) return "";
    var t = M.AD.trusted.filter(function (e) { return e.branch === String(origin); })[0];
    return t ? " · в доверенной карте → «" + t.title + "»" + (t.ul ? "" : " (линии с точно таким названием нет)") : " · в доверенной карте нет";
  }

  function inspectObject(x) {
    var o = x.o, p = placementOfObject(x), tv = x.star ? temporalView(x.star.temporal) : null;
    var step = p.bucket === "unchecked" ? "Дождаться Portfolio Admission: без него размещение не оценивается." :
      p.bucket === "review" ? "Разобрать причину сверки из слоя допуска: " + (x.adm && x.adm.raw.reason || "причина не указана") + "." :
      p.bucket === "candidate" ? "Подтвердить или отклонить предложенную линию — до этого объект не звезда." :
      p.bucket === "conflict" ? "Решить конфликт владельцев вручную." :
      p.bucket === "archive" ? "Действий не требуется: архив." :
      p.bucket === "absent" ? "Объекта нет в слое допуска — проверить, попадает ли он в память портфеля." :
      (x.lines[0] && x.lines[0].next) || "Следующий ход не передан источником.";
    return inspector({
      badge: "<span class='cc-obj-badge pl-" + p.bucket + "'>" + E(initials(x.title)) + "</span>", title: x.title, sub: "Объект Continuity · " + x.key,
      what: para("Объект реестра Continuity со статусом «" + H.ruStatus(o.declared_status) + "»." + (x.founder ? " Помечен как требующий Основателя." : "")),
      where: crumbs([{ t: "ICAM" }, { t: x.star ? x.star.world.title : (M.tu.ok ? "связь с Founder Universe не подтверждена" : "мир не проверен") },
        { t: x.star ? H.cut(x.star.line.title, 20) : "линия не определена" }, { t: x.key, cur: true }]) +
        (x.origin ? muted("Происхождение (owning_branch): " + x.origin + trustedNote(x.origin)) : ""),
      now: "<div class='cc-insp-state'><span class='cc-state st-flow'><i></i>" + E(H.ruStatus(o.declared_status)) + "</span><small>допуск: " + E(p.label) + "</small>" +
        (tv && tv.now ? "<em>Temporal Universe: " + E(tv.now) + "</em>" : "") + "</div>" +
        (x.blockers.length ? "<ul class='cc-blockers'>" + x.blockers.map(function (b) { return "<li>" + E(H.cut(b.title || b.blocker || "открытый блокер", 110)) + "</li>"; }).join("") + "</ul>" : ""),
      why: x.star ? para("Это звезда Founder Map в линии «" + x.star.line.title + "».") : "",
      history: o.last_event_at ? "<ul class='cc-hist'><li><b>" + E(dateLabel(o.last_event_at)) + "</b>" +
        E((o.last_meaning_kind ? H.signalKindRu(o.last_meaning_kind) : "событие") + (o.last_summary ? " — " + H.cut(humanActionText(o.last_summary), 120) : "")) + " <em>· Continuity</em></li></ul>" : "",
      waiting: tv && tv.waiting.length ? titlesList(tv.waiting) : "",
      next: (tv && tv.next.length ? titlesList(tv.next) : "") || ((x.rd1 && (x.rd1.next_gate || x.rd1.next_move)) || (x.lines[0] && x.lines[0].next) ? para(humanActionText((x.rd1 && (x.rd1.next_gate || x.rd1.next_move)) || x.lines[0].next)) : ""),
      step: { text: humanActionText(step), src: "по данным слоя допуска и Continuity" },
      links: refsBlock("Звезда", x.star ? starRef(x.star) + ulineRef(x.star.line) : "") +
        refsBlock("Маршруты", lineRefs(x.lines.map(function (l) { return l.key; }))) +
        refsBlock("Слой допуска", x.adm ? "<button class='cc-ref'" + sel("adm", x.adm.key) + ">" + E(human(x.adm.source === "exact_owner_candidates" ? "кандидат" : x.adm.source === "review_required" ? "на сверке" : "конфликт")) + "</button>" : ""),
      ceiling: [
        ceilingRow("ok", "Идентичность и статус — реестр Continuity"),
        M.tu.ok ? ceilingRow(x.star ? "ok" : "warn", x.star ? "Мир и линия — Temporal Universe по точному memory_id" : "Звезды с этим ID нет — мир не определён") : ceilingRow("warn", "Мир не проверен — Temporal Universe недоступен"),
        M.adm.ok ? ceilingRow("ok", "Статус допуска — Portfolio Admission") : ceilingRow("warn", "Допуск не проверен — Portfolio Admission недоступен"),
        ceilingRow("info", "owning_branch — происхождение, не мир"),
        ceilingRow("no", "Кандидаты по сходству названий не вычисляются")
      ],
      nav: "<a href='#placement'>Размещение →</a><a href='#timeline'>Во времени →</a>"
    });
  }

  function histItem(v, src) {
    return "<li><b>" + E(v.at ? dateLabel(v.at) : "без даты") + "</b>" + E(H.cut(v.main || "событие", 110)) +
      (v.why ? "<small class='why'>" + E(H.cut(v.why, 140)) + "</small>" : "") +
      (v.next ? "<small class='next'>→ " + E(H.cut(v.next, 100)) + "</small>" : "") +
      proofTags(v) + (src ? " <em>· " + E(src) + "</em>" : "") + "</li>";
  }

  function inspectStar(s) {
    var tv = temporalView(s.temporal);
    var extraKeys = Object.keys(tv.extra);
    return inspector({
      badge: "<span class='cc-obj-badge pl-placed star'>★</span>", title: s.title, sub: "Звезда Founder Universe · " + (s.memoryId || "без memory_id"),
      what: para("Звезда Founder Map" + (s.canonical && s.canonical !== s.title ? " (каноническое имя «" + s.canonical + "»)" : "") + ". " +
        (s.verified ? "Принадлежность линии проверена источником." : (s.verifiedKnown ? "Источник явно передал verified=false; принадлежность не подтверждена." : "Поле verified источником не передано; состояние проверки неизвестно."))),
      where: crumbs([{ t: "ICAM" }, { t: s.world.title }, { t: H.cut(s.line.title, 22) }, { t: s.memoryId || s.key, cur: true }]),
      now: "<div class='cc-insp-state st-" + (s.verified ? "flow" : "unknown") + "'><span class='cc-state st-" + (s.verified ? "flow" : "unknown") + "'><i></i>" +
        E(verifiedLabel(s)) + "</span><em>" + E(tv.now || "now.state не передан") + "</em></div>",
      why: para("Часть линии «" + s.line.title + "»" + (hasCapital(s.line) ? ", у которой есть доказанный капитал" : "") + "." +
        (s.routes.length ? " По ней идёт маршрут Оркестратора «" + s.routes[0].title + "»." : "")),
      history: tv.history.length ? "<ul class='cc-hist'>" + s.events.map(function (e) {
        return "<li class='pick'" + sel("event", e.key) + "><b>" + E(e.at ? dateLabel(e.at) : "без даты") + "</b>" + E(H.cut(e.v.main, 110)) +
          (e.v.why ? "<small class='why'>" + E(H.cut(e.v.why, 140)) + "</small>" : "") + (e.v.next ? "<small class='next'>→ " + E(H.cut(e.v.next, 100)) + "</small>" : "") + proofTags(e.v) + "</li>";
      }).join("") + "</ul>" : "",
      waiting: tv.waiting.length ? titlesList(tv.waiting) : "",
      next: tv.next.length ? titlesList(tv.next) : "",
      step: s.routes[0] && s.routes[0].next ? { text: s.routes[0].next, src: "Оркестратор · next_move" } :
        (tv.next.length ? { text: tv.next[0].title, src: "Temporal Universe · next_transition" } : (s.verifiedKnown && !s.verified ? { text: "Проверить принадлежность звезды линии: источник передал verified=false.", src: "рекомендация панели" } : null)),
      links: refsBlock("Линия и мир", ulineRef(s.line) + worldRef(s.world)) +
        refsBlock("Маршруты", lineRefs(s.routes.map(function (l) { return l.key; }))) +
        refsBlock("Объект Continuity", s.obj ? "<button class='cc-ref'" + sel("object", s.memoryId) + ">" + E(H.cut(s.obj.name || s.memoryId, 26)) + "</button>" : "") +
        (extraKeys.length ? "<small>Прочие поля temporal</small>" + kvHTML(tv.extra) : ""),
      ceiling: [
        ceilingRow("ok", "Мир, линия и размещение — Temporal Universe"),
        ceilingRow(s.verified ? "ok" : "warn", s.verified ? "Принадлежность проверена (verified=true)" : (s.verifiedKnown ? "Источник передал verified=false; принадлежность не подтверждена" : "Поле verified не передано; состояние проверки неизвестно")),
        !ok("routes") ? ceilingRow("warn", "Источник маршрутов недоступен; наличие маршрута с этим ID не проверено") :
          ceilingRow(s.routes.length ? "ok" : "info", s.routes.length ? "Маршрут связан по точному ID" : "В текущем чтении маршрутов совпадения по этому ID нет"),
        ceilingRow("no", "Связи с другими звёздами, кроме общей линии, не передаются")
      ],
      nav: NAV_TIME
    });
  }

  function linesTrajectories(ln) {
    return M.U.trajectories.filter(function (t) { return trajectoryPath(t).some(function (x) { return x.ul === ln; }); });
  }

  function specializedNav(kind, title) {
    var key = String(title || "");
    if (kind === "world" && key === "Исследовательский ATLAS") return "<a href='#atlas'>Специализированный ATLAS →</a>";
    if (kind === "line" && key === "BrazilPortal") return "<a href='#brazilportal'>Продуктовая проекция BrazilPortal →</a>";
    if (kind === "line" && key === "Двойники и синтетические миры") return "<a href='#digital-twin'>Открыть Digital Twin →</a>";
    return "";
  }

  function inspectULine(ln) {
    var ver = verifiedSummary(ln.stars);
    var routes = [], waiting = [], next = [], fp = ln.fp || null;
    ln.stars.forEach(function (s) {
      s.routes.forEach(function (r) { routes.push(r.key); });
      var tv = temporalView(s.temporal);
      tv.waiting.forEach(function (w) { waiting.push({ title: w.title + " · " + s.title, timeClass: w.timeClass }); });
      tv.next.forEach(function (w) { next.push({ title: w.title + " · " + s.title, timeClass: w.timeClass }); });
    });
    var trajs = linesTrajectories(ln);
    var now = fp ? para("Каноническое состояние линии: «" + fp.state + "».") : para("Проекция Основателя (Founder Projection) не передала состояние этой линии.");
    if (fp && fp.stateBasis) now += "<div>" + codeTag(fp.stateBasis, "tag") + "</div>";
    if (routes.length) now += para(routes.length + " маршрут(а) Оркестратора работают по её звёздам.");
    var why = "";
    if (hasCapital(ln)) why += "<small>Капитал в использовании</small><div class='cc-caps'>" + capitalItems(ln).map(function (c) {
      return "<span class='cc-cap'>" + E(H.cut(c, 80)) + "</span>";
    }).join("") + "</div>";
    if (trajs.length) why += para("Этап стратегии: " + trajs.map(function (t) { return "«" + (t.title || t.id) + "»"; }).join(", ") + ".");
    if (fp && fp.reconciliation) {
      waiting.push({ title: "Системная сверка: " + human(fp.reconciliation.gap_class || fp.reconciliation.route || "требуется сверка"), timeClass: null });
    }
    var intersectionRefs = fp ? fp.intersections.map(function (x) {
      var other = String(x.with || "");
      var ul = lineByExactTitle(other);
      return ul ? ulineRef(ul) : "<span class='cc-ref dim'>" + E(other) + "</span>";
    }).join("") : "";
    return inspector({
      badge: hexBadge(initials(ln.title), canonicalTone(ln), "lg"),
      title: ln.title, sub: "Каноническая линия · " + ln.key,
      what: para("Линия мира «" + ln.world.title + "»: " + ln.stars.length + " звёзд; verified=true " + ver.yes + (ver.no ? ", verified=false " + ver.no : "") + (ver.unknown ? ", verified не передан " + ver.unknown : "") + "."),
      where: crumbs([{ t: "ICAM" }, { t: ln.world.title }, { t: H.cut(ln.title, 24), cur: true }]),
      now: now, why: why,
      history: ln.history.length ? "<ul class='cc-hist'>" + ln.history.map(function (h) { return histItem(eventView(h)); }).join("") + "</ul>" : "",
      waiting: waiting.length ? titlesList(waiting) : "",
      next: next.length ? titlesList(next) : "",
      links: refsBlock("Мир", worldRef(ln.world)) + refsBlock("Звёзды", ln.stars.map(starRef).join("")) +
        refsBlock("Маршруты", lineRefs(routes)) + refsBlock("Пересечения через капитал", intersectionRefs) +
        refsBlock("Стратегии", trajs.map(function (t) {
          return "<button class='cc-ref'" + sel("strategy", trajectoryKey(t, M.U.trajectories.indexOf(t))) + ">✦ " + E(H.cut(t.title || t.id, 26)) + "</button>";
        }).join("")),
      ceiling: [
        ceilingRow("ok", "Состав и история — Temporal Universe"),
        fp ? ceilingRow("ok", "Состояние, капитал и пересечения — Founder Projection") : ceilingRow("warn", "Проекция Основателя (Founder Projection) недоступна"),
        ceilingRow("info", "Пересечение через общий капитал не означает причинность или прямую передачу")
      ],
      nav: NAV_TIME + specializedNav("line", ln.title)
    });
  }

  function inspectWorld(w) {
    var stars = 0, routes = [], cap = [], events = [], worldStars = [];
    w.lines.forEach(function (ln) {
      stars += ln.stars.length; if (hasCapital(ln)) cap.push(ln);
      ln.stars.forEach(function (s) { worldStars.push(s); s.routes.forEach(function (r) { routes.push(r.key); }); });
    });
    var ver = verifiedSummary(worldStars);
    M.U.events.forEach(function (e) { if (e.world === w) events.push(e); });
    events.sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); });
    return inspector({
      badge: "<span class='cc-obj-badge world'>◎</span>", title: w.title, sub: "Мир Founder Universe",
      what: para("Мир компании: " + w.lines.length + " линий, " + stars + " звёзд; verified=true " + ver.yes + (ver.no ? ", verified=false " + ver.no : "") + (ver.unknown ? ", verified не передан " + ver.unknown : "") + "."),
      where: crumbs([{ t: "ICAM" }, { t: w.title, cur: true }]),
      now: para(!ok("routes") ? "Источник маршрутов недоступен; маршруты по звёздам мира не проверены." : (routes.length ? routes.length + " маршрут(а) Оркестратора связаны со звёздами мира по точному ID." : "В текущем чтении Оркестратора маршрутов по звёздам мира не найдено.")),
      why: cap.length ? para("Доказанный капитал есть у линий: " + cap.map(function (l) { return "«" + l.title + "»"; }).join(", ") + ".") : "",
      history: events.length ? "<ul class='cc-hist'>" + events.slice(0, 5).map(function (e) {
        return "<li class='pick'" + sel("event", e.key) + "><b>" + E(e.at ? dateLabel(e.at) : "без даты") + "</b>" + E(H.cut(e.v.main, 100)) + " <em>· " + E(e.line.title) + "</em></li>";
      }).join("") + "</ul>" : "",
      links: refsBlock("Линии", w.lines.map(ulineRef).join("")) + refsBlock("Маршруты", lineRefs(routes)),
      ceiling: [ceilingRow("ok", "Состав мира — Temporal Universe"), ceilingRow("info", "Мир объекта определяется только через звезду; owning_branch миром не считается")],
      nav: NAV_TIME + specializedNav("world", w.title)
    });
  }

  function inspectEvent(e) {
    var v = e.v, raw = v.raw && typeof v.raw === "object" ? v.raw : {};
    var scopeText = e.scope === "company" ? "Событие уровня компании" : e.scope === "line" ? "Событие линии «" + e.line.title + "»" :
      e.scope === "star" ? "Событие звезды «" + e.star.title + "»" : "Неразрешённое событие — не размещено ни в одной линии";
    var where = e.scope === "company" ? [{ t: "ICAM" }, { t: "компания", cur: true }] :
      e.scope === "unresolved" ? [{ t: "ICAM" }, { t: "не размещено", cur: true }] :
      [{ t: "ICAM" }, { t: e.world.title }, { t: H.cut(e.line.title, 20) }].concat(e.star ? [{ t: H.cut(e.star.title, 18), cur: true }] : []);
    var pending = /PENDING|UNRESOLVED|UNBOUND/.test(String(raw.binding_class || "") + String(raw.scope || ""));
    var meta = [raw.transition ? "<li><b>переход</b>" + codeTag(raw.transition) + "</li>" : "",
      raw.subject ? "<li><b>предмет</b>" + E(raw.subject) + "</li>" : "",
      raw.source_branch ? "<li><b>источник</b>" + E(raw.source_branch) + "</li>" : "",
      raw.evidence_count != null ? "<li><b>доказательств</b>" + E(raw.evidence_count) + "</li>" : "",
      e.scope === "unresolved" && (raw.line || raw.world) ? "<li><b>по тексту события</b>" + E([raw.world, raw.line].filter(Boolean).join(" › ")) + " <em>(не привязка)</em></li>" : ""].join("");
    return inspector({
      badge: "<span class='cc-obj-badge event" + (e.scope === "unresolved" ? " pl-review" : "") + "'>◆</span>", title: v.main || "Событие", sub: scopeText + (e.at ? " · " + dateLabel(e.at) : ""),
      what: para(v.main || "Событие без описания изменения.") + (raw.transition ? "<div>" + codeTag(raw.transition, "tag") + "</div>" : ""),
      where: crumbs(where),
      now: proofTags(v) ? "<div class='cc-insp-proof'>" + proofTags(v) + "</div>" : "",
      why: v.why ? para(v.why) : "",
      history: "<ul class='cc-hist'><li><b>" + E(e.at ? dateLabel(e.at) : "без даты") + "</b>" + E(v.main) + "</li>" + meta + "</ul>",
      waiting: pending ? para("Привязка события ждёт доказательства: " + human(raw.binding_class || raw.scope) + ".") : "",
      next: v.next ? para(v.next) : "",
      links: e.scope === "line" ? refsBlock("Линия", ulineRef(e.line) + worldRef(e.world)) :
        e.scope === "star" ? refsBlock("Звезда", starRef(e.star) + ulineRef(e.line)) :
        (e.scope === "unresolved" ? muted("Событие не привязано. Панель не связывает его с объектами по сходству.") : muted("Событие уровня компании.")),
      ceiling: [
        ceilingRow("ok", "Текст, дата и пометки — Temporal Universe"),
        raw.truth_status ? ceilingRow(/VERIFIED|CONFIRMED/.test(raw.truth_status) ? "ok" : "warn", "Истинность: " + human(raw.truth_status)) : ceilingRow("info", "truth_status не передан"),
        raw.binding_class ? ceilingRow(/EXACT/.test(raw.binding_class) && !pending ? "ok" : "warn", "Привязка: " + human(raw.binding_class)) : ceilingRow("info", "binding_class не передан"),
        e.scope === "unresolved" ? ceilingRow("no", "К объектам по тематическому сходству не привязывается") : ceilingRow("info", "Связь — только структура Temporal Universe")
      ],
      nav: NAV_TIME
    });
  }

  function inspectStrategy(t, key) {
    var steps = trajectoryPath(t), pos = trajectoryPosition(t);
    return inspector({
      badge: "<span class='cc-obj-badge strategy'>✦</span>", title: t.title || t.id || "Стратегия", sub: "Стратегическая траектория" + (t.horizon ? " · горизонт " + scalar(t.horizon) : ""),
      what: para("Стратегическая траектория компании из " + steps.length + " этапов.") + (t.status ? "<div>" + codeTag(t.status, "tag") + "</div>" : ""),
      where: crumbs([{ t: "ICAM" }, { t: "стратегии" }, { t: H.cut(t.title || key, 26), cur: true }]),
      now: para(pos ? "Источник сообщает положение: " + pos.value + "." : "Положение на пути источником не сообщается — панель его не угадывает."),
      why: t.north_star ? para("North Star: " + scalar(t.north_star)) : "",
      history: t.evidence_basis ? "<small>Доказательная основа</small>" + para(scalar(t.evidence_basis)) : "",
      waiting: t.rule ? "<small>Правило</small>" + para(scalar(t.rule)) : "",
      next: steps.length ? "<ol class='cc-steps'>" + steps.map(function (st) {
        return "<li" + (pos && pos.value === st.text ? " class='here'" : "") + ">" + (st.ul ? "<button class='cc-ref uni'" + sel("uline", st.ul.key) + ">" + E(st.text) + "</button>" : E(st.text)) + "</li>";
      }).join("") + "</ol>" : "",
      links: refsBlock("Линии по точному названию этапа", steps.filter(function (x) { return x.ul; }).map(function (x) { return ulineRef(x.ul); }).join("")) +
        (t.feeds_back_to ? "<small>Возвращается в систему</small>" + para(scalar(t.feeds_back_to)) : "") +
        (t.publication_contour ? "<small>Публикационный контур</small>" + para(scalar(t.publication_contour)) : "") +
        (t.growth_programs ? "<small>Программы роста</small>" + para(scalar(t.growth_programs)) : ""),
      ceiling: [
        ceilingRow("ok", "Состав, North Star и горизонт — Temporal Universe"),
        ceilingRow(pos ? "ok" : "info", pos ? "Положение на пути сообщено источником (" + pos.key + ")" : "Положение на пути не сообщается и не выводится"),
        ceilingRow("info", "Этап связан с линией только при точном совпадении названия")
      ],
      nav: "<a href='#links'>Связи и стратегии →</a>"
    });
  }

  function inspectDecision(d) {
    var r = d.raw || {}, choices = A(r.choices);
    return inspector({
      badge: "<span class='cc-obj-badge strategy'>?</span>",
      title: d.title, sub: "Формальное решение Основателя · Founder Projection",
      what: para(r.question || d.title),
      where: crumbs([{ t: "ICAM" }, { t: "Решения Основателя", cur: true }]),
      now: (r.presentation_state ? "<div>" + codeTag(r.presentation_state, "tag") + "</div>" : "") +
        (r.authority_mode ? muted("Режим полномочий: " + human(r.authority_mode)) : ""),
      why: r.why_now ? para(r.why_now) : "",
      waiting: r.deadline_or_condition ? para(r.deadline_or_condition) : "",
      next: r.what_happens_after_choice ? para(r.what_happens_after_choice) : "",
      links: choices.length ? "<small>Допустимые варианты</small><div class='cc-caps'>" + choices.map(function (c) {
        return "<span class='cc-cap'>" + E(c.label || c.canonical || scalar(c)) + "</span>";
      }).join("") + "</div>" : muted("Варианты решения источником не переданы."),
      ceiling: [
        ceilingRow("ok", "Решение показано только из Founder Decision Presentation"),
        ceilingRow("info", "Панель read-only: выбор здесь не записывается"),
        A(r.verified_consequences).length ? ceilingRow("ok", "Проверенные последствия переданы источником") : ceilingRow("info", "Проверенные последствия не переданы")
      ],
      nav: "<a href='#command'>Командный центр →</a>"
    });
  }

  function inspectMovement(m) {
    var r = m.raw || {}, id = r.source_object_id ? String(r.source_object_id) : "";
    var obj = id && M.objByKey[id] ? "<button class='cc-ref'" + sel("object", id) + ">" + E(H.cut(M.objByKey[id].title, 28)) + "</button>" :
      (id ? "<span class='cc-ref dim'>" + E(id) + "</span>" : "");
    return inspector({
      badge: "<span class='cc-obj-badge event'>↻</span>",
      title: r.human_change || m.title, sub: "Движение компании · Founder Projection",
      what: para(r.human_change || m.title),
      where: crumbs([{ t: "ICAM" }, { t: r.source_system || "система" }, { t: id || "без объекта", cur: true }]),
      now: r.state_family ? "<div>" + codeTag(r.state_family, "tag") + "</div>" : "",
      why: r.why_it_matters ? para(r.why_it_matters) : "",
      history: "<ul class='cc-hist'><li><b>впервые</b>" + E(r.first_seen ? timeLabel(r.first_seen) : "не передано") +
        "</li><li><b>последний раз</b>" + E(r.last_seen ? timeLabel(r.last_seen) : "не передано") + "</li>" +
        (r.evidence_count != null ? "<li><b>доказательств</b>" + E(r.evidence_count) + "</li>" : "") + "</ul>",
      next: r.next_effect ? para(r.next_effect) : "",
      links: obj ? refsBlock("Объект", obj) : muted("Связанный объект не передан."),
      ceiling: [
        r.evidence_ceiling ? ceilingRow("info", r.evidence_ceiling) : ceilingRow("info", "Доказательный потолок не передан"),
        ceilingRow("ok", "Изменение — Founder Projection; панель не выводит его из текста маршрута")
      ],
      nav: "<a href='#command'>Командный центр →</a><a href='#timeline'>Во времени →</a>"
    });
  }

  function inspectSystemReconciliation(it) {
    var r = it.raw || {};
    var link = it.ul ? ulineRef(it.ul) : "";
    return inspector({
      badge: "<span class='cc-obj-badge event'>↺</span>",
      title: it.title, sub: "Системная сверка · " + human(it.gap),
      what: para("Пункт системной очереди Steward Reconciliation. Он не является задачей Основателя по умолчанию."),
      where: crumbs([{ t: "ICAM" }, { t: "системная сверка" }, { t: it.source || "источник", cur: true }]),
      now: "<div>" + codeTag(r.route || "SYSTEM_RECONCILIATION", "tag") + "</div>" +
        (it.founderAction ? para("Источник требует действия Основателя.") : (it.founderActionKnown ? para("Источник явно передал founder_action_required=false.") : para("Поле founder_action_required не передано; необходимость действия Основателя не определена."))),
      why: r.gap_class ? para("Причина: " + human(r.gap_class) + ".") : "",
      links: (link ? refsBlock("Каноническая линия", link) : muted("Предмет не совпадает точно с названием канонической линии.")) +
        (A(r.evidence_refs).length ? "<small>Доказательные ссылки</small><div class='cc-caps'>" + A(r.evidence_refs).map(function (x) { return "<span class='cc-cap'>" + E(x) + "</span>"; }).join("") + "</div>" : ""),
      ceiling: [ceilingRow("ok", "Источник — Steward Reconciliation"), ceilingRow("info", "Панель не повышает системный разрыв до Founder-задачи")],
      nav: "<a href='#command'>Командный центр →</a>"
    });
  }

  function inspectOrg(it) {
    var r = it.raw || {};
    var refs = it.lines.map(function (x) { return x.ul ? ulineRef(x.ul) : "<span class='cc-ref dim'>" + E(x.title) + "</span>"; }).join("");
    var ceiling = [ceilingRow("ok", "Класс, предмет и затронутые линии — Organizational Intelligence")];
    if (r.evidence_ceiling) ceiling.push(ceilingRow("info", r.evidence_ceiling));
    if (r.falsification_condition) ceiling.push(ceilingRow("info", "Условие опровержения: " + r.falsification_condition));
    return inspector({
      badge: "<span class='cc-obj-badge strategy'>OI</span>",
      title: it.title, sub: "Организационное наблюдение · " + human(it.cls),
      what: "<div>" + codeTag(it.cls, "tag") + "</div>" + (it.founderAction ? para("Источник явно помечает это наблюдение как требующее действия Основателя.") : (it.founderActionKnown ? para("Источник явно передал founder_action_required=false.") : para("Поле founder_action_required не передано; необходимость отдельного действия Основателя не определена."))),
      where: crumbs([{ t: "ICAM" }, { t: "организационный интеллект", cur: true }]),
      now: it.lines.length ? para("Затронуто канонических линий: " + it.lines.length + ".") : para("Затронутые канонические линии источником не указаны."),
      why: r.evidence_ceiling ? para(r.evidence_ceiling) : "",
      links: it.lines.length ? refsBlock("Затронутые линии", refs) : muted("Связанные линии не переданы."),
      ceiling: ceiling,
      nav: "<a href='#command'>Командный центр →</a><a href='#links'>Связи и стратегии →</a>"
    });
  }

  function inspectAdm(it) {
    var r = it.raw, vis = mapVisibility(it.memoryId);
    var nav = "<a href='#placement'>Размещение →</a>";
    if (it.conflictLines) {
      return inspector({
        badge: "<span class='cc-obj-badge pl-conflict'>!</span>", title: r.owning_branch || it.title, sub: "Portfolio Admission · конфликт владельцев",
        what: para("Происхождение «" + (r.owning_branch || it.title) + "» указывает сразу на " + it.conflictLines.length + " линии."),
        where: crumbs([{ t: "ICAM" }, { t: "слой допуска" }, { t: "конфликт", cur: true }]),
        now: para("Пока конфликт не решён, объекты с этим происхождением не размещаются автоматически."),
        waiting: para("Ручного выбора одной линии-владельца."),
        step: { text: "Выбрать одну линию-владельца вручную.", src: "решение принимается вне панели — панель только читает" },
        links: refsBlock("Конкурирующие линии", "") + conflictLinesHTML(it),
        ceiling: [ceilingRow("ok", "Конфликт — owner_conflicts Portfolio Admission"), ceilingRow("info", "Ссылка на линию — только при точном совпадении названия")],
        nav: nav
      });
    }
    var cand = it.sourceBucket === "candidate";
    return inspector({
      badge: "<span class='cc-obj-badge pl-" + it.bucket + "'>" + E(initials(it.title)) + "</span>", title: it.title,
      sub: "Portfolio Admission · " + (cand ? "кандидат" : it.sourceBucket === "review" ? "на сверке" : "конфликт") + (it.bucket === "archive" ? " · архив" : ""),
      what: para((cand ? "Кандидат на точную связь: источник нашёл точного владельца среди допущенных объектов. Это ещё не звезда и не решение о размещении." : "Объект памяти, который требует сверки.") +
        (it.bucket === "archive" ? " Состояние «" + human(r.state) + "» — показан в архиве." : "")) +
        "<div class='cc-kvs'>" + [r.kind ? codeTag(r.kind, "tag") : "", r.state ? codeTag(r.state, "tag") : "", r.evidence_status ? codeTag(r.evidence_status, "tag") : ""].join("") + "</div>",
      where: crumbs([{ t: "ICAM" }, { t: "слой допуска" }, { t: it.memoryId || "без memory_id", cur: true }]) +
        (r.owning_branch ? muted("Происхождение (owning_branch): " + r.owning_branch + " — не мир.") : ""),
      now: "<div class='cc-pflags'><span class='" + (cand ? "maybe" : "no") + "'>" + E(cand ? proposedText(it) : "линия не определена") + "</span><span class='" + vis.cls + "'>" + E(vis.text) + "</span></div>",
      why: cand ? (r.basis ? para(r.basis) : "") : (r.reason ? para(r.reason) : ""),
      waiting: para(cand ? "Решения о размещении: подтвердить или отклонить предложенную линию." : "Разбора причины сверки."),
      step: { text: cand ? "Подтвердить или отклонить предложенную линию." : "Разобрать причину сверки.", src: "решение принимается вне панели — панель только читает" },
      links: refsBlock("Предложенная линия", it.proposedLine ? ulineRef(it.proposedLine) : "") +
        (cand && r.proposed_line != null && !it.proposedLine && M.tu.ok ? muted("proposed_line сравнивается с названиями линий только на точное совпадение — похожие названия не считаются.") : "") +
        "<details class='cc-raw'><summary>Поля источника</summary><div class='cc-kvs'>" + kvHTML(r, ["title"]) + "</div></details>",
      ceiling: [ceilingRow("ok", "Статус и основание — Portfolio Admission"), ceilingRow("info", "Принадлежность к линии и видимость на карте — разные признаки"), ceilingRow("no", "Кандидаты по сходству названий не вычисляются")],
      nav: nav
    });
  }

  var INSPECTORS = {
    line: { label: "Инспектор маршрута", get: function (k) { return M.lineByKey[k]; }, render: inspectLine },
    object: { label: "Инспектор объекта", get: function (k) { return M.objByKey[k]; }, render: inspectObject },
    star: { label: "Инспектор звезды", get: function (k) { return M.U && M.U.starByKey[k]; }, render: inspectStar },
    uline: { label: "Инспектор линии", get: function (k) { return M.U && M.U.lineById[k]; }, render: inspectULine },
    world: { label: "Инспектор мира", get: function (k) { return M.U && M.U.worldById[k]; }, render: inspectWorld },
    event: { label: "Инспектор события", get: function (k) { return M.U && M.U.eventByKey[k]; }, render: inspectEvent },
    strategy: { label: "Инспектор стратегии", get: function (k) { return M.U && M.U.trajByKey[k]; }, render: inspectStrategy },
    decision: { label: "Инспектор решения", get: function (k) { return M.FP && M.FP.decisionByKey[k]; }, render: inspectDecision },
    movement: { label: "Инспектор движения", get: function (k) { return M.FP && M.FP.movementByKey[k]; }, render: inspectMovement },
    org: { label: "Инспектор наблюдения", get: function (k) { return M.OI && M.OI.byKey[k]; }, render: inspectOrg },
    sysrec: { label: "Инспектор системной сверки", get: function (k) { return M.SR && M.SR.byKey[k]; }, render: inspectSystemReconciliation },
    adm: { label: "Инспектор допуска", get: function (k) { return M.AD && M.AD.items[k]; }, render: inspectAdm }
  };

  function renderInspectors() {
    var s = ui.selected, def = s && INSPECTORS[s.kind], ent = def && def.get(s.key);
    var html = ent ? def.render(ent, s.key) :
      "<div class='cc-insp-idle'><b>Инспектор</b><span>Выберите маршрут, мир, линию, звезду, событие, решение, движение, организационное наблюдение, пункт системной сверки, стратегию или элемент допуска — здесь появятся состояние, история, связи и доказательный потолок.</span></div>";
    document.querySelectorAll("[data-cc-inspector]").forEach(function (el) {
      el.innerHTML = "<div class='cc-insp-title'><span>" + E(ent ? def.label : "Инспектор") + "</span></div>" + html;
    });
  }

  // ------------------------------------------------------------------ wiring

  function selectionValid(s) {
    var def = s && INSPECTORS[s.kind];
    return !!(def && def.get(s.key));
  }

  function defaultSelection() {
    if (selectionValid(ui.selected)) return;
    var pick = M.active.filter(function (l) { return l.tone === "act"; })[0] ||
      M.active.filter(function (l) { return l.tone === "blocked"; })[0] || M.active[0];
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
      var n = M.adm.ok ? activeQueue().active : 0;
      navCount.textContent = n ? String(n) : "";
      navCount.title = M.adm.ok ? "активная очередь сверки и конфликтов (без архива)" : "";
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
    if (e.target.closest("[data-cc-clear]")) { ui.selected = null; renderAll(); return; }
    if (e.target.closest("[data-cc-hero-more]")) { ui.heroAll = !ui.heroAll; renderAll(); return; }
    if (e.target.closest("[data-cc-routes-more]")) { ui.routesAll = !ui.routesAll; renderAll(); return; }
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
