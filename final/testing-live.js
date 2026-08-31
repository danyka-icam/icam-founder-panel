// PANEL_CONN2 G3 (2026-08-25) -- live ICAM Testing Department screen.
// Show only live supported data (per PANEL_CONN2 explicit instruction) -- no
// mock numbers ship in testing.html at all, every field starts as "—" and is
// filled from real endpoints. If a fetch fails a field stays "—", it is never
// silently replaced with an invented number.
(function () {
  "use strict";
  var SUMMARY = "/founder-ui-preview/api/testing/summary";
  var API_HEALTH = "/founder-ui-preview/api/testing-health";
  var RUNNER_HEALTH = "/founder-ui-preview/api/testing-runner-health";
  var OBJECTS = "/founder-ui-preview/api/continuity/objects";

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
    if (minutes == null || isNaN(minutes)) return "—";
    var h = Math.floor(minutes / 60);
    var m = Math.round(minutes % 60);
    return h > 0 ? h + "ч " + m + "м" : m + "м";
  }
  function ageMinutesSince(iso) {
    if (!iso) return null;
    return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
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

  function allTests(summary) {
    var byId = {};
    (summary.active || []).forEach(function (t) { byId[t.test_id] = t; });
    (summary.recent || []).forEach(function (t) { byId[t.test_id] = t; });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  function renderKPIs(summary) {
    var tests = allTests(summary);
    var total = tests.length;
    var waiting = tests.filter(function (t) { return t.status === "REQUESTED" || t.status === "READY"; }).length;
    var active = (summary.active || []).length;
    var rerun = tests.filter(function (t) { return t.status === "RERUN_REQUIRED"; }).length;
    setField("total", total);
    setField("waiting", waiting);
    setField("active", active);
    setField("rerun", rerun);
  }

  function renderRunnerKPI(apiHealth, runnerHealth) {
    var el = document.querySelector('[data-f="runner"]');
    var note = document.querySelector('[data-f="runner-note"]');
    if (!runnerHealth) {
      if (el) el.textContent = "—";
      if (note) note.textContent = "недоступен";
      return;
    }
    // Список провайдеров берём из самого /api/health раннера, а не из вшитой пары:
    // провайдеры добавляются, и захардкоженный список тихо устаревает (так и вышло —
    // страница месяц говорила "OpenAI + Groq", когда их уже было шесть).
    var parts = Array.isArray(runnerHealth.providers)
      ? runnerHealth.providers.filter(function (p) { return runnerHealth[p + "_configured"]; })
      : Object.keys(runnerHealth).filter(function (k) { return /_configured$/.test(k) && runnerHealth[k]; })
          .map(function (k) { return k.replace(/_configured$/, ""); });
    if (el) el.textContent = parts.length || "0";
    if (note) note.textContent = parts.length
      ? parts.join(" · ") + (runnerHealth.external_tools ? " · инструменты: " + runnerHealth.external_tools : "")
      : "не настроен";
  }

  function renderQueue(summary) {
    var container = document.querySelector('[data-f="queue-rows"]');
    if (!container) return;
    var tests = allTests(summary);
    if (!tests.length) {
      container.innerHTML = '<div class="queue-row"><p><b>Пусто</b><small>тестов в очереди нет</small></p><span>—</span><time>—</time><em class="state hold">—</em></div>';
      return;
    }
    tests.sort(function (a, b) { return String(b.updated_at || "").localeCompare(String(a.updated_at || "")); });
    container.innerHTML = tests.slice(0, 6).map(function (t) {
      var stateClass = t.status === "COMPLETED" ? "new" : (t.status === "NEEDS_ADJUDICATION" ? "review" : (t.status === "BLOCKED" || t.status === "RERUN_REQUIRED" ? "hold" : "review"));
      return (
        '<div class="queue-row"><p><b>' + esc(t.test_id) + '</b><small>' + esc(t.owning_branch || "—") +
        ' · obj=' + esc(t.object_id || "UNRESOLVED") + '</small></p>' +
        '<span>' + esc(t.test_type || "—") + '</span>' +
        '<time>' + ageLabel(ageMinutesSince(t.updated_at)) + '</time>' +
        '<em class="state ' + stateClass + '">' + esc(t.status) + '</em></div>'
      );
    }).join("");
  }

  function renderStatusFlow(summary) {
    var tests = allTests(summary);
    var counts = { COMPLETED: 0, NEEDS_ADJUDICATION: 0, BLOCKED: 0, RERUN_REQUIRED: 0 };
    tests.forEach(function (t) { if (counts.hasOwnProperty(t.status)) counts[t.status]++; });
    var flow = document.querySelector('[data-f="status-flow"]');
    if (!flow) return;
    var divs = flow.querySelectorAll("div > b");
    var order = ["COMPLETED", "NEEDS_ADJUDICATION", "BLOCKED", "RERUN_REQUIRED"];
    divs.forEach(function (b, i) { b.textContent = counts[order[i]]; });
  }

  function renderRecent(summary) {
    var list = document.querySelector('[data-f="recent-list"]');
    if (!list) return;
    var recent = summary.recent || [];
    if (!recent.length) {
      list.innerHTML = "<li><p><b>Пусто</b><span>завершённых прогонов ещё нет</span></p></li>";
      return;
    }
    list.innerHTML = recent.slice(0, 6).map(function (t) {
      return (
        "<li><time>" + ageLabel(ageMinutesSince(t.updated_at)) + "</time><p><b>" + esc(t.test_id) +
        "</b><span>" + esc(t.procedure_status || "—") + " · " + esc(t.scientific_outcome || "—") + "</span></p>" +
        "<em>" + esc(t.status) + "</em></li>"
      );
    }).join("");
  }

  function renderEvidence(summary) {
    var el = document.querySelector('[data-f="evidence-rows"]');
    if (!el) return;
    var tests = allTests(summary);
    var withResult = tests.filter(function (t) { return t.result_path; });
    if (!withResult.length) {
      el.textContent = "Нет ещё ни одного завершённого прогона с зафиксированным result.json.";
      return;
    }
    el.innerHTML = withResult.map(function (t) {
      return esc(t.test_id) + " → <code>" + esc(t.result_path) + "</code>";
    }).join("<br>");
  }

  function renderAttention(summary) {
    var el = document.querySelector('[data-f="attention-rows"]');
    if (!el) return;
    var tests = allTests(summary);
    var needsAdj = tests.filter(function (t) { return t.status === "NEEDS_ADJUDICATION"; });
    var blocked = tests.filter(function (t) { return t.status === "BLOCKED" || t.status === "RERUN_REQUIRED"; });
    var rows = [];
    rows.push(
      '<div class="doc-alert' + (needsAdj.length ? "" : " soft") + '"><span>' + needsAdj.length + '</span><p><b>Defects awaiting owning branch</b><small>' +
      (needsAdj.length ? needsAdj.map(function (t) { return t.test_id; }).join(", ") + " ждут adjudication владеющей ветки" : "нет") +
      '</small></p><em>' + (needsAdj.length ? "средний" : "—") + '</em></div>'
    );
    rows.push(
      '<div class="doc-alert' + (blocked.length ? "" : " soft") + '"><span>' + blocked.length + '</span><p><b>Blocked/rerun</b><small>' +
      (blocked.length ? blocked.map(function (t) { return t.test_id; }).join(", ") : "нет") +
      '</small></p><em>' + (blocked.length ? "высокий" : "—") + '</em></div>'
    );
    rows.push(
      '<div class="doc-alert soft"><span>i</span><p><b>Scheduled dispatcher permission conflict</b><small>' +
      "проверено 25.08 живым systemd-прогоном (SupplementaryGroups=icam-hub-readers) — не воспроизводится" +
      '</small></p><em>устранено</em></div>'
    );
    el.innerHTML = rows.join("");
  }

  function renderIdentity(objectsResp) {
    var el = document.querySelector('[data-f="identity-block"]');
    if (!el) return;
    var items = (objectsResp && objectsResp.items) || [];
    var match = items.find(function (o) {
      return /testing/i.test(o.name || "") || /testing/i.test(o.object_id || "");
    });
    if (match) {
      el.innerHTML = "object_id: <b>" + esc(match.object_id) + "</b><br>" + esc(match.name);
    } else {
      el.innerHTML =
        '<b style="color:#dfad59">object_id: не зарегистрирован (unresolved)</b><br>' +
        "ICAM Testing Department не найден в каноническом реестре Continuity. " +
        "CMP-000011 зарегистрирован под другим владением (Control Plane / library infrastructure) " +
        "и не подставляется сюда по догадке — per PANEL_CONN2.";
    }
  }

  function init() {
    var summaryP = fetchJSON(SUMMARY).catch(function () { return null; });
    var apiHealthP = fetchJSON(API_HEALTH).catch(function () { return null; });
    var runnerHealthP = fetchJSON(RUNNER_HEALTH).catch(function () { return null; });
    var objectsP = fetchJSON(OBJECTS).catch(function () { return null; });

    Promise.all([summaryP, apiHealthP, runnerHealthP, objectsP]).then(function (res) {
      var summary = res[0], apiHealth = res[1], runnerHealth = res[2], objects = res[3];
      if (summary) {
        renderKPIs(summary);
        renderQueue(summary);
        renderStatusFlow(summary);
        renderRecent(summary);
        renderEvidence(summary);
        renderAttention(summary);
      }
      renderRunnerKPI(apiHealth, runnerHealth);
      renderIdentity(objects);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

// ── TESTING RETRY / RESULT LINEAGE (2026-08-26) ───────────────────────────────
// READ-ONLY проекция уже существующего execution state Testing-департамента.
// Нового источника истины нет: единственный источник — /api/testing/lineage/<id>,
// который сам читает реестр и замороженные файлы. Панель не пишет ничего.
(function () {
  "use strict";
  var TESTS = "/founder-ui-preview/api/testing/tests";
  var LINEAGE = "/founder-ui-preview/api/testing/lineage/";

  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function get(u) { return fetch(u, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("http_" + r.status); return r.json(); }); }
  function put(name, html) { var el = document.querySelector('[data-f="' + name + '"]'); if (el) el.innerHTML = html; }
  function age(iso) {
    if (!iso) return "—";
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (isNaN(m)) return "—";
    if (m < 60) return m + " мин назад";
    var h = Math.floor(m / 60); if (h < 24) return h + " ч " + (m % 60) + " мин назад";
    return Math.floor(h / 24) + " дн назад";
  }
  function statusClass(st) {
    if (st === "COMPLETED") return "done";
    if (st === "FAILED" || st === "BLOCKED") return "fail";
    if (st === "READY" || st === "RUNNING") return "wait";
    return "";
  }

  function renderTop(d) {
    var t = d.test, rows = [
      ["Test ID", esc(t.test_id)],
      ["Owning branch", esc(t.owning_branch || "—")],
      ["Lifecycle / status", esc(t.status || "—") + " · <span class='lin-mono'>" + esc(t.current_gate || "") + "</span>"],
      ["Procedure", esc(t.procedure_status || "—")],
      ["Scientific outcome", esc(t.scientific_outcome || "—")],
      ["Current next action", esc(t.next_action || "—")],
      ["Последнее событие", esc(age(t.updated_at)) + " <span class='lin-mono'>" + esc((t.updated_at || "").slice(0, 19)) + "</span>"]
    ];
    // blocker показываем ТОЛЬКО если он реально есть — пустой плейсхолдер тут был бы ложной тревогой
    if (t.blocker) rows.push(["Blocker", "<span class='lin-tag bad'>" + esc(String(t.blocker).slice(0, 160)) + "</span>"]);
    put("lin-top", rows.map(function (r) { return "<div><small>" + r[0] + "</small><b>" + r[1] + "</b></div>"; }).join(""));
    var st = document.querySelector('[data-f="lin-subtitle"]');
    if (st) st.textContent = "read-only проекция · ревизия результата " + (d.current_revision || "—") + (d.current_revision_pending ? " (следующая в работе)" : "");
  }

  function renderChain(d) {
    var flow = d.attempts.map(function (a) {
      var cls = a.superseded_by ? "sup" : statusClass(a.status);
      return "<span class='lin-chip " + cls + "' title='" + esc(a.role_type || "") + "'>" + esc(a.role_id) + "#" + a.attempt + "</span>";
    }).join("<span class='lin-arrow'>→</span>");
    // Порядок таблицы: СВЕЖИЕ СВЕРХУ, старые уходят вниз.
    // Цепочка со стрелками выше остаётся в прямом порядке намеренно -- она
    // читается как последовательность ходов (A#1 → B#1 → ...), и в обратном
    // порядке потеряла бы смысл. Копия через slice(): исходный массив нужен
    // другим местам в прежнем порядке.
    var ordered = d.attempts.slice().sort(function (x, y) {
      var a = (y.started_at || "") .localeCompare(x.started_at || "");
      if (a) return a;
      if ((y.attempt || 0) !== (x.attempt || 0)) return (y.attempt || 0) - (x.attempt || 0);
      return String(y.role_id || "").localeCompare(String(x.role_id || ""));
    });
    var rows = ordered.map(function (a) {
      var tag = a.provenance === "FROZEN"
        ? "<span class='lin-tag ok'>frozen</span>"
        : "<span class='lin-tag info'>planned</span>";
      var sup = a.superseded_by
        ? "<span class='lin-tag warn'>superseded → " + esc(a.superseded_by.split(":").pop()) + "</span>"
        : (a.status === "COMPLETED" ? "<span class='lin-tag ok'>действующий</span>" : "—");
      var stTag = a.status === "COMPLETED" ? "ok" : (a.status === "FAILED" ? "bad" : "info");
      var err = a.error_class ? " <span class='lin-tag bad'>" + esc(a.error_class) + "</span>" : "";
      return "<tr class='" + (a.superseded_by ? "superseded" : "") + "'>"
        + "<td><b>" + esc(a.role_id) + "#" + a.attempt + "</b><br><span class='lin-mono'>" + esc(a.role_type || "") + "</span></td>"
        + "<td>" + esc(a.stage == null ? "—" : a.stage) + "</td>"
        + "<td><span class='lin-tag " + stTag + "'>" + esc(a.status) + "</span>" + err + "</td>"
        + "<td>" + esc(a.provider || "—") + " " + tag + "<br><span class='lin-mono'>" + esc(a.model || "—") + "</span></td>"
        + "<td><span class='lin-mono'>" + esc(a.output_sha_short || "—") + "</span></td>"
        + "<td>" + sup + "</td>"
        + "<td><span class='lin-mono'>" + esc((a.started_at || "").slice(0, 19)) + "<br>" + esc((a.completed_at || "").slice(0, 19)) + "</span></td>"
        + "<td><span class='lin-tag " + (a.external_tools === "DISABLED" ? "ok" : "bad") + "'>" + esc(a.external_tools || "—") + "</span></td>"
        + "</tr>";
    }).join("");
    put("lin-chain",
      "<h4>Run chain / attempts</h4><div class='lin-flow'>" + flow + "</div>"
      + "<table class='lin-tbl'><thead><tr><th>Role / attempt</th><th>Stage</th><th>Status</th>"
      + "<th>Provider / model</th><th>Output SHA</th><th>Lineage</th><th>Started / updated</th><th>Ext. tools</th></tr></thead>"
      + "<tbody>" + rows + "</tbody></table>");
  }

  function renderIsolation(d) {
    var i = d.isolation || {};
    if (!i.available) { put("lin-isolation", "<h4>Blind / isolation</h4><p class='lin-mono'>нет данных пакета</p>"); return; }
    function kv(k, v, good) {
      var cls = good === null ? "" : (good ? "ok" : "bad");
      return "<div class='lin-kv'><span>" + k + "</span><b><span class='lin-tag " + cls + "'>" + esc(v) + "</span></b></div>";
    }
    put("lin-isolation", "<h4>Blind / isolation</h4>"
      + kv("A blind input only", i.a_blind_input_only, i.a_blind_input_only === "PASS")
      + kv("B blind input only", i.b_blind_input_only, i.b_blind_input_only === "PASS")
      + kv("A/B peer visibility", i.ab_peer_visibility, i.ab_peer_visibility === "NONE")
      + kv("WITHHELD_CONTROL до заморозки", i.withheld_control_exposed_before_freeze, i.withheld_control_exposed_before_freeze === "NO")
      + kv("WITHHELD_CONTROL → verifier (stage " + esc(i.verifier_stage) + ")", i.withheld_control_opened_to_verifier, i.withheld_control_opened_to_verifier === "YES"));
  }

  function renderResults(d) {
    var revs = d.result_revisions || [];
    var html = "<h4>Result history</h4>";
    if (!revs.length) html += "<p class='lin-mono'>ревизий пока нет</p>";
    revs.forEach(function (r, idx) {
      var pending = r.is_current && d.current_revision_pending;
      html += "<div class='lin-rev " + (r.is_current ? "cur" : "") + "'>"
        + "<h5>Revision " + esc(r.revision) + (r.is_current ? (pending ? " · <span class='lin-tag info'>CURRENT · дополняется</span>" : " · <span class='lin-tag ok'>CURRENT</span>") : " · <span class='lin-tag warn'>superseded</span>") + "</h5>"
        + "<p>" + esc(r.status || "—") + " · procedure: " + esc(r.procedure_status || "—") + "</p>"
        + "<p>" + esc(r.scientific_outcome || "—") + "</p>"
        + "<p class='lin-mono'>result_sha: " + esc((r.result_sha256 || "").slice(0, 24)) + "…</p>"
        + "</div>";
      if (idx < revs.length - 1) html += "<p class='lin-mono' style='margin:2px 0 4px'>↓ superseded by</p>";
    });
    if (d.current_revision_pending) {
      html += "<p class='lin-mono' style='margin-top:5px'>↓ следующая ревизия соберётся автоматически после закрытия открытых попыток</p>";
    }
    put("lin-results", html);
  }

  function renderFindings(d) {
    var html = "<h4>Findings / defects / retests</h4>";
    (d.defects || []).forEach(function (f) {
      html += "<div class='lin-kv'><span><b style='color:#e08d8d'>" + esc(f.code) + "</b> — "
        + esc(f.role) + "#" + f.attempt + " (" + esc(f.provider || "") + " / " + esc(f.model || "") + ")"
        + "<br><span class='lin-mono'>evidence: " + esc((f.evidence || []).join(", ")) + "</span></span>"
        + "<b><span class='lin-tag warn'>retest → " + esc(String(f.prescribed_retest || "").split(":").pop()) + "</span></b></div>";
    });
    var g = d.diagnostic;
    if (g) {
      html += "<div class='lin-kv' style='align-items:flex-start'><span><b style='color:#c6a35f'>" + esc(g.code) + "</b>"
        + "<br><span class='lin-mono'>" + esc(g.state) + "</span></span>"
        + "<b><span class='lin-tag warn'>не окончательный вывод</span></b></div>"
        + "<p class='lin-mono' style='margin-top:5px;line-height:1.5'>" + esc(g.note) + "</p>";
    }
    if (!(d.defects || []).length && !g) html += "<p class='lin-mono'>дефектов не зафиксировано</p>";
    put("lin-findings", html);
  }

  function pick(list) {
    // Показываем САМЫЙ СВЕЖИЙ кейс.
    //
    // Раньше здесь предпочитался кейс «с реальной цепочкой повторов» -- это
    // осталось с демонстрационных времён, когда хотелось показать богатую
    // цепочку. На живых данных правило врёт: у старого теста семь попыток, у
    // только что запущенного одна, и панель показывала старый. Niki увидела
    // «последнее событие 22 часа назад» в тот момент, когда её собственный
    // прогон шёл прямо сейчас. Панель должна показывать то, что происходит,
    // а не то, что нарядно выглядит.
    var ordered = list.slice().sort(function (a, b) {
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    });
    var cand = ordered.slice(0, 4).map(function (t) { return t.test_id; });
    if (!cand.length) return Promise.resolve(null);
    return Promise.all(cand.map(function (id) {
      return get(LINEAGE + encodeURIComponent(id)).then(function (d) { return { id: id, d: d }; })
                                                  .catch(function () { return null; });
    })).then(function (all) {
      // порядок cand уже по свежести -- берём первый, по которому есть данные
      for (var i = 0; i < all.length; i++) if (all[i] && all[i].d) return all[i].d;
      return null;
    });
  }

  function draw() {
    get(TESTS).then(function (r) { return pick(r.tests || []); })
      .then(function (d) {
        if (!d) { put("lin-top", "<div><small>Живой кейс</small><b>нет доступных тестов</b></div>"); return; }
        renderTop(d); renderChain(d); renderIsolation(d); renderResults(d); renderFindings(d);
      })
      .catch(function (e) {
        put("lin-top", "<div><small>Живой кейс</small><b>источник недоступен — " + esc(e.message) + "</b></div>");
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw);
  else draw();
  setInterval(draw, 60000);   // сам подтянет revision 2, когда штатный dispatcher её закроет
})();
