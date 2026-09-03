# ICAM Founder Panel v2 — Public Handoff

Current as of: 2026-09-04

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

1. Главная
2. Оркестратор
3. Фундамент
4. Исследования
5. Атлас
6. DT
7. BrazilPortal
8. Операции
9. Реестр
10. Сигналы
11. Документы
12. Тестирование
13. Диагностика

## Existing safe GET wiring in v2

All paths are same-origin under:

`/founder-ui-preview/api/...`

### Главная
Reads:
- `observer/routes`
- `continuity/founder-inbox`
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
- Market Scanner remains a separate pending source

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
7. 13 top-level routes load.
8. desktop/tablet/mobile layout has no horizontal overflow.
9. browser console has no uncaught runtime errors.
10. Founder reviews the integrated `panel-v2`.

Production flow:

`panel-v2 → integration verification → Founder review → PR → merge to main → existing deploy workflow → production smoke`

A green browser smoke check proves technical loading only; it is not a semantic truth gate.
