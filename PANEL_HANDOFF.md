# ICAM Founder Panel v2 — Public Handoff

Current as of: 2026-09-03

## Repository and branches

- Repository: `github.com/danyka-icam/icam-founder-panel`
- Repository visibility: **public**
- `main` = production
- `panel-v2` = accepted v2 integration candidate
- merge/push to `main` triggers the existing production deploy workflow
- `panel-v2` must not be treated as production before Founder review and merge

Current v2 frontend:
- `v2/index.html`
- `v2/live.js`

Current production/reference material remains under `final/` until the v2 switch is accepted.

## Product boundary

Founder Panel is a Founder-facing **read / decision surface**.

It may:
- render read-only same-origin API projections
- explain unavailable / partial / degraded source states
- expose source ownership and last-read diagnostics
- present Founder-attention items
- display explicit source-provided dependencies and statuses

It must not:
- create a second canonical truth store
- infer canonical relationships from similarity
- turn missing data into zero / PASS / healthy
- widen system authority
- expose credentials or infrastructure secrets
- perform canonical writes without a separately approved authority path

## v2 top-level navigation

Modes (`v2/command-center.js` + `v2/command-center.css`):
1. Командный центр (`#command`, default; `#home` / `#orchestrator` redirect here)
2. Во времени (`#timeline`)
3. Связи и стратегии (`#links`)
4. Линии и объекты (`#lines`)
5. Размещение (`#placement`)
6. Сигналы (`#signals`)

Contours (unchanged pages): Фундамент, Исследования, Атлас, DT, BrazilPortal,
Операции, Реестр, Документы, Тестирование, Диагностика.

The modes make no requests of their own: `live.js` publishes the payloads of
its read cycle as `window.__PANEL_V2_DATA` and its helpers as
`window.__PANEL_V2_HELPERS`, then fires `panel-v2-live-ready`.

Sources of truth for the modes:
- `GET /founder-star-view/api/temporal-universe` (`atlas-temporal-universe.v0.1`):
  worlds, canonical lines, stars (`branches`), company/line history,
  strategic trajectories, capital, unresolved history. Primary source for
  «Во времени», «Связи и стратегии» and the worlds strip.
- `GET /founder-star-view/api/portfolio-admission` (`atlas-portfolio-admission.v0.1`):
  placed / exact-owner candidates / review / owner conflicts. Primary and only
  source for «Размещение» and the «Требуют сверки» KPI.
- `GET /founder-ui-preview/api/founder-projection` (`founder-projection.v0.1`):
  canonical line state, Founder Decision Presentation, company movements,
  admitted company capital, explicit line intersections through shared admitted
  capital, steward reconciliation and hard rules. Formal Founder decisions are
  sourced only from this projection.
- `GET /founder-ui-preview/api/organizational-intelligence`
  (`organizational-intelligence-projection.v0.1`): structural observations about
  recorded capital reuse/concentration, canonical route gaps and Founder authority
  gates. Each signal keeps its evidence ceiling and falsification condition; the UI
  does not translate these observations into risk or priority.
- `GET /founder-ui-preview/api/steward-reconciliation`
  (`steward-reconciliation-projection.v0.1`): system-only reconciliation queue plus
  Founder gates. The Command Center renders only `system_reconciliation[]` under
  «Система разбирает сама»; Founder gates remain represented by formal Founder
  decisions above. System gaps are never promoted into Founder tasks by the UI.
- Orchestrator routes + Continuity: current movement of work (stage, next move,
  ball owner, blockers, explicit dependencies). Founder inbox remains a request
  queue; its entries are not promoted to formal decisions by the UI.

Temporal Universe, Portfolio Admission and Founder Projection use bounded
read-only client requests. Degradation:
- Temporal Universe down / wrong schema → «Во времени» shows an explicitly
  labelled reconstruction from routes/objects/RD1; worlds and canonical lines
  are not shown anywhere.
- Portfolio Admission down / wrong schema → placement is «не проверено»;
  the panel never computes candidate / review / conflict itself.
- Founder Projection down / wrong schema → formal decisions, canonical line
  states, company movements and shared-capital intersections are not inferred;
  Temporal Universe capital remains a limited display fallback only.
- Organizational Intelligence down / wrong schema → structural observations are
  shown as unavailable; they are not reconstructed from capital or route data.
- Steward Reconciliation down / wrong schema → the system-only queue is shown as
  unavailable; no system gap is inferred from canonical line state.

Contract details the panel relies on (reconciled with the live files):
`schema_id` identifies both payloads; star `temporal` is
`{now.state, waiting[], next_transition[], history[]}`; history events are read
by `change` / `why_it_matters` / `next_milestone` / `date` /
`truth_status` + `binding_class`; `proposed_line` and the values of
`trusted_owner_map` (`owning_branch → line title`) and `owner_conflicts`
(`owning_branch → [line titles]`) are matched to canonical lines by exact title
only; `capital` is `[{id, title}]`; trajectory `path` is a list of stages.

