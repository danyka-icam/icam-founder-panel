[PANEL_HANDOFF_G19.md](https://github.com/user-attachments/files/31736374/PANEL_HANDOFF_G19.md)
# ICAM Founder Panel v2 — Public Handoff

Current as of: 2026-09-02

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

## UI-ready but server source still required

### Атлас
UI is ready for a safe normalized read-model.

Do not hard-wire proposed endpoints until a real server contract exists.

Required semantics:
- current world/state view
- activity/material changes
- object detail
- Canonical vs Shadow/Candidate
- Learning ≠ Promotion
- source timestamps / degraded state

### DT
UI is ready, but Personal Twin requires a resident server-side read-model.

Hard boundaries:
- Continuity remains the sensing authority
- prediction must be sealed before outcome
- prediction is hidden until outcome
- ambiguous outcome = `NEEDS_CONFIRMATION`
- no learning on ambiguous outcome
- before PTC-R0 PASS: `PROSPECTIVE_LONGITUDINAL=OFF`
- do not expose reconstructable hidden probabilities/weights before outcome

### BrazilPortal
Do not connect by guessed identity.

Known identities:
- component: `CMP-000005`
- legacy operational read target: `FND-007`

Required first step:
reconcile/document the relationship between these identities.

After that, expose a normalized read contract for:
- declared/current status
- stage
- ball owner
- next gate
- next move
- last material change/result
- open non-test blockers
- source timestamp

### Операции
Current UI is ready, but the verified existing sources do not provide complete execution truth.

Do not reuse Orchestrator routes as Operations truth.

Required execution read-model:
- approved commitment
- execution status
- ball owner
- factual movement
- blocker
- result
- external waiting
- timestamps / freshness

Continuity should remain the canonical operational source unless the owning architecture explicitly says otherwise.

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

### Foundation aggregate
The current frontend correctly shows partial health only.

If the product needs a single overall Foundation readiness status, server-side contract must explicitly cover:
- recovery
- byte-for-byte readback
- authority integrity
- required source health
- freshness
- failure reason

Do not derive green PASS from `continuity-health + hub/sync-health` alone.

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
