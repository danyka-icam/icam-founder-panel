// ─────────────────────────────────────────────────────────────────────────────
// ПРОКРУТКА И ПУСТЫЕ БЛОКИ · 2026-08-27
// Два дефекта, которые видно только глазами, а не замером шрифтов:
//   1) содержимое панелей обрезалось по нижнему краю без всякой прокрутки —
//      было видно, что текст продолжается, но добраться до него нельзя;
//   2) таблицы срезались по правому краю: последняя колонка уходила под
//      границу карточки.
// Ставится значениями элемента по той же причине, что и строй карточек:
// таблицы стилей панели перекрывают друг друга, и правило молча терялось.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";
  function set(el, o) { for (var k in o) el.style.setProperty(k, o[k], "important"); }

  function fix() {
    // 1. Обрезанное содержимое получает вертикальную прокрутку.
    document.querySelectorAll("article.card, section.card").forEach(function (c) {
      if (c.scrollHeight - c.clientHeight > 6) {
        set(c, { "overflow-y": "auto", "overscroll-behavior": "contain" });
      }
      // Внутренний блок панели тоже может быть обрезан своим max-height.
      c.querySelectorAll(":scope > div, :scope > ul, :scope > table").forEach(function (d) {
        if (d.scrollHeight - d.clientHeight > 6 &&
            getComputedStyle(d).overflowY === "hidden") {
          set(d, { "overflow-y": "auto" });
        }
      });
    });

    // 2. Таблицы листаются вбок целиком, а не обрезаются по последней колонке.
    document.querySelectorAll(
      ".research-table, .doc-table, .lin-tbl, .queue-table, .attr-table, .reg-table"
    ).forEach(function (t) {
      if (t.scrollWidth - t.clientWidth > 4) set(t, { "overflow-x": "auto" });
    });

    // Здесь стояло сжатие панели без источника «по содержимому»
    // (min-height:0; height:auto; align-self:start). Оно и разъезжало ряды:
    // окно без данных становилось НИЖЕ соседей, под ним оставалась дыра, а
    // порог по длине текста срабатывал через раз -- в одном ряду два окна
    // сжимались, третье оставалось во всю высоту. Окно в ряду должно быть
    // одной высоты с соседями, даже когда сказать ему нечего.
  }

  function boot() { fix(); [3000, 7000, 13000].forEach(function (t) { setTimeout(fix, t); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

// ─────────────────────────────────────────────────────────────────────────────
// ТАБЛИЦЫ · дополнение того же дня
// Ячейки листались каждая по себе, поэтому строка обрывалась на полуслове и
// колонки разъезжались. Правильнее листать таблицу целиком: колонки остаются
// в одном строю, а длинная строка доезжает до конца одним движением вбок.
// Плюс высота панели округляется по целым строкам — половина строки у нижнего
// края читается как поломка, хотя это просто обрез.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";
  function set(el, o) { for (var k in o) el.style.setProperty(k, o[k], "important"); }

  function tables() {
    var groups = {};
    document.querySelectorAll(".r-row, .a-row, .r-head, .a-head, .queue-row, .queue-head")
      .forEach(function (row) {
        var p = row.parentElement; if (!p) return;
        var id = p.__tblId || (p.__tblId = "t" + Math.random().toString(36).slice(2));
        (groups[id] = groups[id] || { box: p, rows: [] }).rows.push(row);
      });

    Object.keys(groups).forEach(function (id) {
      var g = groups[id], need = 0;
      g.rows.forEach(function (row) {
        var w = 0;
        for (var i = 0; i < row.children.length; i++) {
          var ch = row.children[i];
          // естественная ширина содержимого, а не обрезанная
          w += Math.max(ch.scrollWidth, ch.getBoundingClientRect().width) + 14;
          set(ch, { "overflow-x": "visible", "overflow-y": "visible" });
        }
        if (w > need) need = w;
      });
      if (!need) return;
      var avail = g.box.clientWidth;
      set(g.box, { "overflow-x": "auto", "overscroll-behavior-x": "contain" });
      if (need > avail) {
        g.rows.forEach(function (row) { set(row, { "min-width": Math.ceil(need) + "px" }); });
      }
      // Округление высоты по целым строкам здесь было и оказалось вредным:
      // на «Текущей очереди» оно схлопнуло таблицу почти в ноль. Половина
      // строки у нижнего края — мелкий изъян, съеденная таблица — поломка.
    });
  }

  function boot() { tables(); [3200, 7200, 13200].forEach(function (t) { setTimeout(tables, t); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