Join rules: a route or Continuity object is tied to a star only when its ID
equals the star's `memory_id`. `owning_branch` is shown as the object's origin,
never as its world. `unresolved_history` is never attached to objects.
`exact_owner_candidates` are not stars and are shown as not visible on the
Founder Map. A shared `ball_owner` is not a resource link. Canonical capital use and line
intersections come from Founder Projection (`company_capital`, `capital_in_use`,
`intersections`). An intersection means shared recorded use of admitted capital;
it does not establish causality, a common mechanism or a direct handoff.

Presentation conventions (UI only, no source semantics):
- Repeated operational action phrases may have an exact Russian UI rendering; the original source text is preserved in tooltip/inspector context and is never rewritten in backend data. Owner codes are rendered as roles (`ME` → «вы», `SYSTEM` → «система», `EXTERNAL` → «внешний владелец`).
- Route tone for Founder attention: «Нужно ваше действие» (ball owner is the
  Founder and the route is not simply flowing) is the only strong accent;
  «Есть блокер», «Ждём внешнего» (external owner — waiting, not risk),
  «Давно без движения» (calm, not alarm), «Нужна сверка» (no movement date —
  evidence uncertainty) and «В движении» are separate calm states. The live.js
  diagnostic risk is unchanged and still shown in the route inspector.
- Source codes (truth_status, binding_class, evidence_status, time_class, kind,
  state, transition) are shown as a Russian label with the original code as a
  small caption / tooltip; the source value itself is never altered.
- One inspector for route, object, world, line, star, event, formal decision,
  company movement, admission item and strategy, always ordered: что это → где в системе → сейчас → почему важно →
  история → ждём → следующий переход → связи → доказательный потолок.
- «Размещение» distinguishes source totals (`counts`) from the active,
  non-archived queue; the nav badge shows the active queue.
- A strategy's position on its `path` is shown only if the source states it.

Local stand: `node dev/stand.mjs` (+ `TU=` / `ADM=` = ok|404|timeout|badschema,
`ROUTES=ok|down`) and `dev/check.mjs` in Chromium; synthetic fixtures live in
`fixtures/founder-universe/` (not deployed).

## Existing safe GET wiring in v2

All paths are same-origin under:

`/founder-ui-preview/api/...`

### Командный центр (was Главная + Оркестратор)
Reads:
- `observer/routes`
- `continuity/founder-inbox` (requests/needs, not formal decisions)
- `founder-projection` (formal Founder decisions, company movement, canonical line state/capital/intersections)
- `testing/summary`

Shows:
- current Orchestrator routes
- Founder-attention count/items
- Testing attention
- explicit unavailable states on source failure

### Оркестратор
Reads:
- `observer/routes`
- `observer/summary`
- `observer/metrics`

Boundary:
- frontend preserves source route order
- dependencies are rendered only from explicit dependency fields
- no local portfolio priority engine

### Фундамент
Reads:
- `continuity-health`
- `continuity/founder-inbox`
- `continuity/objects`
- `hub/sync-health`

Boundary:
- overall Foundation readiness is intentionally **NOT PROVEN**
- successful health reads do not prove recovery, byte-for-byte readback or complete authority integrity
- latest Foundation object is matched by exact `FND-001`

### Исследования
Reads:
- `continuity/objects`
- `continuity/blockers`
- `continuity/rd1-projection/{object_id}`

Boundary:
- no local RD1 object IDs
- no invented researcher names
- no invented evidence percentages
- no local roadmap authority
- evidence/provenance remains unpopulated unless a safe 1:1 source exists

### Реестр
Reads:
- `continuity/objects`
- `continuity/blockers`

Boundary:
- Registry shows identity / ownership / canonical existence
- it does not infer a relationship graph

### Сигналы — internal layer
Reads:
- `continuity/objects`
- `continuity/blockers`
- `continuity/founder-inbox`
- `testing/summary`

Internal classifications:
- Founder-required: explicit `needs_founder`
- material changes: explicit material event kinds only
- risk/deviation: open non-test blockers + Testing `BLOCKED` / `RERUN_REQUIRED`

Boundary:
- no local cross-type ranking
- no local severity score
- opportunities are not inferred
- Market Scanner remains a separate external source family; after its QA PASS the browser reads only the approved read projections (`signals`, `signals/field-movement`, `signals/diagnostics`) and never performs ingest

### Документы
Reads:
- `hub/sync-health`

Shows only source-backed:
- durable/indexed count
- manual review required
- oldest manual review
- unknown classification
- current manual-review queue

Boundary:
- durable ≠ canonical
- file exists ≠ linked to canonical object
- publication-role counts are not inferred

### Тестирование
Reads:
- `testing/summary`
- `testing-health`
- `testing-runner-health`

Boundary:
- procedure state remains distinct from scientific outcome
- provider names are source-derived, not hard-coded
- Testing does not make the owning branch decision

### Диагностика
Reads frontend source state produced by `v2/live.js`.

Shows:
- successful / failed read coverage
- grouped availability for connected source families
- current refresh
- last successful read
- current page

Boundary:
- source-specific freshness is not invented
- no universal stale threshold is presented as canonical freshness

## G19 server-wired projections (Атлас / DT / BrazilPortal / Операции / Фундамент)

These five views moved from "UI-ready, source pending" to connected in the
G19 pass. Each reads a dedicated same-origin projection endpoint under
`/founder-ui-preview/api/panel/...` and renders `source_status` verbatim
(AVAILABLE / DEGRADED / STALE / UNAVAILABLE) — none of them derive a green
PASS locally.

### Атлас
Reads: `panel/atlas`.

Boundary (unchanged from the original design intent):
- Canonical vs Shadow/Candidate is read from the source, never inferred from filenames
- no ATLAS object ID is created client-side or back-dated
- degraded/absent upstream state renders as such, not as an empty-but-healthy view

### DT (Personal Twin)
Reads: `panel/twin`.

Hard boundaries (still in force):
- Continuity remains the sensing authority
- prediction is hidden until outcome; ambiguous outcome = `NEEDS_CONFIRMATION`, no learning on it
- `PROSPECTIVE_LONGITUDINAL` stays OFF until PTC-R0 PASS
- no reconstructable hidden probabilities/weights exposed before outcome

### BrazilPortal
Reads: `panel/brazilportal`.

- declared status and projected status are rendered as two distinct fields, never merged
- `projected_status_canonical_relation = UNRESOLVED` is shown explicitly, not hidden behind a single verdict
- identity resolution (`CMP-000005` / `FND-007`) is handled server-side; the frontend does not guess

### Операции
Reads: `panel/operations`.

- commitments come from Continuity, not from Orchestrator routes
- `ball_owner` is rendered from the projection's `ball_owner` field only — never derived from `actor`, branch name, or `object_id`; absence renders "Недоступно", a real value is shown as-is
- `factual_result` remains UNAVAILABLE: Continuity has no factual-result field on commitments today
- object-level blockers are shown as object context, explicitly not this commitment's own blocker

### Фундамент (aggregate)
Reads: `panel/foundation`.

- server-side aggregate is the sole readiness writer; the frontend does not derive PASS from `continuity-health + hub/sync-health` alone
- an unresolved gap (e.g. an orphan receipt) keeps the aggregate at DEGRADED and is shown as the blocking reason, not summarized away

### Market Scanner → Сигналы
Scanner/bridge runtime remains outside the browser.

Accepted planned contract:
- backend ingest: `POST /api/signals/ingest`
- Panel read: `GET /api/signals`
- optional later Founder status change: `PATCH /api/signals/{signal_id}`

Browser must never perform ingest.

Runtime activation only after scanner/bridge QA PASS.

Signal truth rules:
- first run establishes baseline; no old-news flood
- full-page fingerprint change alone is not a signal
- deterministic semantic evidence is mandatory
- LLM enrichment cannot create the underlying event
- customer-world causal graphs are never changed automatically by Meta/Founder-world scanning

## Write / authority boundary

Current v2 is **READ ONLY**.

Any future write path requires:
- an explicit owning backend
- authenticated same-origin route
- defined authority envelope
- Founder-safe confirmation where required
- audit receipt
- failure semantics

No browser-only local mutation may masquerade as canonical state.

## Integration acceptance checks

Before PR to `main`:

1. Every newly connected endpoint has explicit owner and field mapping.
2. Missing/failed source renders unavailable/degraded, not plausible stale shell data.
3. No secrets or internal infrastructure coordinates appear in browser payloads or repo docs.
4. Atlas / DT / BrazilPortal / Operations do not use guessed identities or invented source mappings.
5. Market Scanner is not enabled before QA PASS.
6. No canonical write path is added implicitly.
7. All 16 current top-level routes load (6 Founder modes + 10 contour pages).
8. desktop/tablet/mobile layout has no horizontal overflow.
9. browser console has no uncaught runtime errors.
   - local regression: `node dev/static-contract-check.mjs` + `node dev/check.mjs` on the dev stand
10. Founder reviews the integrated `panel-v2`.

Production flow:

`panel-v2 → integration verification → Founder review → PR → merge to main → existing deploy workflow → production smoke`

A green browser smoke check proves technical loading only; it is not a semantic truth gate.
