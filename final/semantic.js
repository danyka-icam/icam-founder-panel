// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC UX · Founder Panel · 2026-08-27
//
// Сдвиг задачи: панель перестаёт быть консолью наблюдения и становится
// интерфейсом принятия решений. Технически честные данные у нас уже есть —
// не хватало СМЫСЛА: человек видел next_move, ball_owner, degraded и сырой
// текст Стюарда вместо ответа на вопрос «что происходит и что делать».
//
// Нового источника истины не появляется: всё те же GET-проекции.
// Единственное локальное хранение — снимок «что вы видели в прошлый заход»
// в localStorage. Это не истина о системе, а отметка вашего последнего
// взгляда, нужная чтобы показать «было → стало». Она живёт только в вашем
// браузере и на систему не влияет.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";
  var API = "/founder-ui-preview/api";
  function get(u){return fetch(u,{credentials:"same-origin"}).then(function(r){
    if(!r.ok)throw new Error("http_"+r.status);return r.json()})}
  function soft(u){return get(u).catch(function(){return null})}
  function esc(s){var d=document.createElement("div");d.textContent=String(s==null?"":s);return d.innerHTML}
  function cut(t,n){t=String(t==null?"":t);return t.length>n?t.slice(0,n-1)+"…":t}
  function screen(){var m=location.pathname.match(/([a-z]+)\.html/);return m?m[1]:"index"}

  // ── СЛОВАРЬ: внутренние термины → человеческий русский ──────────────────
  var RU = {
    next_move:"Следующий ход", next_gate:"Условие перехода", ball_owner:"У кого ход",
    owner:"У кого ход", blocker:"Что мешает", blockers:"Что мешает",
    degraded:"Работает частично", unavailable:"Источник не подключён",
    stale:"Данные устарели", live:"Живо",
    TEST_RESULT:"Результат теста", GATE_RESULT:"Результат проверки этапа",
    STATUS_CHANGE:"Смена статуса", STAGE_CHANGE:"Смена этапа",
    DECISION:"Решение", COMMITMENT:"Обязательство",
    EXTERNAL_EVENT:"Внешнее событие", FOUNDER_ATTENTION:"Требует вас",
    ME:"вы", EXTERNAL:"внешняя сторона", CONDITION:"ждём условия", AGENT:"агент",
    P0:"высший", P1:"высокий", P2:"средний", P3:"низкий",
    // статусы объектов — на витрине по-русски, точный код остаётся в подсказке
    ACTIVE_SERVICE:"работает как служба", ACTIVE_RESEARCH:"идёт исследование",
    ACTIVE_BUILD:"идёт сборка", ACTIVE_PRIORITY:"приоритетное направление",
    ACTIVE_DESIGN:"проектирование", ACTIVE_ENGINEERING:"инженерная работа",
    ACTIVE_IMPLEMENTATION:"внедрение", ACTIVE_INFRASTRUCTURE:"инфраструктура",
    ACTIVE_BRANCH:"активная ветка", PREPARING:"готовится", PARKED:"на паузе",
    REQUESTED:"запрошено", RUNNING:"выполняется", COMPLETED:"завершено",
    BLOCKED:"остановлено", RERUN_REQUIRED:"нужен повтор",
    INVALIDATED:"отбраковано", NEEDS_ADJUDICATION:"ждёт разбора ветки",
    INCONCLUSIVE:"без вывода",
    // типы проверок — списком в исходнике, человеку нужны словами
    IMPLEMENTATION:"реализация", REPLICATION:"воспроизводимость",
    ADVERSARIAL_STRESS:"устойчивость к подлогу", MULTI_CLIENT_EVM:"согласие двух движков",
    DATA_SOURCE_INTEGRITY:"целостность источников", TOOLING:"инструменты",
    ENVIRONMENT_IDENTITY:"тождество среды", METHOD:"метод", DATA:"данные", INFRA:"инфраструктура",
    PRE_IMPLEMENTATION:"до внедрения", LIVE_DISCOVERY_PENDING:"ждём живую разведку"
  };
  function ru(v){ return RU[v] || v; }
  // Машинные значения часто приходят списком («A,B,C») или составными
  // («X / Y»). Переводим каждый кусок и склеиваем по-русски, иначе в витрину
  // лезет строка вида IMPLEMENTATION,REPLICATION,ADVERSARIAL_STRESS.
  function ruList(v){
    if(v==null) return "";
    return String(v).split(/[,/]/).map(function(x){return ru(x.trim())})
      .filter(Boolean).join(" · ");
  }

  function daysSince(iso){ if(!iso)return null;
    var d=Math.floor((Date.now()-new Date(iso).getTime())/86400000); return isNaN(d)?null:d }
  function ago(iso){ var d=daysSince(iso);
    if(d===null)return "неизвестно когда";
    if(d===0)return "сегодня"; if(d===1)return "вчера"; return d+" дн назад" }

  // ── Нормализация текста Стюарда: убрать код из витрины ──────────────────
  // Сырой технический текст остаётся доступен, но в подсказке, а не в карточке.
  function human(text){
    var t=String(text||"").trim();
    if(!t) return "";
    t=t.replace(/\b(PASS|FAIL|OK)\b/g,function(m){
      return {PASS:"пройдено",FAIL:"провал",OK:"в норме"}[m]});
    t=t.replace(/\bnext_move\b/g,"следующий ход").replace(/\bnext_gate\b/g,"условие перехода")
       .replace(/\bball_owner\b/g,"у кого ход").replace(/\bblocker(s)?\b/gi,"что мешает");
    return t;
  }
  // Заголовок из машинного статуса: берём первый сегмент, остальное — в детали
  // Составной машинный статус («ACTIVE_RESEARCH / E1_STRONG… / E1B_READY»)
  // нельзя ставить человеку как заголовок. Берём первый сегмент и переводим;
  // полная строка остаётся в подсказке.
  function statusHead(s){
    var v=String(s||"").split("/")[0].trim();
    return RU[v] || v.replace(/_/g," ").toLowerCase();
  }

  function panelBy(rx){ var f=null;
    document.querySelectorAll(".home-panel,article.card,section.card").forEach(function(p){
      if(!f&&rx.test(p.innerText||""))f=p});
    return f }

  // Порядок аргументов: (панель, заголовок, подзаголовок, содержимое).
  // Первая версия принимала (…, html, badge) — а вызывалась как
  // (…, подпись, строки), из-за чего вся разметка уходила в подзаголовок
  // и печаталась как ТЕКСТ с видимыми тегами. Сигнатура приведена к тому,
  // как её естественно читать на месте вызова.
  function fill(panel,title,subtitle,html){
    if(!panel)return false;
    var head=panel.querySelector(".panel-head");
    if(head&&title){
      var h2=head.querySelector("h2");
      if(h2){ var svg=h2.querySelector("svg"); h2.textContent=""; if(svg)h2.appendChild(svg);
        h2.appendChild(document.createTextNode(title)); }
      var sm=head.querySelector("small"); if(sm&&subtitle)sm.textContent=subtitle;
    }
    [].slice.call(panel.children).forEach(function(ch){
      if(ch===head)return; if(ch.tagName==="BUTTON")return;
      if(ch.classList&&(ch.classList.contains("sem-box")||ch.classList.contains("tg-note")))return;
      ch.style.display="none";
    });
    var box=panel.querySelector(":scope > .sem-box");
    if(!box){ box=document.createElement("div"); box.className="sem-box";
      if(head)head.insertAdjacentElement("afterend",box); else panel.appendChild(box); }
    box.innerHTML=html; box.dataset.live="1";
    if(window.TG)TG.live(box);
    return true;
  }

  // ── Снимок прошлого захода (только в вашем браузере) ────────────────────
  function lastSeen(){ try{return JSON.parse(localStorage.getItem("icam_seen")||"{}")}catch(e){return {}} }
  function saveSeen(o){ try{localStorage.setItem("icam_seen",JSON.stringify(o))}catch(e){} }

  // ── HOME ────────────────────────────────────────────────────────────────
  function home(){
    Promise.all([soft(API+"/observer/routes"), soft(API+"/continuity/founder-inbox"),
                 soft(API+"/continuity/objects"), soft(API+"/continuity/blockers"),
                 soft(API+"/testing/summary")]).then(function(r){
      var routes=((r[0]&&r[0].routes)||[]).filter(function(x){
        return ["CLOSED","DONE","ARCHIVED"].indexOf(String(x.status||"").toUpperCase())<0});
      var inbox=r[1]||{}, objs=(r[2]&&r[2].items)||[], bl=((r[3]&&r[3].items)||[])
        .filter(function(b){return !b.is_test && String(b.status).toUpperCase()!=="CLEARED"});
      var tests=r[4]||{};
      var blByObj={}; bl.forEach(function(b){ (blByObj[b.object_id]=blByObj[b.object_id]||[]).push(b) });

      // ── A. СЕЙЧАС: важность, а не давность ──
      // Вес: ход за нами + приоритет + близость к простою + есть чем мешает.
      function weight(x){
        var w=0;
        if(x.ball_owner==="ME")w+=40;
        w+=({P0:30,P1:20,P2:8,P3:2})[x.priority]||0;
        var d=daysSince(x.last_movement_at); if(d!==null)w+=Math.min(d,20);
        if(blByObj[x.source_object_id])w+=15;
        if(x.deadline)w+=10;
        return w;
      }
      var top=routes.slice().sort(function(a,b){return weight(b)-weight(a)}).slice(0,5);
      fill(panelBy(/1\. СЕЙЧАС/),"1. СЕЙЧАС","по важности, а не по дате",
        top.map(function(x){
          var d=daysSince(x.last_movement_at);
          var mine=x.ball_owner==="ME";
          return "<div class='sem-row"+(mine?" mine":"")+"'>"+
            "<div class='sem-main'>"+esc(cut(human(x.next_move||x.title),150))+"</div>"+
            "<div class='sem-sub'>у кого ход: <b>"+esc(ru(x.ball_owner)||"не назначен")+"</b>"+
            " · важность: "+esc(ru(x.priority))+
            (d!==null&&d>=7?" · <b class='sem-warn'>стоит "+d+" дн</b>":d!==null?" · движение "+ago(x.last_movement_at):"")+
            "</div></div>"}).join("")||"<div class='sem-empty'>Активных ходов нет.</div>");

      // ── B. ТРЕБУЕТ МЕНЯ ──
      var nf=inbox.needs_founder||[];
      fill(panelBy(/2\. ТРЕБУЕТ ВНИМАНИЯ|ТРЕБУЕТ МЕНЯ/),"2. ТРЕБУЕТ МЕНЯ","решения, которые можете принять только вы",
        nf.length? nf.map(function(x){
          return "<div class='sem-row'><div class='sem-main'>"+esc(cut(human(x.title),150))+"</div>"+
            "<div class='sem-sub'>объект: "+esc(x.object_id||"—")+" · ждёт "+esc(ago(x.opened_at))+"</div></div>"}).join("")
        : "<div class='sem-ok'>Сейчас решений от вас не требуется.</div>"+
          "<div class='sem-sub' style='margin-top:6px'>Открытые системные вопросы ("+
          esc((inbox.summary||{}).system_attention||0)+") — инфраструктурные, разбираются без вас.</div>");

      // ── D. ЗАСТОЙ И РИСКИ (вместо мёртвой демо-панели «Приоритеты RD1») ──
      var stalled=routes.filter(function(x){var d=daysSince(x.last_movement_at);return d!==null&&d>=7})
        .sort(function(a,b){return daysSince(b.last_movement_at)-daysSince(a.last_movement_at)});
      var badTests=(tests.active||[]).concat(tests.recent||[])
        .filter(function(t){return ["RERUN_REQUIRED","BLOCKED","INVALIDATED"].indexOf(t.status)>=0});
      var rows=stalled.slice(0,4).map(function(x){
        return "<div class='sem-row'><div class='sem-main'>"+esc(cut(human(x.next_move||x.title),110))+"</div>"+
          "<div class='sem-sub'><b class='sem-warn'>стоит "+daysSince(x.last_movement_at)+" дн</b>"+
          " · у кого ход: "+esc(ru(x.ball_owner)||"не назначен")+"</div></div>"});
      if(badTests.length) rows.push("<div class='sem-row'><div class='sem-main'>Тесты требуют вмешательства: "+
        badTests.map(function(t){return esc(t.test_id)}).join(", ")+"</div>"+
        "<div class='sem-sub'>подробности — на экране «Тестирование»</div></div>");
      if(bl.length) rows.push("<div class='sem-row'><div class='sem-main'>Открытых препятствий по контурам: "+bl.length+
        "</div><div class='sem-sub'>больше всего: "+
        esc(Object.keys(blByObj).sort(function(a,b){return blByObj[b].length-blByObj[a].length})
          .slice(0,3).map(function(k){return k+" ("+blByObj[k].length+")"}).join(", "))+"</div></div>");
      fill(panelBy(/ПРИОРИТЕТЫ RD1|ЗАСТОЙ/),"3. ЗАСТОЙ И РИСКИ",
        stalled.length+" из "+routes.length+" ходов без движения неделю и дольше",
        rows.join("")||"<div class='sem-ok'>Застоявшихся ходов нет.</div>");

      // ── C. ЧТО ИЗМЕНИЛОСЬ — состояние, а не лента событий ──
      var seen=lastSeen(), nowSeen={}, diffs=[];
      objs.forEach(function(o){
        var key=o.object_id, cur=o.declared_status;
        nowSeen[key]={status:cur,at:o.last_event_at};
        var prev=seen[key];
        var d={obj:key,name:o.name,to:cur,when:o.last_event_at,why:human(o.last_summary||""),
               kind:ru(o.last_meaning_kind)};
        if(prev&&prev.status&&prev.status!==cur) d.from=prev.status;
        diffs.push(d);
      });
      var material=diffs.filter(function(d){return d.why||d.from})
        .sort(function(a,b){return String(b.when||"").localeCompare(String(a.when||""))});
      fill(panelBy(/4\. ЧТО ИЗМЕНИЛОСЬ/),"4. ЧТО ИЗМЕНИЛОСЬ","состояние объектов, шум свёрнут",
        material.slice(0,4).map(function(d){
          var head = d.from
            ? "<span class='sem-was'>"+esc(statusHead(d.from))+"</span> → <b>"+esc(statusHead(d.to))+"</b>"
            : "стало: <b>"+esc(statusHead(d.to))+"</b>";
          return "<div class='sem-row'><div class='sem-main' title='"+esc(d.to)+"'>"+esc(d.name||d.obj)+" — "+head+"</div>"+
            (d.why?"<div class='sem-sub' title='"+esc(d.why)+"'>почему: "+esc(cut(d.why,120))+"</div>":"")+
            "<div class='sem-sub'>"+esc(ago(d.when))+(d.from?"":" · прежнее значение система не хранит")+"</div>"+
            "</div>"}).join("")||"<div class='sem-empty'>Изменений не зафиксировано.</div>");
      saveSeen(nowSeen);

      // ── E. СЛЕДУЮЩИЕ ХОДЫ (вместо демо-«Радара») ──
      var mine=routes.filter(function(x){return x.ball_owner==="ME"})
        .sort(function(a,b){return weight(b)-weight(a)}).slice(0,5);
      fill(panelBy(/5\. РАДАР|СЛЕДУЮЩИЕ ХОДЫ/),"5. СЛЕДУЮЩИЕ ХОДЫ",
        "ход за вами: "+routes.filter(function(x){return x.ball_owner==="ME"}).length+" из "+routes.length,
        mine.map(function(x){
          return "<div class='sem-row mine'><div class='sem-main'>"+esc(cut(human(x.next_move||x.title),130))+"</div>"+
            "<div class='sem-sub'>ожидаемый результат: "+
            esc(cut(human(x.desired_outcome||x.done_condition||"не задан"),90))+"</div></div>"}).join("")
          ||"<div class='sem-ok'>Ходов за вами нет.</div>");
    });
  }


  // ── BRAZILPORTAL ────────────────────────────────────────────────────────
  function brazilportal(){
    Promise.all([soft(API+"/continuity/capsule/FND-007"), soft(API+"/continuity/blockers"),
                 soft(API+"/continuity/state/FND-007")]).then(function(r){
      var cap=r[0]; if(!cap)return;
      var o=cap.object||{}, m=o.metadata||{};
      var bl=((r[1]&&r[1].items)||[]).filter(function(b){
        return b.object_id==="FND-007"&&String(b.status).toUpperCase()!=="CLEARED"&&!b.is_test});
      var st=((r[2]&&r[2].projected_fields)||[]);
      function field(n){var f=st.filter(function(x){return x.field_name===n})[0];return f||null}
      var stage=field("stage"), fresh=(cap.recent_meaningful_events||[])[0];
      var lastResult=(cap.recent_meaningful_events||[]).filter(function(e){
        return ["DECISION","GATE_RESULT","STATUS_CHANGE"].indexOf(e.meaning_kind)>=0})[0];

      fill(panelBy(/Операционный цикл|ЖИВОЙ СЛОЙ|Attribution/i),"ЧТО СЕЙЧАС ПРОИСХОДИТ",
        "контур BrazilPortal · "+ago(fresh&&fresh.assessed_at),
        "<div class='sem-row'><div class='sem-main' title='"+esc(o.declared_status)+"'>"+
          esc(statusHead(o.declared_status))+"</div>"+
          "<div class='sem-sub'>этап: "+esc(stage?cut(ruList(stage.value_json),80):"не задан")+"</div></div>"+
        (lastResult?"<div class='sem-row'><div class='sem-main'>Последний подтверждённый результат</div>"+
          "<div class='sem-sub'>"+esc(cut(human(lastResult.summary),150))+" · "+esc(ago(lastResult.assessed_at))+
          "</div></div>":"")+
        "<div class='sem-row'><div class='sem-main'>Следующий ход</div>"+
          "<div class='sem-sub'>"+esc(cut(human(m.next_move),150))+"</div>"+
          "<div class='sem-sub'>у кого ход: <b>"+esc(cut(m.ball_owner||"не назначен",70))+"</b>"+
          " · условие перехода: "+esc(cut(human(m.next_gate),70))+"</div></div>"+
        (bl.length?"<div class='sem-row'><div class='sem-main sem-warn'>Что мешает ("+bl.length+")</div>"+
          bl.slice(0,3).map(function(b){return "<div class='sem-sub'>• "+esc(cut(human(b.title),120))+"</div>"}).join("")+
          "</div>":"<div class='sem-ok'>Препятствий не зафиксировано.</div>"));

      // воронку не рисуем — источника нет
      ["Radar","Funnel Router","Content Factory"].forEach(function(lbl){
        document.querySelectorAll("article.card").forEach(function(c){
          var sm=c.querySelector("small");
          if(sm&&sm.textContent.trim()===lbl){
            var v=c.querySelector("strong"), e=c.querySelector("em");
            if(v)v.textContent="—"; if(e)e.textContent="метрики пока не подключены";
            c.dataset.sem="collapsed";
          }});
      });
    });
  }

  // ── REGISTRY ────────────────────────────────────────────────────────────
  function registry(){
    Promise.all([soft(API+"/continuity/objects"), soft(API+"/continuity/blockers"),
                 soft(API+"/continuity/founder-inbox")]).then(function(r){
      var objs=(r[0]&&r[0].items)||[];
      var bl=((r[1]&&r[1].items)||[]).filter(function(b){
        return !b.is_test&&String(b.status).toUpperCase()!=="CLEARED"});
      var inbox=r[2]||{};
      var noEvents=objs.filter(function(o){return !o.last_event_at});
      var needOwner=objs.filter(function(o){return o.needs_nika});
      var recent=objs.filter(function(o){return o.last_event_at})
        .sort(function(a,b){return String(b.last_event_at).localeCompare(String(a.last_event_at))}).slice(0,3);
      var byObj={}; bl.forEach(function(b){(byObj[b.object_id]=byObj[b.object_id]||[]).push(b)});

      // «+12 за неделю» рядом с живым числом объектов — вшитая цифра без
      // источника. Она ехала на легитимности соседнего живого значения:
      // ровно тот случай, когда одна правдивая цифра прикрывает одну ложную.
      document.querySelectorAll("article.card").forEach(function(c){
        var sm=c.querySelector("small");
        if(sm&&/Объекты/.test(sm.textContent||"")){
          // «+12 за неделю ↗» может лежать в em, span или b — ищем по смыслу,
          // а не по тегу: прошлая правка промахнулась именно по тегу.
          c.querySelectorAll("*").forEach(function(x){
            if(x.children.length)return;
            if(/[+\-]\s*\d+\s*за неделю|за неделю ↗/.test(x.textContent||""))
              x.textContent="динамика не измеряется";
          });
          var spark=c.querySelector("svg:not(:first-child), .spark, canvas");
          if(spark)spark.style.display="none";
        }});

      fill(panelBy(/ОБЪЕКТЫ РЕЕСТРА|КАРТОЧКА ОБЪЕКТА|ПРОВЕРКА ЦЕЛОСТНОСТИ/i),
        "ЧТО В РЕЕСТРЕ СЕЙЧАС", objs.length+" объектов · канонический источник",
        "<div class='sem-row'><div class='sem-main'>Последние изменения</div>"+
          recent.map(function(o){return "<div class='sem-sub'>• "+esc(o.name||o.object_id)+" — "+
            esc(statusHead(o.declared_status))+" · "+esc(ago(o.last_event_at))+"</div>"}).join("")+"</div>"+
        "<div class='sem-row'><div class='sem-main'>Личность не подтверждена: "+noEvents.length+"</div>"+
          "<div class='sem-sub'>"+(noEvents.length?esc(noEvents.map(function(o){return o.object_id}).join(", "))+
            " — ни одного проецированного события":"все объекты подтверждены событиями")+"</div></div>"+
        "<div class='sem-row'><div class='sem-main'>Требуют решения владельца: "+needOwner.length+"</div>"+
          "<div class='sem-sub'>"+(needOwner.length?esc(needOwner.map(function(o){return o.object_id}).join(", ")):
            "таких объектов нет")+"</div></div>"+
        "<div class='sem-row'><div class='sem-main sem-warn'>Объекты с препятствиями</div>"+
          Object.keys(byObj).sort(function(a,b){return byObj[b].length-byObj[a].length}).slice(0,4)
            .map(function(k){return "<div class='sem-sub'>• "+esc(k)+" — "+byObj[k].length+
              ": "+esc(cut(human(byObj[k][0].title),90))+"</div>"}).join("")+"</div>"+
        "<div class='sem-sub' style='margin-top:6px'>Связи между объектами Continuity сейчас не отдаёт — "+
        "карту связей не рисуем.</div>");
    });
  }

  // ── DOCUMENTS ───────────────────────────────────────────────────────────
  function documents(){
    soft(API+"/hub/sync-health").then(function(h){
      if(!h)return;
      var q=h.review_queue||{};
      var WHY={CANONICAL_REVIEW:"заявлен как канонический — нужен человек",
               UNKNOWN:"не удалось определить тип",
               OPERATIONAL_EVIDENCE:"рабочий след, решения не требует",
               WORKING_REFERENCE:"справочный материал"};
      var rows=(q.oldest_5||[]).map(function(x){
        var age=Math.round((Date.now()-new Date(x.received_at).getTime())/3600000);
        return "<div class='sem-row'><div class='sem-main' title='"+esc(x.sha256||"")+"'>"+
          esc(cut(x.packet_file||"(событие без файла)",70))+"</div>"+
          "<div class='sem-sub'>почему нужен разбор: "+esc(WHY[x.artifact_class]||x.artifact_class||"не определено")+
          (x.classification_reason?" · "+esc(cut(x.classification_reason,70)):"")+"</div>"+
          "<div class='sem-sub'>ждёт <b class='sem-warn'>"+age+" ч</b> · откуда: "+
          esc(x.claimed_object_id==="UNRESOLVED"?"объект не указан":x.claimed_object_id||"—")+"</div></div>"});
      fill(panelBy(/ОЧЕРЕДЬ ДОКУМЕНТОВ|ЖИЗНЕННЫЙ ЦИКЛ/i),
        "ЧТО ТРЕБУЕТ РАЗБОРА СЕЙЧАС",
        q.manual_review_required+" из "+q.total+" · самый старый ждёт "+
          Math.round((q.oldest_manual_review_minutes||0)/60)+" ч",
        rows.join("")||"<div class='sem-ok'>Ручной разбор не требуется.</div>");
      // вторичные счётчики
      ["Documents","Связность"].forEach(function(lbl){
        document.querySelectorAll("article.card").forEach(function(c){
          var sm=c.querySelector("small");
          if(sm&&sm.textContent.trim().indexOf(lbl)===0) c.style.order="9";});
      });
    });
  }

  // ── TESTING ─────────────────────────────────────────────────────────────
  function testing(){
    soft(API+"/testing/tests").then(function(d){
      var t=(d&&d.tests)||[]; if(!t.length)return;
      var KIND={IMPLEMENTATION:"проверка реализации",METHOD:"проверка метода",
                DATA:"проверка данных",INFRA:"проверка инфраструктуры"};
      // тип проблемы выводим из процедурного статуса, а не выдумываем
      var PROB={TOOLING_FAILURE:"инструмент",PROTOCOL_AMBIGUITY:"метод",
                INPUT_FAILURE:"данные",EXECUTION_FAILURE:"инфраструктура",
                PROCEDURE_FAIL:"метод",PROCEDURE_PASS:null};
      var open=t.filter(function(x){return ["COMPLETED"].indexOf(x.status)<0});
      var rows=(open.length?open:t).slice(0,5).map(function(x){
        var prob=PROB[x.procedure_status];
        var broke = x.blocker ? human(x.blocker)
                  : (x.scientific_outcome&&/INCONCLUSIVE|REPAIR/.test(x.scientific_outcome)
                     ? human(x.scientific_outcome) : null);
        return "<div class='sem-row"+(prob?" mine":"")+"'>"+
          "<div class='sem-main' title='"+esc(x.test_id)+"'>"+esc(cut(x.owning_branch||x.test_id,70))+"</div>"+
          "<div class='sem-sub'>что проверяем: "+esc(ruList(x.test_type)||"не указано")+
          " · состояние: <b>"+esc(ru(x.status)||statusHead(x.status))+"</b></div>"+
          (broke?"<div class='sem-sub sem-warn'>что не сработало: "+esc(cut(broke,110))+"</div>":"")+
          (prob?"<div class='sem-sub'>тип проблемы: <b>"+esc(prob)+"</b> · реагирует: "+
            esc(x.owning_branch||"владеющая ветка")+"</div>":"")+
          "</div>"});
      fill(panelBy(/Очередь тестов|ОЧЕРЕДЬ ТЕСТОВ/i),"ЧТО СЕЙЧАС ПРОВЕРЯЕТСЯ",
        open.length+" в работе из "+t.length+" · подробности прогонов — ниже",
        rows.join(""));
    });
  }

  // Большие декоративные блоки без источника: по спецификации их надо либо
  // схлопнуть, либо заменить компактной строкой. Не удаляю разметку — сжимаю
  // до одной честной строки, чтобы не занимали экран.
  function collapseDecor(){
    [".growth-card",".brazil-card",".brazil-visual-panel"].forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){
        if(el.dataset.collapsed)return; el.dataset.collapsed="1";
        [].slice.call(el.children).forEach(function(ch){
          if(ch.classList&&ch.classList.contains("panel-head"))return;
          ch.style.display="none"});
        var n=document.createElement("div");
        n.className="sem-empty"; n.style.padding="8px 12px";
        n.textContent="Источник пока не подключён — блок свёрнут.";
        el.appendChild(n);
        el.style.minHeight="0"; el.style.height="auto";
      });
    });
  }

  var RUN={index:home, brazilportal:brazilportal, registry:registry,
           documents:documents, testing:testing};
  function boot(){var f=RUN[screen()];if(f)setTimeout(f,900);setTimeout(collapseDecor,1500)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
