// TRUTH GUARD (PANEL_BROWSER_G1, 2026-08-27)
// P0-контракт: на финальном UI выдуманные значения запрещены. Если под виджетом
// нет живого источника — он обязан сказать "источник не подключён", а не показать
// правдоподобное число. Этот модуль помечает такие блоки прямо в DOM, чтобы
// нельзя было принять их за живые.
(function(){
  "use strict";
  function mark(el,label){
    if(!el||el.dataset.tg)return; el.dataset.tg='1';
    el.style.position='relative'; el.style.opacity='.42'; el.style.filter='grayscale(1)';
    var b=document.createElement('div');
    b.className='tg-note';               // стиль и расположение — в panel-readability.css
    b.textContent=label||'источник не подключён';
    el.appendChild(b);
  }
  function live(el){ // пометить блок и его карточку-родителя как живые
    while(el){ el.dataset.live='1';
      if(el.matches&&el.matches('article,.card,section')) break;
      el=el.parentElement; }
  }
  window.TG={mark:mark,live:live,
    markAll:function(sel,label){document.querySelectorAll(sel).forEach(function(e){mark(e,label)})}};
})();

// ── Общее правило (P0): карточка с числом, но без привязки к живому источнику,
// не имеет права выглядеть как измерение. Живой считается та, внутри которой
// есть [data-f] — только их заполняет JS из реальных эндпоинтов.
(function(){
  function isNum(t){return /\d/.test(t)}
  function unmarkLive(){
    // Блок мог быть помечен ДО того, как живой модуль его заполнил.
    // Оставить обе метки — значит показать «LIVE» и «источник не подключён»
    // на одном виджете. Снимаем устаревшую.
    document.querySelectorAll('[data-tg]').forEach(function(el){
      if(el.dataset.live!=='1' && !el.querySelector('[data-live="1"]')) return;
      delete el.dataset.tg;
      el.style.opacity=''; el.style.filter='';
      var b=el.querySelector(':scope > div');
      el.querySelectorAll(':scope > .tg-note').forEach(function(d){ d.remove(); });
    });
  }
  function sweep(){
    unmarkLive();
    document.querySelectorAll('article.card,.kpi,.doc-kpi,.research-kpi,.reg-kpi,.card').forEach(function(el){
      if(el.dataset.tg) return;
      if(el.querySelector('[data-f]')) return;          // привязан к источнику — не трогаем
      if(el.dataset.live==='1'||el.querySelector('[data-live="1"]')) return; // заполнен живым модулем
      // Явный список блоков, которые наполняются живыми модулями не через [data-f],
      // а по классам (panel-live пишет в .home-list/.changed-body/.state).
      // Список ведётся руками: эвристика тут ошибалась и глушила настоящие данные.
      if(el.matches('.system-card')) return;
      if(el.classList.contains('home-panel')||el.classList.contains('growth-card')){
        var t=el.innerText||'';
        if(/1\. СЕЙЧАС|ТРЕБУЕТ ВНИМАНИЯ|ИЗМЕНИЛОСЬ|STEWARD/i.test(t)) return;
      }
      if(el.querySelector('.card,article')) return;     // это контейнер, а не карточка
      var t=(el.innerText||'').trim();
      if(t.length<2||!isNum(t)) return;
      window.TG.mark(el,'число без источника');
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sweep);
  else sweep();
  // Живые модули отвечают позже: пересматриваем после них, иначе метка
  // «нет источника» остаётся висеть на уже заполненном блоке.
  setTimeout(sweep,1800); setTimeout(sweep,5000); setTimeout(sweep,9000);
})();
