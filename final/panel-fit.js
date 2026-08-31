// ─────────────────────────────────────────────────────────────────────────────
// ПОДГОНКА ЗНАЧЕНИЙ · 2026-08-27
// Одно правило: крупный кегль — только для коротких значений (числа, «LIVE»,
// «OK»). Длинные машинные строки («ACTIVE_SERVICE», «FIRST7_LIMITED_LIVE…»)
// при том же кегле распирали карточку и лезли за границу. Им — своя ступень.
// Это не «подгонка на глаз»: порог считается по длине содержимого, а не по
// тому, как мне показалось на одном экране.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";
  // Перечисление классов уже дважды промахивалось мимо новых имён
  // (ops-kpi, component-*). Берём все значения карточек по признаку, а
  // статус-плашки исключаем — у них своя, мелкая ступень.
  var SEL = 'article.card strong:not(.state):not(.stage):not(.status-pill)' +
            ':not(.evidence):not(.badge)';
  function fit() {
    document.querySelectorAll(SEL).forEach(function (el) {
      var t = (el.textContent || "").trim();
      var long = t.length > 7;
      el.classList.toggle("val-long", long);
      // Размер ставим здесь же, а не в таблице стилей: правила вида
      // `.bp-kpi strong` специфичнее класса, и гонка специфичностей —
      // плохой способ решать «какой кегль у этого значения». Длина
      // содержимого известна ровно в этом месте, тут и решаем.
      el.style.setProperty("font-size", long ? "15px" : "22px", "important");
      el.style.setProperty("line-height", long ? "1.3" : "1.15", "important");
      el.style.setProperty("white-space", long ? "normal" : "nowrap", "important");
      el.title = t;                       // полное значение — в подсказке
    });
  }
  function boot() { fit(); setTimeout(fit, 2500); setTimeout(fit, 6000); setTimeout(fit, 12000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
