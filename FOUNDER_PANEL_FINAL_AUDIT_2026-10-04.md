# Founder Panel v2 — финальная ревизия состояния

Date: 2026-10-04
Scope: live Founder Panel, upstream read sources, temporal coverage and projection boundaries.

## Итог

Founder Panel больше не имеет известных архитектурных заглушек по Agent Registry / Lineage и ATLAS State: Gate 1 и Gate 2 сняты, оба источника live и читаются через approved same-origin read-only projections.

Финальная ревизия не переводит все экраны в зелёный искусственно. Оставшиеся DEGRADED / STALE / UNKNOWN разделены на реальные upstream-состояния и технические дефекты. Технические дефекты, обнаруженные в ходе ревизии, исправлены; реальные upstream-состояния сохранены буквально.

## 1. LIVE / READY

### Agent Registry / Lineage
- Registry LIVE, revision 42, 36 verified agents.
- Lineage LIVE, revision 43. Current snapshot exposes 39 active VERIFIED edges; authority history contains 41 distinct verified edge identities, of which 2 were later retracted.
- `lineage_gaps=0`, `authority_conflicts=0`, `unregistered_agents=0`; отсутствие gap здесь является source-backed состоянием, а не выводом UI.
- Browser читает только same-origin Founder projections.

### ATLAS State
- Canonical authority: `aiclavis-atlas-state` / `ATLAS_STATE_CANON_V1`.
- Contract: `aiclavis.atlas-state.v1` v1.0.0.
- Operating mode: `PARTIAL_DECLARED_STATE`.
- Founder projection: `FOUNDER_READ_ONLY_SANITIZED_V1`.
- Internal service coordinates and evidence URLs не попадают в browser payload.
- Commercial и freeze domains остаются UNKNOWN там, где canonical source не объявлен.

### Foundation
- Current aggregate: READY / FRESH.
- Mandatory dimensions PASS: Continuity source health, artifact durability/readback, Founder authority action path, Testing execution integrity.
- Production orphan receipts: 0.
- Hash mismatches: 0.
- Missing artifacts: 0.
- Hub coverage: FULL_END_TO_END.

## 2. Исправленные технические дефекты

### Foundation → Hub credential drift
`context-steward-face` использовал старый Hub READ credential после ротации. Старый token возвращал 401, поэтому Foundation ошибочно показывала artifact durability как UNAVAILABLE.

Исправление:
- inline Hub token удалён из unit;
- сервис переведён на systemd `LoadCredential` от canonical root-owned token file;
- Face читает credential через `CREDENTIALS_DIRECTORY`;
- browser boundary не изменена.

### Историческая self-test receipt
В Hub существовала одна STORED receipt без объекта на диске. Точное доказательное событие показало, что это служебный `KLIM_RULE_SELFTEST`, который был явно REJECTED и удалён как test artifact, `scientific_promotion=false`.

Исправление не переписывает историю:
- исходная STORED receipt сохранена;
- добавлен append-only durability exclusion по точному SHA;
- exclusion class: `VERIFIED_TEST_ARTIFACT_REMOVAL`;
- scope ограничен `PRODUCTION_DURABILITY_ORPHAN_METRIC_ONLY`;
- production `orphan_receipts=0`;
- `excluded_test_orphan_receipts=1` остаётся видимым отдельно.

### Hub review gap wording
Старая диагностика называла все 1302 записи без Reviewer-decision «очередью Reviewer», хотя только 93 действительно требуют ручного разбора.

Текущий источник различает:
- `still_unreviewed=1302`;
- `manual_review_required=93`;
- `non_manual_pending=1209`;
- `unassigned_review_quarantine=93`;
- `actionable_review=0`.

`gaps` теперь сообщает именно реальный ручной долг: 93 записи требуют review и все 93 пока без назначенного review authority.

### Legacy ATLAS route
Старый `/api/panel/atlas` сохранял pre-Gate-2 `NO_ATLAS_STATE_SOURCE` после появления canonical ATLAS State, создавая вторую противоречивую правду.

Он retired: legacy route возвращает HTTP 410 с указанием текущего read-route `/founder-ui-preview/api/atlas-state`. Официальная проекция остаётся HTTP 200 LIVE.


