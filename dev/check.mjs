// Drives the v2 panel on a running dev stand in Chromium: every Command Center
// mode at several widths, fails on JS errors or horizontal overflow, and
// checks the honesty text expected for the stand's TU/ADM mode.
// Usage: BASE=http://127.0.0.1:8765/founder-ui-preview/v2/ EXPECT=ok|tu-down|adm-down node dev/check.mjs
// Optional: SHOTS=<dir> writes a full-page screenshot per mode at 1680px.
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8765/founder-ui-preview/v2/";
const EXPECT = process.env.EXPECT || "ok";
const WAIT = Number(process.env.WAIT || 1200);
const MODES = ["command", "timeline", "links", "lines", "placement"];
const WIDTHS = (process.env.WIDTHS || "1680,1280,820,390").split(",").map(Number);
let fails = 0;
const check = (ok, msg) => { console.log(`  [${ok ? "OK  " : "FAIL"}] ${msg}`); if (!ok) fails++; };

const browser = await chromium.launch();
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 1050 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + "#command", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__PANEL_V2_DATA, null, { timeout: 20000 });
  await page.waitForTimeout(WAIT);
  for (const k of MODES) {
    await page.evaluate((k) => { location.hash = k; }, k);
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 0, `${k} @${w}: no horizontal overflow (${over}px)`);
    if (process.env.SHOTS && w === 1680) await page.screenshot({ path: `${process.env.SHOTS}/${EXPECT}-${k}.png`, fullPage: true });
  }
  if (w === WIDTHS[0]) {
    const txt = (k) => page.evaluate((k) => document.querySelector(`[data-page-panel="${k}"]`).innerText, k);
    const tl = await txt("timeline"), pl = await txt("placement"), cc = await txt("command"), ln = await txt("links");
    if (EXPECT === "ok") {
      check(/Temporal Universe/.test(tl) && !/Реконструкция/.test(tl), "timeline uses Temporal Universe, no reconstruction banner");
      check(/Неразрешённая история/.test(tl), "timeline shows unresolved_history");
      check(/113/.test(pl) && /Безопасные кандидаты/.test(pl) && /на Founder Map не видна/.test(pl), "placement driven by Portfolio Admission; candidates not visible on map");
      check(/Активная очередь сверки/.test(pl) && /из 78 по источнику/.test(pl), "placement reconciles source total with active queue");
      check(/Требует вашего участия/.test(cc) && /Нужно решить/.test(cc) && /Ваш ход/.test(cc), "hero split into decisions and moves");
      check(/2 решения · 2 действия/.test(cc) || (/2 решения · — действий/.test(cc) && /Источник маршрутов недоступен — эта группа не проверена/.test(cc)),
        "hero headline split: X решений · Y действий (routes down → «—» and group marked unchecked)");
      check(/ждёт сверки/.test(tl), "system codes shown with a human label");
      check(!/Общий владелец хода/.test(ln), "links: no shared-ball_owner resource claim");
      check(/Фундамент и инфраструктура/.test(cc), "command center shows canonical worlds");
      // real contract shapes (schema_id, temporal, history events, maps, capital, path)
      check(/Без закрытия receipt readiness/.test(tl) && /Soak выявил orphan receipt/.test(tl), "history event: change + why_it_matters shown");
      check(/PENDING_RECONCILIATION/.test(tl), "history event: truth_status / binding_class shown as proof tag");
      check(!/event_id|"change"|\{"/.test(tl + pl + cc + ln), "no raw JSON of known event fields");
      check(/Финальная стабилизация/.test(tl) && /Закрытие orphan receipt/.test(tl) && /Readiness aggregate PASS/.test(tl), "temporal: now.state / waiting / next_transition shown");
      check(/ATLAS Structural & Epistemic Core/.test(pl) && /Проверка самого ATLAS/.test(pl), "owner_conflicts map normalised into a card");
      check(/предложена «atlas advisory» — точной линии нет/.test(pl), "proposed_line matched by exact title only (no fuzzy)");
      check(/H008/.test(pl) && /Человек, представление и действие/.test(pl), "trusted_owner_map shown as owning_branch → line title");
      check(/Company semantic state stack/.test(ln), "capital [{id,title}] shown as proven line capital");
      check(/Founder Projection/.test(ln) && /Подтверждённые пересечения линий/.test(ln), "links use Founder Projection for shared-capital intersections");
      check(/Founder inbox: 2/.test(cc), "Founder inbox is shown as requests, not formal decisions");
      check(/Организационные наблюдения/.test(cc) && /Все наблюдения · 4/.test(cc), "organizational intelligence panel renders all stand signals");
      check(/повторное использование/.test(cc) && /концентрация использования/.test(cc) && /разрыв маршрута/.test(cc) && /шлюз Основателя/.test(cc), "organizational intelligence classes have human labels");
      check(/Система разбирает сама/.test(cc) && /пунктов системной сверки/.test(cc), "system reconciliation is separated from Founder attention");
      check(/по каноническим линиям/.test(cc) && /по капиталу без маршрута/.test(cc) && /требуют вас/.test(cc), "system reconciliation summary keeps path/capital/founder classes apart");
      check(/Публичный запуск/.test(ln) && /Инвестор видит проверяемое состояние/.test(ln), "trajectory path + north_star shown");
      // selection on the links map lights up the path and switches the inspector
      await page.evaluate(() => { location.hash = "links"; });
      await page.waitForTimeout(200);
      await page.click('[data-page-panel="links"] .cc-lnode.star.verified');
      await page.waitForTimeout(150);
      const starSel = await page.evaluate(() => {
        const p = document.querySelector('[data-page-panel="links"]');
        return { has: !!p.querySelector(".cc-layer-svg.has-sel"), label: p.querySelector(".cc-insp-title").innerText, hl: p.querySelectorAll(".cc-lnode.hl").length };
      });
      check(starSel.has && /звезды/i.test(starSel.label) && starSel.hl === 3, `star selection highlights star+line+world and inspector follows (${starSel.label}, hl=${starSel.hl})`);
      await page.click('[data-page-panel="links"] .cc-lnode.line');
      await page.waitForTimeout(150);
      const lineSel = await page.evaluate(() => {
        const p = document.querySelector('[data-page-panel="links"]');
        return { label: p.querySelector(".cc-insp-title").innerText, stars: p.querySelectorAll(".cc-lnode.star.hl").length };
      });
      check(/линии/i.test(lineSel.label) && lineSel.stars >= 1, `line selection highlights its stars (${lineSel.stars})`);
      await page.evaluate(() => { location.hash = "command"; });
      await page.waitForTimeout(150);
      await page.evaluate(() => { const d = document.querySelector("[data-page-panel=\"command\"] .cc-org-details"); if (d) d.open = true; });
      await page.click("[data-page-panel=\"command\"] .cc-org-row");
      await page.waitForTimeout(120);
      const orgLabel = await page.evaluate(() => document.querySelector("[data-page-panel=\"command\"] .cc-insp-title").innerText);
      check(/наблюдения/i.test(orgLabel), `organizational signal opens its inspector (${orgLabel})`);
      await page.evaluate(() => { const d = document.querySelector("[data-page-panel=\"command\"] .cc-system-details"); if (d) d.open = true; });
      await page.click("[data-page-panel=\"command\"] .cc-sys-row");
      await page.waitForTimeout(120);
      const sysLabel = await page.evaluate(() => document.querySelector("[data-page-panel=\"command\"] .cc-insp-title").innerText);
      check(/системной сверки/i.test(sysLabel), `system reconciliation opens its inspector (${sysLabel})`);
      await page.click('[data-page-panel="links"] [data-cc-clear]');
      await page.evaluate(() => { location.hash = "command"; });
      const stars = await page.evaluate(() => document.querySelectorAll('[data-page-panel="placement"] [data-cc="pl-map"] .cc-fstar').length);
      check(stars === 24, `placed column lists 24 stars (${stars})`);
    }
    if (EXPECT === "hero-many") {
      check(/2 решения · 2 действия/.test(cc), "formal decisions remain sourced from Founder Projection");
      check(/Founder inbox: 9/.test(cc), "nine inbox requests remain visible as requests");
      check(!/Решение D-0д/.test(cc), "Founder inbox items are not promoted into formal decisions");
    }
    if (EXPECT === "tu-down") {
      check(/Реконструкция, не Temporal Universe/.test(tl), "timeline labels fallback as reconstruction");
      check(/Temporal Universe недоступен/.test(tl), "timeline names the unavailable source");
      check(/Founder Universe недоступен/.test(cc), "command center says universe unavailable");
    }
    if (EXPECT === "adm-down") {
      check(/Размещение не проверено/.test(pl), "placement says 'не проверено'");
      check(!/Требуют сверки \d/.test(pl) && !pl.includes("review_required"), "placement does not claim review_required");
      check(/Не проверено/.test(cc), "command KPI shows 'Не проверено'");
    }
  }
  check(errors.length === 0, `@${w}: no JS errors ${errors.slice(0, 2).join(" | ")}`);
  await page.close();
}
await browser.close();
console.log(fails ? `FAILED: ${fails}` : "ALL OK");
process.exit(fails ? 1 : 0);
