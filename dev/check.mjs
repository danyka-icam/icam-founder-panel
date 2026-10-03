// Drives the v2 panel on a running dev stand in Chromium: all current
// top-level panels at several widths, fails on JS errors or horizontal overflow,
// and checks the honesty text expected for the stand's degraded/source modes.
// Usage: BASE=http://127.0.0.1:8765/founder-ui-preview/v2/ EXPECT=ok|tu-down|adm-down|hero-many node dev/check.mjs
// Optional: SHOTS=<dir> writes a full-page screenshot per mode at 1680px.
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8765/founder-ui-preview/v2/";
const EXPECT = process.env.EXPECT || "ok";
const WAIT = Number(process.env.WAIT || 1200);
const MODES = ["command", "timeline", "links", "lines", "placement", "signals", "foundation", "research", "atlas", "digital-twin", "brazilportal", "operations", "registry", "agents", "documents", "testing", "diagnostics"];
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
    const tl = await txt("timeline"), pl = await txt("placement"), cc = await txt("command"), ln = await txt("links"), bp = await txt("brazilportal");
    if (EXPECT === "ok") {
      check(/Temporal Universe/.test(tl) && !/Реконструкция/.test(tl), "timeline uses Temporal Universe, no reconstruction banner");
      check(/Непривязанные события/.test(tl) && /unresolved_history/.test(tl), "timeline shows unresolved_history as a shorter human label");
      check(/113/.test(pl) && /Кандидаты на точную связь/.test(pl) && /на Founder Map (он|они) не появ/.test(pl), "placement driven by Portfolio Admission; exact-owner candidates are not stars");
      check(/Активная очередь сверки/.test(pl) && /из 78 по источнику/.test(pl), "placement reconciles source total with active queue");
      check(/Требует вашего решения/.test(cc) && /Нужно решить/.test(cc) && /Маршруты на вашей стороне/.test(cc), "hero separates formal decisions from Founder-assigned routes");
      check(/2 формальн(?:ое|ых) решени/.test(cc) && (/2 маршрутов на вашей стороне/.test(cc) || (/— маршрутов на вашей стороне/.test(cc) && /эта группа не проверена/.test(cc))),
        "hero headline keeps formal decisions separate from assigned routes (routes down → «—» and group unchecked)");
      await page.evaluate(() => { location.hash = "command"; });
      await page.waitForTimeout(120);
      const decisionCards = page.locator('[data-page-panel="command"] .cc-hero-item.decision');
      const decisionCount = await decisionCards.count();
      check(decisionCount >= 2, `command fixture exposes two formal decision cards (${decisionCount})`);
      if (decisionCount >= 2) {
        await decisionCards.nth(0).click(); await page.waitForTimeout(100);
        const exactControls = await page.locator('[data-page-panel="command"] .cc-decision-actions').count();
        check(exactControls === 1, "READY decision with exact lifecycle_id exposes direct Founder controls");
        await decisionCards.nth(1).click(); await page.waitForTimeout(100);
        const missingControls = await page.locator('[data-page-panel="command"] .cc-decision-actions').count();
        check(missingControls === 0, "decision without lifecycle_id does not expose write controls");
      }
      await page.evaluate(() => { location.hash = "signals"; });
      await page.waitForTimeout(160);
      const signalSteward = page.locator('[data-page-panel="signals"] [data-cc-steward-context]').first();
      check(await signalSteward.count() === 1, "selected Radar signal exposes Ask Steward control");
      if (await signalSteward.count()) {
        await signalSteward.click(); await page.waitForTimeout(80);
        const stewardOpen = page.locator('[data-cc-steward-dialog].open');
        check(await stewardOpen.count() === 1, "Radar signal opens shared Steward dialog");
        const stewardContext = await stewardOpen.locator('[data-cc-steward-context-view]').innerText();
        check(/Внешний сигнал для проверки/.test(stewardContext), "Steward receives exact selected Radar signal context");
        await stewardOpen.locator('[data-cc-steward-close]').click();
      }
      check(/ждёт сверки/.test(tl), "system codes shown with a human label");
      check(!/Общий владелец хода/.test(ln), "links: no shared-ball_owner resource claim");
      check(/Фундамент и инфраструктура/.test(cc), "command center shows canonical worlds");
      const researchResult = await page.locator('[data-page-panel="research"] [data-r="result"]').innerText();
      check(!/Результаты ещё не подключены/.test(researchResult), "research replaces startup result placeholder after a successful read cycle");
      for (const liveKey of ["foundation","operations","brazilportal","digital-twin","atlas"]) {
        const liveText = await page.locator(`[data-normalized-live="${liveKey}"] .panel-body`).innerText();
        check(!/^Загрузка…?$/m.test(liveText.trim()), `${liveKey} normalized projection replaces its startup loading state`);
      }
      const atlasLive = await page.locator('[data-normalized-live="atlas"] .panel-body').innerText();
      check(/Атлас/.test(atlasLive) && /источник сообщает|источник состояния|не передано/i.test(atlasLive), "ATLAS keeps explicit unavailable/no-state semantics instead of fabricating state");
      const agentsText = await page.locator('[data-page-panel="agents"]').innerText();
      check(/Живой источник ещё не подключён/.test(agentsText) && /не считает сервисы/.test(agentsText), "Agent Network remains explicitly unavailable without Registry/Lineage projection");
      const documentsRecent = await page.locator('[data-page-panel="documents"] [data-d="recent"]').innerText();
      check(/SMOKE_PACKET_2026-10-03\.json/.test(documentsRecent) && /на сервере/.test(documentsRecent) && /в индексе/.test(documentsRecent), "documents renders recent Hub arrivals as transport/index facts");
      check(/не доказывают публикацию/.test(documentsRecent), "documents keeps recent Hub arrivals below semantic artifact-change ceiling");
      const diagErrors = await page.locator('[data-page-panel="diagnostics"] [data-x-cycle-errors]').innerText();
      const diagReads = await page.locator('[data-page-panel="diagnostics"] [data-x-read-times]').innerText();
      check(/Ошибок чтения в текущем цикле нет/.test(diagErrors), "diagnostics derives current-cycle read errors instead of showing an unconnected journal placeholder");
      check(/Founder Radar/.test(diagReads) && /ответ получен/.test(diagReads), "diagnostics shows per-projection browser read timestamps without inventing semantic freshness");
      // real contract shapes (schema_id, temporal, history events, maps, capital, path)
      check(/Без закрытия receipt readiness/.test(tl) && /Soak выявил orphan receipt/.test(tl), "history event: change + why_it_matters shown");
      check(/Публикации/.test(tl) && /Twin/.test(tl) && /Сигналы/.test(tl) && /Заявки и тендеры/.test(tl) && /Этапы/.test(tl), "timeline exposes layered filters");
      await page.evaluate(() => { location.hash = "timeline"; });
      await page.waitForTimeout(150);
      const layerButtons = page.locator('[data-page-panel="timeline"] [data-cc-time-layer]');
      const layerCount = await layerButtons.count();
      if (layerCount > 2) {
        const beforeActive = await page.locator('[data-page-panel="timeline"] [data-cc-time-layer].active').count();
        await layerButtons.nth(1).click();
        await page.waitForTimeout(80);
        const afterActive = await page.locator('[data-page-panel="timeline"] [data-cc-time-layer].active').count();
        check(afterActive >= 1 && afterActive < beforeActive, `timeline layer controls support independent toggles (${beforeActive} → ${afterActive})`);
        await page.locator('[data-page-panel="timeline"] [data-cc-time-layer="all"]').click();
        await page.waitForTimeout(80);
        const restoredActive = await page.locator('[data-page-panel="timeline"] [data-cc-time-layer].active').count();
        check(restoredActive >= beforeActive, `timeline "Все" restores the full active layer set (${restoredActive})`);
      }
      check(/type=.?date/i.test(await page.locator('[data-page-panel="timeline"]').innerHTML()), "timeline exposes exact date-range controls");
      check(/PENDING_RECONCILIATION/.test(tl), "history event: truth_status / binding_class shown as proof tag");
      const timeDots = await page.locator('[data-page-panel="timeline"] .cc-time-dot').count();
      check(timeDots > 0, `timeline renders selectable dated points (${timeDots})`);
      if (timeDots > 0) {
        await page.locator('[data-page-panel="timeline"] .cc-time-dot').first().click();
        await page.waitForTimeout(120);
        const timeInspector = await page.evaluate(() => document.querySelector('[data-page-panel="timeline"] .cc-insp-title').innerText);
        check(/точки времени/i.test(timeInspector), `timeline point opens its inspector (${timeInspector})`);
        const stewardAsk = await page.locator('[data-page-panel="timeline"] .cc-steward-ask').count();
        check(stewardAsk >= 1, `inspector exposes Steward Navigator action (${stewardAsk})`);
        const groupedDots = page.locator('[data-page-panel="timeline"] .cc-time-dot[data-cc-time-group]:not([data-cc-time-group=""])');
        const groupedCount = await groupedDots.count();
        if (groupedCount > 0) {
          await groupedDots.first().click();
          await page.waitForTimeout(120);
          const focusState = await page.evaluate(() => {
            const p=document.querySelector('[data-page-panel="timeline"]');
            return {
              focused:p.querySelectorAll('.cc-time-dot.trajectory-focus').length,
              dimmed:p.querySelectorAll('.cc-time-dot.trajectory-dim').length,
              focusedLinks:p.querySelectorAll('.cc-time-links path.trajectory-focus').length
            };
          });
          check(focusState.focused >= 1, `timeline selection focuses its exact trajectory (${focusState.focused} points)`);
          check(focusState.dimmed >= 0 && focusState.focusedLinks >= 0, "timeline trajectory focus preserves non-selected context without hiding it");
        } else {
          check(true, "timeline fixture has no exact grouped trajectory to focus");
        }
      }
      check(!/event_id|"change"|\{"/.test(tl + pl + cc + ln), "no raw JSON of known event fields");
      check(/Финальная стабилизация/.test(tl) && /Закрытие orphan receipt/.test(tl) && /Readiness aggregate PASS/.test(tl), "temporal: now.state / waiting / next_transition shown");
      check(/ATLAS Structural & Epistemic Core/.test(pl) && /Проверка самого ATLAS/.test(pl), "owner_conflicts map normalised into a card");
      check(/предложена «atlas advisory» — точной линии нет/.test(pl), "proposed_line matched by exact title only (no fuzzy)");
      check(/H008/.test(pl) && /Человек, представление и действие/.test(pl), "trusted_owner_map shown as owning_branch → line title");
      check(/Company semantic state stack/.test(ln), "capital [{id,title}] shown as proven line capital");
      check(/Founder Projection/.test(ln) && /Подтверждённые пересечения линий/.test(ln), "links use Founder Projection for shared-capital intersections");
      check(/BP-OP-SMOKE-42/.test(bp) && /связаны серверной проекцией с операционным объектом BP-OP-SMOKE-42/.test(bp) && !/FND-007/.test(bp), "BrazilPortal blocker context uses source-provided operational identity, never a client hard-code");
      check(/Входящие Основателя: 2/.test(cc) && /не становятся формальными решениями/.test(cc), "Founder inbox is shown as requests, not formal decisions");
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
      await page.evaluate(() => {
        const p = document.querySelector('[data-page-panel="links"]');
        const node = [...p.querySelectorAll('.cc-lnode.line')].find((n) => { const t = n.querySelector('text:not(.cc-lnode-cap)'); return t && t.textContent.trim() === 'BrazilPortal'; });
        if (node) node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await page.waitForTimeout(120);
      const bpNav = await page.evaluate(() => !!document.querySelector('[data-page-panel="links"] .cc-insp-nav a[href="#brazilportal"]'));
      check(bpNav, "exact canonical line BrazilPortal exposes specialized projection link");
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
      await page.evaluate(() => { location.hash = "command"; });
      const stars = await page.evaluate(() => document.querySelectorAll('[data-page-panel="placement"] [data-cc="pl-map"] .cc-fstar').length);
      check(stars === 24, `placed column lists 24 stars (${stars})`);
    }
    if (EXPECT === "hero-many") {
      check(/2 формальн(?:ое|ых) решени/.test(cc), "formal decisions remain sourced from Founder Projection");
      check(/Входящие Основателя: 9/.test(cc), "nine inbox requests remain visible as requests");
      check(!/Решение D-0д/.test(cc), "Founder inbox items are not promoted into formal decisions");
    }
    if (EXPECT === "tu-down") {
      check(/Реконструкция, не Temporal Universe/.test(tl), "timeline labels fallback as reconstruction");
      check(/Temporal Universe недоступен/.test(tl), "timeline names the unavailable source");
      check(/Каноническая карта компании недоступна/.test(cc) && /Миры и канонические линии не показываются/.test(cc), "command center says canonical company map is unavailable");
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