### Signals → Founder Radar cleanup
Founder Radar v0.2 является текущей канонической Founder-facing проекцией страницы «Сигналы» и заменил старую внутреннюю модель Signals-page.

В финальном проходе обнаружены остатки старого browser-renderer:
- `renderSignals(...)` больше не имел DOM-контракта;
- `renderFieldMovement(...)` обращался к удалённым `data-fm=*` hooks;
- старый integrated smoke всё ещё проверял market-card UI и Field Movement axes, которых в текущей Radar surface уже нет.

Исправление:
- legacy renderers удалены из browser client;
- Market Scanner и Field Movement остаются отдельными read sources текущего цикла и видимы в Diagnostics;
- Signals surface проверяется через Founder Radar: field signal → card → inspector → bounded Steward context;
- outage/empty states fail closed;
- Market Scanner ingest/write boundary остаётся закрытой.

Обновлённый integrated smoke: 41/41 PASS.

## 3. Реальные состояния, которые НЕ надо искусственно чинить

### Operations — DEGRADED / STALE
Источник: `continuity_commitments_normalized/read-only-1`.

- последнее движение commitments: 2026-09-26;
- 19 commitment records: 12 OPEN, 7 DONE;
- `factual_result` отсутствует в source contract;
- stale означает отсутствие нового movement именно в Continuity commitments.

Это не доказательство отсутствия работы в компании и не повод подмешивать Activity, Agent Registry или Observer routes. UI прямо сообщает эту границу.

### BrazilPortal — DEGRADED / STALE
Источник: Continuity object `FND-007`; component identity `CMP-000005` хранится отдельно.

- последнее доказанное material/projected movement: 2026-09-07;
- projected `status` имеет `canonical_relation=UNRESOLVED`;
- declared status и projected status намеренно не сливаются;
- factual result не передаётся источником.

Это честный stale/unresolved source state. Панель не выбирает канонический статус самостоятельно.

### Temporal Universe — partial historical coverage
- `coverage_complete=false`;
- missing historical sources: none;
- Research Ledger и Commercial Ledger подключены только prospectively from baseline;
- Activity Inbox принимает новые material branch events;
- прошлое до baseline не реконструируется из snapshot-проекций.

Пустой день означает пробел наблюдаемости, а не доказанное отсутствие работы.

### Hub manual review authority debt
Реальный остаточный долг: 93 manual-review records, все 93 в unassigned review quarantine, actionable review = 0.

Это не transport/durability failure и не blocker Foundation readiness. Это отдельный review-authority debt.

### ATLAS semantic partials
- signal semantic freshness DEGRADED, потому что signal health не сообщает semantic timestamp последнего сигнала;
- commercial canonical state source не объявлен;
- freeze registry canonical source не объявлен.

Эти UNKNOWN/DEGRADED состояния являются частью `PARTIAL_DECLARED_STATE` и не должны заполняться эвристикой.

## 4. Текущие invariants Founder Panel

- browser не является вторым truth store;
- browser не получает internal service coordinates, credentials или canonical write access;
- unknown остаётся unknown;
- stale относится к заявленному source contract, а не автоматически ко всей компании;
- HTTP 200 не считается semantic freshness;
- `closed_at` не считается factual result;
- systemd service не считается agent identity;
- semantic similarity не считается lineage;
- pending investment review не считается committed decision;
- historical artifact receipt не удаляется для улучшения метрики;
- test/self-test exclusion допустим только по точному identity + evidence-backed exclusion contract.

## 5. Оставшийся приоритет после закрытия ревизии

1. Не расширять Founder Panel новыми источниками без конкретного продукта/решения.
2. Закрывать 93 unassigned manual-review authority records отдельным review-ownership проходом, не смешивая его с durability.
3. Разрешать BrazilPortal canonical status только в owning source, не в UI.
4. Возобновлять/обновлять Operations commitments только через их канонический execution source, если этот контур ещё нужен как текущий операционный реестр.
5. Накопить prospective Research/Commercial ledger history; не реконструировать прошлое.
6. Добавить canonical commercial/freeze sources в ATLAS только после реального authority trigger.
