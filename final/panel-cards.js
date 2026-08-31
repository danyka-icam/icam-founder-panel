// ─────────────────────────────────────────────────────────────────────────────
// ВЕРХНИЕ КАРТОЧКИ · 2026-08-27
// Разметка на всех экранах одинакова: иконка + блок с названием, значением и
// пояснением. Различался только CSS, поэтому иконка прижималась в угол, а
// название висело выше неё.
//
// Почему строй ставится здесь, а не в таблице стилей: пять листов панели
// перекрывают друг друга через !important, и правило, написанное в шестом,
// молча проигрывало правилу из третьего. Это и есть та связь, где «правишь
// одно — тянется другое». Значения элемента таблицами стилей не перебиваются,
// поэтому порядок карточек держится здесь и не зависит от того, какой лист
// загрузился последним.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";
  var ICON = 26;

  function set(el, o) {
    for (var k in o) el.style.setProperty(k, o[k], "important");
  }

  function lay() {
    document.querySelectorAll("article.card").forEach(function (card) {
      var icon = card.querySelector(":scope > [class*='-icon']");
      if (!icon) return;
      // Иконка на части экранов свёрстана <div> и идёт первой — «первый div»
      // брать было нельзя, скрипт принимал её за текстовый блок.
      var box = null, chip = null, i, ch;
      for (i = 0; i < card.children.length; i++) {
        ch = card.children[i];
        if (ch === icon) continue;
        if (!box && ch.tagName === "DIV" && !/-icon/.test(String(ch.className))) box = ch;
        else if (!chip && /chip|state-chip/.test(String(ch.className))) chip = ch;
      }
      if (!box) return;

      // На Главной название карточки — <h3>, а не <small>: искать только
      // <small> значило пропустить весь первый экран.
      var title = card.querySelector(":scope > .kpi-title") ||
                  box.querySelector(":scope > small:first-child") ||
                  box.querySelector(":scope > h3:first-child");
      if (!title) return;
      if (title.parentElement !== card) {
        title.classList.add("kpi-title");
        card.insertBefore(title, box);      // название — сосед иконки, не потомок
      }
      card.classList.add("kpi-laid");

      set(card, {
        display: "grid",
        "grid-template-columns": ICON + "px minmax(0,1fr)",
        "grid-template-areas": '"icon title" "body body" "chip chip"',
        "column-gap": "10px", "row-gap": "7px",
        "align-items": "center",
        padding: "15px 17px",
        "min-width": "0"
      });
      set(icon,  { "grid-area": "icon", margin: "0", "align-self": "center" });
      set(title, { "grid-area": "title", "align-self": "center", margin: "0",
                   display: "block", "white-space": "nowrap",
                   "overflow-x": "auto", "overflow-y": "hidden",
                   "line-height": "1.3", "min-width": "0", "max-width": "100%" });
      set(box,   { "grid-area": "body", display: "flex", "flex-direction": "column",
                   gap: "5px", "min-width": "0", "max-width": "100%", margin: "0" });
      if (chip) set(chip, { "grid-area": "chip", "justify-self": "start", margin: "0" });

      // Значение — одной строкой с прокруткой вбок: перенос длинной машинной
      // строки рассыпал её каскадом по нескольку букв.
      var val = box.querySelector(":scope > strong");
      if (val) set(val, { "white-space": "nowrap", "overflow-x": "auto",
                          "overflow-y": "hidden", "min-width": "0", "max-width": "100%" });
      // Пояснение — обычным переносом по словам.
      box.querySelectorAll(":scope > span, :scope > em").forEach(function (e) {
        set(e, { "white-space": "normal", "overflow-wrap": "break-word",
                 "word-break": "normal", "min-width": "0", "max-width": "100%" });
      });
    });
  }

  function boot() { lay(); [2500, 6000, 12000].forEach(function (t) { setTimeout(lay, t); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
