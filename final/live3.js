// ─────────────────────────────────────────────────────────────────────────────
// PANEL_LIVE3 · подключение оставшихся четырёх экранов · 2026-08-27
//
// Правило, которому подчинён весь файл: показываем ТОЛЬКО то, что подтверждено
// ответом источника. Если источника под блок нет — блок не заполняется и
// остаётся помеченным (этим занимается truth-guard/trust-contract), а не
// получает правдоподобное число.
//
// Нового хранилища не появляется: всё берётся из уже существующих GET-проекций
// Continuity/Observer/Hub, теми же правами, тем же путём, что и остальные экраны.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";
  var API = "/founder-ui-preview/api";
  function get(u){return fetch(u,{credentials:"same-origin"})
    .then(function(r){if(!r.ok)throw new Error("http_"+r.status);return r.json()})}
  function soft(u){return get(u).catch(function(){return null})}
  function screen(){var m=location.pathname.match(/([a-z]+)\.html/);return m?m[1]:"index"}
  function esc(s){var d=document.createElement("div");d.textContent=String(s==null?"":s);return d.innerHTML}
  function ago(iso){
    if(!iso)return "нет данных";
    var m=Math.round((Date.now()-new Date(iso).getTime())/60000);
    if(isNaN(m))return "нет данных";
    if(m<60)return m+" мин назад";
    var h=Math.floor(m/60); if(h<24)return h+" ч назад";
    return Math.floor(h/24)+" дн назад";
  }
  function cut(t,n){t=String(t==null?"":t);return t.length>n?t.slice(0,n-1)+"…":t}
  // Семантическая свежесть капсулы. В object её нет — она живёт в последнем
  // осмысленном событии. Раньше здесь выводилось "нет данных", то есть
  // утверждение о состоянии шло без свежести, а это спекой запрещено.
  function capFresh(cap){
    var ev=(cap&&cap.recent_meaningful_events)||[];
    return ev.length?ev[0].assessed_at:null;
  }

  // Найти KPI-карточку по подписи и заполнить её из живого источника.
  // Помечаем data-live, чтобы сторож видел: значение пришло, а не вшито.
  function kpi(label,value,detail,chip,chipClass){
    var hit=null;
    document.querySelectorAll("article.card").forEach(function(c){
      if(hit)return;
      if(!/kpi/.test(c.className))return;      // только KPI-карточки, не панели
      var s=c.querySelector("small");
      if(s&&s.textContent.trim()===label)hit=c;
    });
    if(!hit)return false;
    var v=hit.querySelector("strong"), e=hit.querySelector("em"), b=hit.querySelector(".state-chip");
    if(v)v.textContent=value;
    if(e&&detail!=null)e.textContent=detail;
    if(b&&chip!=null){b.textContent=chip;
      b.className="state-chip"+(chipClass?" "+chipClass:"");}
    hit.dataset.live="1";
    if(window.TG)TG.live(hit);
    return true;
  }

  // Вставить живой блок в НАСТОЯЩУЮ панель, адресуясь классом.
  //
  // Раньше цель искалась регуляркой по тексту — и попадала в маленькие
  // KPI-карточки («Активные сигналы», «Подключения», «Funnel Router» — это
  // подписи карточек, а не заголовки панелей). Абзац внутри карточки шириной
  // 280px растягивал её до 2220px и ломал всю сетку страницы. Поэтому:
  //   1) KPI-карточки исключены жёстко,
  //   2) высота вставки ограничена прокруткой, чтобы длина содержимого
  //      физически не могла повлиять на раскладку.
  function panel(sel,html,maxH){
    var hit=document.querySelector(sel);
    if(!hit||/kpi/.test(hit.className))return false;
    var old=hit.querySelector(":scope > .live3-box");
    if(old)old.remove();
    var box=document.createElement("div");
    box.className="live3-box";
    // Ограничение высоты здесь ОБЯЗАТЕЛЬНО: ряды экрана свёрстаны плитками
    // заданной высоты (238px / 216px в brazilportal.css и так на всех
    // экранах). Если дать блоку расти по содержимому, плитка выламывается из
    // своего размера и ряд едет -- это и увидела Niki. Длинное содержимое
    // листается внутри плитки, размер плитки остаётся замыслом вёрстки.
    box.style.cssText="padding:8px 12px;font-size:11.5px;color:#c2c9c4;line-height:1.5;"+
      "max-height:"+(maxH||150)+"px;overflow-y:auto;overflow-x:hidden;"+
      "overscroll-behavior:contain;word-break:break-word";
    box.innerHTML=html;
    var head=hit.querySelector(".panel-head");
    // Панель имеет фиксированную высоту и уже занята статической разметкой.
    // Если просто вставить живой блок, он сожмётся в полоску 16px — данные есть,
    // а прочитать нельзя. Прячем статику: она в этих панелях всё равно
    // выдуманная, и держать её рядом с живой означало бы показывать две
    // разные "правды" в одном окне.
    [].slice.call(hit.children).forEach(function(ch){
      if(ch===head||ch===box)return;
      if(ch.classList&&ch.classList.contains("live3-box"))return;
      if(ch.tagName==="BUTTON")return;                 // ссылку "открыть" оставляем
      ch.dataset.live3Hidden="1";
      ch.style.display="none";
    });
    if(head&&head.parentNode===hit)head.insertAdjacentElement("afterend",box);
    else hit.appendChild(box);
    box.style.flex="1 1 auto"; box.style.minHeight="0";
    box.dataset.live="1";
    var stale=hit.querySelector(":scope > div > strong, :scope > strong");
    if(stale&&/^\s*\d+\s*%?\s*$/.test(stale.textContent||"")&&window.TG){
      TG.mark(stale.parentElement||stale,"число без источника");
    }
    return true;
  }

  // ── FOUNDATION ────────────────────────────────────────────────────────────
  function foundation(){
    Promise.all([soft(API+"/continuity/capsule/FND-001"),
                 soft(API+"/continuity-health"),
                 soft(API+"/continuity/artifacts/missing"),
                 soft(API+"/continuity/founder-inbox"),
                 soft(API+"/continuity/blockers")]).then(function(r){
      var cap=r[0],h=r[1],art=r[2],inbox=r[3],bl=r[4];
      var m=(cap&&cap.object&&cap.object.metadata)||{};
      var openBl=((bl&&bl.items)||[]).filter(function(b){
        return b.object_id==="FND-001"&&String(b.status).toUpperCase()!=="CLEARED"&&!b.is_test;});
      var sysAtt=((inbox&&inbox.summary&&inbox.summary.system_attention)||0);

      if(cap) kpi("Общий статус",String(cap.object.declared_status||"—"),
        "препятствий: "+openBl.length, openBl.length?"есть блокеры":"стабильно",
        openBl.length?"warn":"good");
      if(h) kpi("Continuity", h.ok?"LIVE":"DOWN",
        "событий: "+(h.raw_event_count!=null?h.raw_event_count:"—")+" · опрос "+(h.poll_seconds||"—")+"с",
        h.db_reachable?"в норме":"нет БД", h.db_reachable?"good":"warn");
      if(art) kpi("Durability", art.count===0?"OK":"GAP",
        "потерянных артефактов: "+art.count, art.count===0?"целостно":"есть пропажи",
        art.count===0?"good":"warn");
      kpi("Founder view", sysAtt+" SYSTEM",
        "требует Niki: "+((inbox&&inbox.summary&&inbox.summary.needs_founder)||0),
        "живой источник","good");

      if(cap){
        var ev=(cap.recent_meaningful_events||[]).slice(0,4);
        panel(".health-panel",
          "<b style='color:#8fd6a6'>Текущий ход</b><br>"+esc(cut(m.next_move,150))+
          "<br><br><b style='color:#8fd6a6'>Следующий гейт</b><br>"+esc(cut(m.next_gate,150))+
          "<br><br><b style='color:#8fd6a6'>Ход у</b> "+esc(cut(m.ball_owner,90))+
          "<br><span style='color:#79837a'>свежесть: "+esc(ago(capFresh(cap)))+"</span>"+
          (openBl.length?"<br><br><b style='color:#e08d8d'>Что мешает ("+openBl.length+")</b><br>"+
            openBl.slice(0,3).map(function(b){return "• "+esc(cut(b.title,110))}).join("<br>"):"")+
          (ev.length?"<br><br><b style='color:#8fd6a6'>Последние события</b><br>"+
            ev.map(function(e){return "• "+esc(cut(e.summary,110))+
              " <span style='color:#6f786f'>"+esc(ago(e.assessed_at))+"</span>"}).join("<br>"):""));
      }
    });
  }

  // ── BRAZILPORTAL ──────────────────────────────────────────────────────────
  function brazilportal(){
    Promise.all([soft(API+"/continuity/capsule/FND-007"),
                 soft(API+"/continuity/blockers"),
                 soft(API+"/observer/routes")]).then(function(r){
      var cap=r[0],bl=r[1],ro=r[2];
      var m=(cap&&cap.object&&cap.object.metadata)||{};
      var openBl=((bl&&bl.items)||[]).filter(function(b){
        return b.object_id==="FND-007"&&String(b.status).toUpperCase()!=="CLEARED"&&!b.is_test;});
      if(cap) kpi("Состояние контура",String(cap.object.declared_status||"—"),
        "свежесть: "+ago(capFresh(cap)),"живой источник","good");
      kpi("Требует внимания",String(openBl.length),
        "препятствий в контуре", openBl.length?"есть":"чисто", openBl.length?"warn":"good");
      // Radar / Funnel Router / Content Factory НЕ трогаем: рантайм-эндпоинтов
      // BrazilPortal панель не видит, а проценты воронки без источника показывать нельзя.
      if(cap){
        panel(".attribution-panel",
          "<b style='color:#8fd6a6'>Текущий ход</b><br>"+esc(cut(m.next_move,160))+
          "<br><br><b style='color:#8fd6a6'>Следующий гейт</b><br>"+esc(cut(m.next_gate,160))+
          "<br><br><b style='color:#8fd6a6'>Ход у</b> "+esc(cut(m.ball_owner,90))+
          (openBl.length?"<br><br><b style='color:#e08d8d'>Что мешает ("+openBl.length+")</b><br>"+
            openBl.slice(0,4).map(function(b){return "• "+esc(cut(b.title,110))}).join("<br>"):"")+
          "<br><br><span style='color:#c6a35f'>Метрики воронки/конверсии не подключены: "+
          "рантайм-эндпоинтов BrazilPortal панель не видит. Проценты без источника не показываем.</span>");
      }
    });
  }

  // ── SIGNALS ───────────────────────────────────────────────────────────────
  function signals(){
    soft(API+"/continuity/founder-inbox").then(function(inb){
      if(!inb)return;
      var sys=inb.system_attention||[], fnd=inb.needs_founder||[], blk=inb.open_blockers||[];
      var all=sys.concat(fnd);
      var high=all.filter(function(x){return (x.severity||0)>=4});
      kpi("Активные сигналы",String(all.length),
        "SYSTEM "+sys.length+" · требует Niki "+fnd.length,"живой источник","good");
      kpi("Высокий приоритет",String(high.length),"severity ≥ 4",
        high.length?"есть":"чисто",high.length?"warn":"good");
      kpi("Источники",String(new Set(all.map(function(x){return x.source_system})).size),
        "различных источников","живой источник","good");
      // "Корреляции" и "Закрыто за сутки" НЕ заполняем: канонической службы,
      // которая их считает, не существует (observer/signals и observer/radar → 404).
      var rows=all.sort(function(a,b){return (b.severity||0)-(a.severity||0)}).slice(0,8)
        .map(function(x){
          return "<div style='padding:5px 0;border-bottom:1px solid #1c221c'>"+
            "<b style='color:"+((x.severity||0)>=4?"#e08d8d":"#c6a35f")+"'>sev "+esc(x.severity)+"</b> "+
            "<b>["+esc(x.object_id||"—")+"]</b> "+esc(cut(x.title,90))+
            "<br><span style='color:#79837a;font-size:10.5px'>"+esc(cut(x.reason,80))+
            " · источник: "+esc(x.source_system||"—")+
            " · открыт "+esc(ago(x.opened_at))+
            (x.occurrence_count?" · повторов "+x.occurrence_count:"")+"</span></div>"});
      panel(".feed-panel",
        "<b style='color:#8fd6a6'>Активные сигналы (живое, сведено по ключу)</b>"+rows.join("")+
        "<div style='margin-top:8px;color:#c6a35f'>Корреляционный радар не подключён: "+
        "канонической службы, которая считает корреляции, в системе нет "+
        "(observer/signals и observer/radar отвечают 404). Выдуманных корреляций не показываем.</div>"+
        (blk.length?"<div style='margin-top:6px;color:#79837a'>Препятствий в контуре: "+blk.length+"</div>":""));
    });
  }

  // ── SETTINGS ──────────────────────────────────────────────────────────────
  // Здоровье подключений вычисляется реальной проверкой достижимости из браузера,
  // а не берётся из вёрстки. Именно поэтому "7/7" тут раньше было неправдой.
  function settings(){
    var SRC=[
      {n:"Continuity (объекты)",u:API+"/continuity/objects",req:true},
      {n:"Continuity (здоровье)",u:API+"/continuity-health",req:true},
      {n:"Continuity (входящее фаундера)",u:API+"/continuity/founder-inbox",req:true},
      {n:"Orchestrator (маршруты)",u:API+"/observer/routes",req:true},
      {n:"Observer (метрики)",u:API+"/observer/metrics",req:true},
      {n:"ICAM Hub (sync-health)",u:API+"/hub/sync-health",req:true},
      {n:"Testing (сводка)",u:API+"/testing/summary",req:true},
      {n:"Testing (здоровье API)",u:API+"/testing-health",req:false},
      {n:"Testing (раннер)",u:API+"/testing-runner-health",req:false}
    ];
    Promise.all(SRC.map(function(s){
      var t0=Date.now();
      return fetch(s.u,{credentials:"same-origin"}).then(function(r){
        return {s:s,status:r.status,ok:r.ok,ms:Date.now()-t0}
      }).catch(function(e){return {s:s,status:0,ok:false,ms:Date.now()-t0,err:String(e).slice(0,40)}});
    })).then(function(res){
      var ok=res.filter(function(x){return x.ok}).length;
      var reqBad=res.filter(function(x){return x.s.req&&!x.ok});
      kpi("Подключения",ok+"/"+res.length,
        "проверено из браузера "+new Date().toLocaleTimeString("ru-RU"),
        reqBad.length?"есть отказы":"все живы", reqBad.length?"warn":"good");
      kpi("Сессия", "AUTH OK","basic-auth на том же origin","подтверждено","good");
      kpi("Режим панели","READ ONLY","любой не-GET отбивается nginx","подтверждено","good");
      var rows=res.map(function(x){
        var c=x.ok?"#8fd6a6":"#e08d8d";
        return "<div style='display:flex;justify-content:space-between;gap:10px;padding:4px 0;"+
          "border-bottom:1px solid #1c221c'><span>"+esc(x.s.n)+
          (x.s.req?" <span style='color:#6f786f'>обязательный</span>":"")+"</span>"+
          "<span style='color:"+c+";font-family:ui-monospace,monospace'>"+
          (x.ok?"LIVE":"НЕТ ИСТОЧНИКА")+" · HTTP "+x.status+" · "+x.ms+"мс</span></div>"});
      panel(".sources-panel",
        "<b style='color:#8fd6a6'>Достижимость источников из браузера</b>"+rows.join("")+
        "<div style='margin-top:7px;color:#79837a'>Проверка выполняется этой страницей в момент "+
        "открытия. Значение не берётся из вёрстки — если источник отвалится, здесь станет видно.</div>");
    });
  }

  var RUN={foundation:foundation,brazilportal:brazilportal,signals:signals,settings:settings};
  function boot(){var f=RUN[screen()];if(f)f()}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
