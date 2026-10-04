# ICAM Founder Panel v2 — Public Handoff

Current as of: 2026-10-03

## Repository and branches

- Repository: `github.com/danyka-icam/icam-founder-panel`
- Repository visibility: **public**
- `main` remains the release branch for the existing production deploy workflow.
- `panel-v2` is the active v2 integration branch and is deployed to the Founder Panel v2 preview path.
- the console root currently redirects to `/founder-ui-preview/v2/`, so v2 is the live Founder working surface even though `panel-v2` has not been merged to `main`.
- merge/push to `main` still controls the repository's production release workflow; branch identity and live routing must not be conflated.

Current v2 frontend:
- `v2/index.html`
- `v2/live.js`

`final/` remains rollback/reference material. The live Founder working route is v2; repository promotion to `main` is still a separate release step.

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

Current v2 is **read by default with two narrow mediated Founder write paths**. The browser never becomes a canonical store and never writes directly to Continuity.

Currently approved write-capable flows:
- exact-object status correction through Steward Navigator → context-steward-actions → Continuity, currently limited to explicit Founder-confirmed `CLOSED`;
- formal Founder Decision recording through the exact lifecycle identity → context-steward-actions → Continuity, with separate proposal and confirmation.

Every write path requires:
- an explicit owning backend
- authenticated same-origin route
- defined authority envelope
- exact target identity
- Founder-safe confirmation
- audit receipt / authoritative event
- failure and stale-state semantics

No browser-only local mutation may masquerade as canonical state. All other panel surfaces remain read-only unless a separately documented authority path is added.

## Integration acceptance checks

Before PR to `main`:

1. Every newly connected endpoint has explicit owner and field mapping.
2. Missing/failed source renders unavailable/degraded, not plausible stale shell data.
3. No secrets or internal infrastructure coordinates appear in browser payloads or repo docs.
4. Atlas / DT / BrazilPortal / Operations do not use guessed identities or invented source mappings.
5. Market Scanner is not enabled before QA PASS.
6. No canonical write path is added implicitly.
7. All 17 current top-level routes load (6 Founder modes + 3 direction pages + BrazilPortal + 7 system-tool pages, including Agent Network).
8. desktop/tablet/mobile layout has no horizontal overflow.
9. browser console has no uncaught runtime errors.
   - local regression: `node dev/static-contract-check.mjs` + `node dev/check.mjs` on the dev stand
10. Founder reviews the integrated `panel-v2`.

Release-branch promotion flow:

`panel-v2 live working surface → integration verification → Founder review → PR → merge to main → existing main deploy workflow → release smoke`

The current console redirect to v2 does not by itself mean the branch was promoted to `main`. A green browser smoke check proves technical loading only; it is not a semantic truth gate.

## Timeline v2 — layered temporal field

The `Во времени` view is now a layered temporal field, not a flat event list.

Implemented:
- independent multi-select layers: publications / Twin / signals / applications / stages / system;
- one horizontal lane per active layer on a common time axis;
- exact-identity trajectories only (`star:key` / `line:key`), never text-similarity links;
- semantic event types: fact / transition / waiting / closed wait / future milestone / neutral event;
- collision-aware deterministic point layout;
- selected-trajectory focus and source-backed current-state node;
- focused summary: past → now → waiting → next transition;
- exact duplicate suppression;
- explicit terminal facts may close a later stale waiting state only on the same exact trajectory;
- Founder-confirmed terminal facts may supersede matching stale waits while preserving the original source record;
- nearby-to-now event list instead of the first eight chronologically.

Truth boundary:
- the UI never fabricates dates for undated `now`, `waiting[]` or `next_transition[]`;
- a historical source record is preserved even when its active meaning is superseded;
- no relationship is inferred from text similarity.

## Steward Navigator

Steward Navigator is a separate role from Steward Reconciliation.

- Steward Reconciliation remains the system-integrity / reconciliation projection.
- Steward Navigator is a read-only working-memory navigator for Founder questions such as:
  what is this object, where was this tested, what package was related, what else is connected.
- Panel route: `POST /founder-ui-preview/api/steward-navigator/query`.
- POST is query-only and non-mutating; the static browser contract allows this exact endpoint only.
- Inspectors expose `Спросить Стюарда` and pass the selected object/page context explicitly.
- Responses show retrieved evidence separately from the prose answer.
- Missing memory must be reported as missing; old chat history is not assumed to exist unless a receipt/summary has been indexed.
- The closed ICAM Library is not exposed by widening permissions. Navigator currently indexes only already-readable project sources / receipts / explicitly seeded working artifacts.


## 2026-10-03 — Event-integrity / live temporal coverage repair

A Founder Research Brief exposed three polling-to-semantic contamination paths and a separate temporal coverage gap.

Repairs:
- Delivery Watch no longer downgrades a confirmed INDEXED delivery after a transient document-search miss. Confirmed delivery is monotonic unless an explicit authority action invalidates it.
- Observer summary adapter excludes last_event_at from semantic identity.
- Research Hub sync-health uses a normalized health-state projection instead of raw queue-count changes for semantic identity.
- RD1 Research Watch must distinguish channel silence from company inactivity and SYSTEM ACTION from OWNER ACTION.
- Exact external POST route exists for read-only Steward Navigator while the general Founder Panel route remains GET-only.
- Server-side event-integrity change-set: `20261003-event-integrity`.
- Founder Map release: `0.1-20261003-r4`.

Temporal coverage:
- Historical Activity Inbox remains a reconstruction source and is not mutated by Continuity.
- Founder Map r4 adds continuity_history.py as a second read-only temporal source from Continuity meaning-layer changes-feed.
- Known telemetry summary streams are excluded from Founder movement history.
- Continuity events with a parent_object_id are retained at company/system-object scope unless another exact Founder branch binding exists.
- Events without an exact binding are retained in unresolved_history; they must not disappear and must not be placed by text similarity.
- Founder Panel includes unresolved_history in recent dated activity and labels it as requiring structural binding.

Known reconciliation gap:
- Recent Reachability Testing events carry object_ref R1-CORE-REACH and owning_branch ATLAS / Forecast Core / REACHABILITY-01.
- Current canonical memory object MEM-REACHABILITY-01 has owning_branch ATLAS Structural & Epistemic Core and explicitly says its detailed live state is not yet reconciled into Continuity.
- Therefore no automatic alias/binding between R1-CORE-REACH and MEM-REACHABILITY-01 is permitted yet. The RV1/RV2N1 events remain visible as unresolved history until exact identity/ownership reconciliation is established.
- This is SYSTEM reconciliation, not Founder action.

## 2026-10-03 — Steward Navigator grounding contract v0.3

Navigator is no longer allowed to behave as a generic file search result surface.

Required behavior:
- Selected Founder Panel entity/event is a hard retrieval anchor.
- Generic vocabulary such as Twin / Research / signal / forecast is insufficient to establish identity.
- JSONL/event journals are indexed item-by-item, not as one mixed document.
- Market Scanner signals are indexed directly from the live read-only signals projection.
- If no exact/sufficiently specific context match exists, evidence must be empty and the answer must state the gap instead of substituting a thematically similar branch.
- Main answers are plain Russian. File paths, SHA-256, JSON field names, model names and infrastructure coordinates stay out of the conversational answer unless explicitly requested.
- Evidence is rendered separately with human source labels.
- Panel passes selected event date, layer, semantic type, source, explanation and recent dialog history.
- Supported structured intents: what is this / result / waiting / next / where.
- Twin live context may explain only fields actually present in the current Twin projection (for example sealed prediction, no recorded outcome, active clone count). Missing outcome or deadline remains unknown.

Regression suite:
- Steward Navigator release `20261003-1020` carries the grounding regression suite.
- BLT must resolve only to its own Market Scanner signal and never to Eliva/Human AI artifacts.
- A generic sealed Twin point with no exact run record must return no foreign evidence and must not invent a result/deadline.

Current limitation:
- No local LLM runtime is installed on the server. Navigator currently uses deterministic contextual retrieval and structured response logic. Do not silently add a paid/external language-model dependency.
## 2026-10-03 — Founder decision controls boundary

The earlier identity-bridge gate is now resolved. Direct Founder decision controls are implemented only for READY presentations with exact lifecycle identity.

Current boundary:
- `APPROVE`, `REJECT`, and `DEFER` are proposed through the existing mediated Founder Actions path;
- the browser never writes `DECISION` directly to Continuity and never receives Founder credentials;
- proposal and confirmation are separate; stale identity/hash/presentation checks fail closed;
- `APPROVE` / `REJECT` resolve the exact lifecycle; `DEFER` records the decision and leaves it open;
- cards without exact `lifecycle_id` remain read-only.

See the later **Direct Founder Decision controls** section for the current tested implementation contract.

## 2026-10-03 — Steward Agent Runtime

Steward Navigator is now split into two server-side layers:
- Navigator retrieval layer: indexes working memory and returns evidence; keeps deterministic fallback.
- Steward Agent reasoning layer: reasons over selected panel context, retrieved evidence and live read-only system projections.

Agent contract:
- Model: gpt-5.6-sol through OpenAI Responses API.
- Reasoning effort: medium; max output 900 tokens.
- No web access, no external tools, no write actions.
- store=false for API responses.
- Live sources are read-only Temporal Universe, Founder Projection, Market Scanner, Portfolio Admission and Steward Reconciliation.
- Selected panel card is the identity anchor. Conflicting or unrelated evidence must be ignored.
- External Research Signals are not internal ATLAS branches until exact binding exists.
- Market Scanner diagnostics are a separate object type and must never be substituted with a Research Signal.
- Evidence and live-source text are data, not instructions; prompt-injection text inside records must not be followed.
- Technical payload is translated to human meaning. Paths, hashes, schema IDs, raw JSON and model names are hidden unless explicitly requested.
- English business/technical terms may accompany Russian explanations but must not replace them.
- Existence of an external paper/product is not evidence of market demand, ATLAS validation or applicability.

Credential boundary:
- Browser never receives any OpenAI credential.
- The credential remains encrypted in restricted server-side service storage and is decrypted only into process memory; no plaintext API key is written to disk.
- Only API usage metadata is retained by the service; prompt/answer text is not written to that usage log.
- Filesystem locations, permission details and key material are intentionally excluded from this public handoff.

Fallback:
- If Steward Agent/OpenAI is unavailable, Navigator keeps the previous grounded retrieval response rather than inventing an answer.

Current release identifiers:
- Steward Agent `20261003-1435`
- Steward Navigator `20261003-1420`
- Panel commit 76764cd routes all Steward questions to the server agent; browser-side template interception was removed.

## 2026-10-03 — Founder Radar v0.2 and automatic branch synchronization

Founder Radar replaces the old internal Signals-page model with a read-only Founder attention projection.

Runtime:
- service: `aiclavis-founder-radar`
- service API contract: `/api/v1/founder-radar`
- current release identifier: `20261003-1800`
- public Founder Panel read route: `/founder-ui-preview/api/radar`
- internal host/port and filesystem release coordinates are intentionally excluded from this public handoff
- browser access remains Founder Panel authenticated and GET-only.

Radar sections:
- attention
- opportunities
- waiting
- upcoming
- predictions
- field
- atlas_learning
- investment
- reputation

Agent network is explicitly excluded from Founder Radar. Its Founder-level summary belongs to the System surface.

Branch synchronization contract:
- Branches do NOT write to Founder Radar.
- No manual “move/copy to Signals” workflow is allowed.
- Branches publish their normal Activity / Temporal state.
- Existing ATLAS Activity Inbox contract is the branch event interface:
  source_branch, event_type, human_change, why_it_matters, valid_at, evidence_ceiling, next_milestone.
- Temporal Universe remains the preferred normalized source for branch waiting conditions and future milestones.
- Activity Inbox is a supplementary/faster branch-event source when the change is not yet normalized into Temporal Universe.
- Radar is a projection only. It never creates a canonical reminder, deadline or state transition.

Date synchronization:
- Radar and Timeline must render the same source date, not maintain copies.
- Explicit structured date fields are preferred.
- If a Temporal waiting/next record contains an explicit ISO date in its source text and no separate date field, the UI may extract that literal date for placement; it must not infer or calculate a date.
- valid_at on an Activity Event is the date of the branch event, not automatically the date of its future milestone.
- Future Radar date from Activity comes only from an explicit next_milestone/human_change date or later normalized Temporal field.
- If the canonical/source date changes, Radar and Timeline change together on their next read cycle.

Founder relevance filter:
- Founder Radar waiting includes dated milestones, prediction/outcome/reveal windows, external replies/decisions, applications, outreach, conferences, tenders, grants, publications/invitations, and waiting from Market Entry / Institutional Opportunities / Scientific Presence.
- Internal technical/research waiting remains in its owning ATLAS/System surface unless it has a Founder-relevant future date or external hinge.
- FOUNDER_APPROVAL_REQUIRED inbox records are not duplicated when Founder Projection already exposes a formal Founder Decision.

Investment ATLAS Radar contract:
- virtual_capital.current_total
- virtual_capital.return_pct
- virtual_capital.cash_total
- hypotheses.success_rate_pct
- activity.active_positions_total
- portfolios[].nav_usd
- portfolios[].max_drawdown_pct
- activity.committed_decisions
- activity.errors_detected
- data_quality.status
Individual investment hypotheses are not exposed on Founder Radar.

Current live Investment Lab source:
- aiclavis-investment-live-lab
- /api/v1/investment-lab/summary
- Radar reads aggregates only.

Panel:
- Founder Radar surface introduced in panel commit 96d4624.
- Timeline master toggle “Все” is commit 06110d6.
- Timeline listItems recognizes an explicit YYYY-MM-DD literal in source waiting/next text only when no structured date field is supplied; this is display extraction, not a new deadline.

## 2026-10-03 — Signals surface aligned with Command Center

- Signals page is signal-only. Founder decisions / requests requiring Founder action stay in Command Center and are not rendered as a Signals card.
- Signals page now uses the Command Center visual language: cc-page frame, left working surface, sticky right inspector, selectable signal cards.
- Amber/orange on Signals means IMPORTANT_NOW presentation, not crisis.
- Coral/red remains reserved for an explicit critical source state.
- Full agent-network topology remains outside Signals. Network health / authority conflicts / stalled agents / unregistered changes belong to the future System network surface.
- Shared integration boundary for the neighboring agent-network branch: FOUNDER_PANEL_AGENT_SIGNAL_CONTRACT.md.
- Signals and future agent-network surfaces remain read-only projections; future agent signal producers must expose normalized signals through a projection rather than write into the panel. This is separate from the two explicitly approved Founder-confirmed action paths documented above.

## 2026-10-03 — Steward explicit Founder status correction

Steward Navigator now has one narrow write-capable workflow, mediated by the existing context-steward-actions service.

Rules:
- The normal Steward reasoning path remains read-only.
- A status mutation is considered only when the Founder gives an explicit close command in Steward chat.
- v0.1 supports only CLOSED.
- A write requires an exact canonical Continuity object_id already proven by the selected panel entity.
- Route title similarity, memory similarity, source_object_id provenance or semantic matching are insufficient.
- If exact_object is false/missing, proposal is refused with exact_object_required and nothing is written.
- If the selected route is already closed in its live source, no action is proposed.
- Proposal and execution are separate. Steward creates a PENDING context-steward-actions action; the UI shows old → new status and requires explicit Founder confirmation.
- Confirmation is hash-matched through the existing Founder role in context-steward-actions.
- Only after confirmation does context-steward-actions emit the authoritative Continuity DECISION event carrying new_state.status=CLOSED.
- Cancel leaves the ledger/system state unchanged.
- Browser write whitelist is limited to Steward query, propose-status and confirm-status. Static contract rejects other browser writes.

Endpoints:
- POST /founder-ui-preview/api/steward-navigator/action/propose-status
- POST /founder-ui-preview/api/steward-navigator/action/confirm-status
- server bridge: aiclavis-steward-navigator v0.5 → context-steward-actions (8800) → Continuity.

Closed-route presentation fix:
- CLOSED/CLOSED_NO_GO/DONE/ARCHIVED routes no longer expose historical next_move as an active next step.
- closed routes do not enter timeline from stale route deadline/next_move.
- Steward route context now includes route_id, exact object_id when proven, live status, closed flag and historical_next_move separately.

GovAI example:
- observer/routes already reports GovAI Research Scholar — второй этап as status=CLOSED_NO_GO.
- Its remaining “Ждать ответ” next_move is stale historical route text, not current waiting state.
- Therefore GovAI requires no Founder mutation; the Panel presentation was the defect.

## 2026-10-03 — Agent Network moved to System tools

- Added dedicated Founder Panel page `#agents` / «Сеть агентов» under «Инструменты системы».
- Signals page remains signal-only; agent topology and health are not rendered there.
- No live Agent Registry / Lineage endpoint was found on the server at this time.
- The page therefore shows explicit unavailable/unknown state and does not infer agents from systemd services.
- Integration contract is recorded in `FOUNDER_PANEL_AGENT_SIGNAL_CONTRACT.md`.
- Steward Agent v0.3 now reads exact `observer/routes` live state by `route_id` before old indexed memory, and exact object matches before semantic retrieval when IDs are available.
- Live selected context / exact live match outranks stale indexed documents on state conflicts.

## 2026-10-03 — Unified terminal-state semantics

Founder Panel now uses one terminal-state contract for route/activity interpretation.

Terminal states:
- CLOSED
- CLOSED_NO_GO
- DONE
- ARCHIVED
- CANCELLED
- COMPLETED
- RESOLVED
- RETIRED
- DEPRECATED
- INVALIDATED
- SUPERSEDED

Rules:
- terminal state suppresses active waiting / next move / deadline presentation;
- stale operational fields may remain in the raw source as history but must not reactivate the entity;
- Command Center, Timeline and all live.js surfaces share H.isClosed() for route state;
- Temporal / Portfolio archival classification uses the same terminal vocabulary plus HISTORICAL;
- browser fixture R-OLD is CLOSED_NO_GO and deliberately retains stale next_move/deadline to guard this regression.

## 2026-10-03 — Direct Founder Decision controls

Formal Founder decisions can now be executed from the Command Center inspector only when exact lifecycle identity is present.

Backend releases:
- founder-decision-presentation v0.3 exposes read-only lifecycle_id, object_refs and identity_evidence for READY cards.
- context-steward-actions remains the only write-capable Panel service; it now supports action_type FOUNDER_DECISION_RECORD.
- Steward Navigator v0.6 bridges Panel controls to Founder Actions without exposing role tokens to the browser.
- Nginx exposes authenticated exact POST routes:
  - /founder-ui-preview/api/steward-navigator/action/propose-decision
  - /founder-ui-preview/api/steward-navigator/action/confirm-decision
  - /founder-ui-preview/api/steward-navigator/action/cancel

Decision semantics:
- Browser never writes DECISION directly to Continuity.
- First click on APPROVE / REJECT / DEFER only prepares or updates one PENDING FOUNDER_DECISION_RECORD for the exact lifecycle.
- The action payload carries lifecycle_id, decision_id, decision_packet_sha256, decision_effect and a digest of the exact READY presentation.
- Changing choice before confirmation updates the same PENDING action_id and changes its action_hash; an old confirmation becomes STALE and is rejected.
- Confirmation re-reads the lifecycle and presentation. If the lifecycle is no longer OPEN, identity changed, or presentation digest changed, nothing is written.
- Only the second explicit confirmation approves the wrapper action through the existing Founder role.
- context-steward-actions emits the authoritative Continuity DECISION with decision_id, decision_packet_sha256 and decision_effect at the level already consumed by Founder Decision Lifecycle.
- APPROVE and REJECT resolve the exact lifecycle.
- DEFER records decision_effect=DEFER and leaves the lifecycle OPEN.
- Cancel performs hash-matched reject of the pending wrapper action and produces no Continuity event.
- A READY card without lifecycle_id never receives write controls.

Regression proof:
- isolated bridge test verifies cancellation without Continuity write;
- one lifecycle has at most one PENDING decision wrapper;
- changing choice preserves action_id but rotates hash;
- stale hash is rejected with 409;
- confirmed REJECT produces a DECISION recognized by the lifecycle projector and resolves the exact lifecycle;
- browser stand contains one exact READY decision and one READY decision without lifecycle_id to enforce the UI boundary.

## 2026-10-03 — Radar signal → Steward context

- The Signals / Founder Radar inspector now exposes the shared `Спросить Стюарда` control for the currently selected signal.
- The Steward context is source-bounded and carries the displayed signal title, Radar section, date, source label, why-it-matters text, signal/radar IDs, source_ref and explicit world/line/branch context when present.
- Opening Steward from Signals does not promote a signal into an action, decision or causal claim; the Signals evidence boundary remains unchanged.
- The existing shared Steward dialog and query endpoint are reused; no second agent/chat implementation is introduced.
- Status mutation remains protected by the existing exact-object gate. A Radar signal does not gain write authority merely because Steward can discuss it.
- Dev stand now includes a synthetic Founder Radar fixture and the browser regression checks that the selected signal opens the shared Steward dialog with the exact signal context.

## 2026-10-03 — full-audit checkpoint

- Static structure: 17 unique top-level routes, no orphan nav route, no duplicate HTML IDs, no `href="#"` or inline `onclick` placeholders.
- Browser protocol sweep: 68 route/viewport cases (17 routes × 1680/1280/820/390) resolve to exactly one active panel with no document/body horizontal overflow and no uncaught runtime exceptions. Timeline and Links keep their intentional internal horizontal scroll canvases.
- Signals desktop/mobile visual smoke passed. Radar → Steward was also exercised as a real click, not only render inspection; exact selected signal context reaches the shared Steward dialog after the attribute-serialization fix.
- Authority copy was reconciled with current reality: v2 is read-by-default, but exact Founder-confirmed status correction and formal decision recording are approved mediated write paths. The live footer no longer claims that the whole panel is read-only or that v2 is not the working surface.
- Human terminology pass restored the accepted `DT` label in Founder navigation/deep links and translated Radar runtime labels; technical source names remain literal where they identify a source/component.
- Live source snapshot during audit: Operations and BrazilPortal are DEGRADED/STALE by their own freshness contracts; Foundation is DEGRADED/FRESH because `artifact_durability_readback` is failing; ATLAS specialized state is explicitly UNAVAILABLE because no authoritative state source exists; DT is LIVE; Market Signals are AVAILABLE/ACTIVATED; Founder Radar has no source errors and includes the live Investment ATLAS aggregate. These are source states, not UI failures, and must remain visible rather than normalized away.
- Agent Network remains intentionally unavailable until the neighboring Registry/Lineage work exposes a real projection contract. The panel must not infer the network from systemd services.

- Dead-control cleanup: removed all 65 legacy `top-corner-arrow` controls and the generic drawer they opened. That drawer contained only placeholder `—` fields and promised future details, so it was not a real inspector. Disabled future subview buttons remain intentionally disabled and explicitly explain that their read projection is not connected; real Founder-mode inspectors are unchanged.
- Russian UI pass: removed mixed semantic copy such as `current`, `hard failure`, `runtime/deployment`, `recovery path`, `write-authority`, `fake throughput`, `Founder-facing`, `operational`, `commitments/blockers`. Literal field names, status codes and component names remain unchanged where they identify a real contract or source.
- Foundation audit follow-up: `artifact_durability_readback=FAIL` is not a missing panel endpoint. Live evidence at audit time was `hash_mismatches=0`, `artifacts_missing=0`, `orphan_receipts=1`, `objects_on_disk=853`, coverage `FULL_END_TO_END`. The one `STORED` receipt without a disk object is a real durability failure, so the Foundation page must remain degraded until the owning durability layer resolves that orphan; do not weaken the gate in the panel.

- Authority-comment cleanup: `command-center.js` no longer claims the whole module is read-only; it documents the two narrow Founder-confirmed action paths and the rule that the browser never writes directly to Continuity.
- Russian UI cleanup follow-up: removed remaining semantic mixed-language copy on the Twin/Foundation/Documents surfaces (`Founder-outcome`, `one-click control`, `health/readback`, narrative `readback`, synthetic/empirical prose) while preserving literal protocol/status/field identifiers such as `PASS` and `objects_on_disk` where they identify the source contract.

## 2026-10-03 — Diagnostics current-cycle truth

- Replaced two genuinely unconnected Diagnostics placeholders with data the browser already possesses safely from the current read cycle.
- `Ошибки текущего цикла чтения` now lists only current fetch failures / partial read errors from `sourceState`; it explicitly does not reconstruct a historical failure journal.
- `Последнее чтение проекций` now shows the browser read timestamp and read success/failure per projection. This timestamp is not promoted to semantic freshness; source-defined freshness remains separate.
- Added browser regressions proving the Diagnostics placeholders are replaced after a successful cycle and that Radar appears in the per-projection read list.

## 2026-10-03 — Recent Hub arrivals on Documents

- Replaced the unsupported `Последние изменения артефактов` placeholder with `Недавние поступления в Hub`, sourced only from `hub/sync-health.recent_48h[]`.
- The page now shows filename, branch, server/index/outbox transport facts, review state and received time for recent Hub arrivals.
- This block deliberately does not claim publication, freezing, version replacement, recovery or canonical-role change; those semantic artifact transitions still require a dedicated source.
- Added a synthetic Hub arrival fixture and browser checks for both the rendered transport facts and the evidence ceiling.

- Recent Hub provenance enrichment: `recent_48h[]` rows are enriched from `review_rows[]` only when `filename === packet_file` exactly. Exact matches may show `claimed_object_id`, `artifact_class` and a shortened SHA-256; unmatched arrivals remain explicitly unbound. No fuzzy filename matching is allowed.

- Documents durability lower card no longer shows static dashes. It renders only literal Hub counters: `objects_on_disk`, `orphan_receipts`, `hash_mismatches`, and Hub-declared `coverage`. Labels were changed away from unsupported claims such as a generic successful durable write/readback result.

- Documents unresolved-artifact surface now reads active `review_rows[]` where `artifact_class=UNKNOWN`. It shows the packet file, only an explicitly claimed object ID (otherwise `Object ID не разрешён`), classification reason and received age. Filename text never assigns an object or canonical role.

## 2026-10-03 — Testing result lineage from explicit summary fields

- Replaced the generic five-step Testing lineage diagram with a factual chain driven by one current test: `test_id/request_sha` → `current_gate` → result filename from `result_path` → `evidence_refs` count → `delivery_state/delivery_revision`.
- `protocol_id` and `run_id` are not present in Testing summary and are explicitly not reconstructed from request/result paths.
- The evidence card now shows only the result filename (never the internal server path), shortened request SHA, and evidence reference count.
- Selection prefers a `NEEDS_ADJUDICATION` test, otherwise the most recently ordered available test; no scientific conclusion is promoted by this selection.

## 2026-10-03 — Selectable Continuity object card

- Registry object rows are now selectable and the object card is filled only from the selected Continuity `objects.items[]` record: `object_id`, `name`, `owning_branch/owner`, `declared_status`, `last_event_at`, and the explicit `needs_founder/needs_nika` flag.
- Missing fields are distinguished from explicit empty/false values. In particular, a missing Founder flag renders `поле не передано`, while explicit true renders `да`.
- Selection persists across panel refreshes only by exact `object_id` while that object remains in the displayed source list; otherwise the newest displayed object becomes selected.
- Canonical object relationships remain unrendered because the current Continuity objects contract does not provide them.

## 2026-10-03 — ATLAS no-state boundary made actionable (исторический checkpoint; superseded 2026-10-04)

На момент этой записи Gate 2 ещё не был снят. Ниже сохранена историческая фиксация состояния до появления `aiclavis-atlas-state`; она больше не описывает текущий live-read path.

- На 2026-10-03 live `/panel/atlas` корректно оставался `UNAVAILABLE` с `error_class=NO_ATLAS_STATE_SOURCE`; authoritative ATLAS state source тогда ещё не существовал.
- The ATLAS page now renders the source-provided `degraded_reason`, `blocked_stage`, `unblock_requires`, and literal `unavailable_fields[]` instead of reducing the condition to a generic unavailable message.
- Known ATLAS no-state / unblock messages are translated into Russian for the Founder UI while the formal error code remains visible.
- Library documents remain explicitly below the state boundary: `ATLAS_UPDATE_*` artifacts are not parsed or promoted into current state.
- На 2026-10-03 Agent Network также ещё не имел live Agent Registry / Lineage projection; это историческое состояние было superseded 2026-10-04 после снятия Gate 1. Правило при этом сохранилось: systemd services и static seed artifacts не являются Agent Registry.

## 2026-10-03 — Source-declared unknown fields are visible

- Added a shared Russian field-label mapping for normalized projection `unavailable_fields[]`.
- ATLAS now renders `current_state`, `learning_state`, `promotion_state`, and related unavailable fields in Russian while preserving the upstream field boundary.
- Operations and BrazilPortal now render source-declared `unavailable_fields[]`; live `factual_result` absence is shown explicitly instead of looking like zero, omission, or a successful closed outcome.
- No unavailable field is inferred from missing UI content; these surfaces appear only when the upstream projection provides the array.

## 2026-10-03 — Agent-network upstream contracts consumed

- Consumed the neighboring agent-network handoff `FOUNDER_PANEL_UPSTREAM_GATES_HANDOFF_2026-10-03.md`.
- Added `FOUNDER_PANEL_UPSTREAM_GATES_CONSUMER_CONTRACT_v0.1.md` as the panel-side gate contract: Agent Registry/Lineage ownership remains unresolved; ATLAS remains `NO_ATLAS_STATE_SOURCE`.
- Reconciled `FOUNDER_PANEL_UPSTREAM_SOURCE_CONTRACTS.md` as the downstream normalized read-projection shape, not a canonical authority contract.
- Required layering is now explicit: canonical upstream → normalized server projection → Founder Panel.
- Added static regression gates that fail if browser code bypasses Agent Registry/Lineage ownership via a direct endpoint, or if the ATLAS canonical renderer starts promoting adjacent Signals / Signal Lab / Founder Map / Hub data into overall ATLAS state.
- Existing audit/schema artifacts remain below the live-state boundary; they are useful as design seeds only.

## 2026-10-03 — Upstream gate acceptance validator

- Added `dev/upstream-gate-check.mjs` as a payload-shape acceptance validator for future canonical Agent Registry records, Lineage edges, and ATLAS-state payloads.
- The validator checks required field presence only. Explicit unknown/null values remain unknown; the validator does not invent or reinterpret them.
- Passing the validator does not prove ownership, authority, freshness, semantics, or readiness to connect. Gate removal still requires the versioned ownership/semantic contract.
- Added validator self-tests to the existing Panel v2 CI static stage; no new workflow or notification stream was introduced.

## 2026-10-04 — Temporal coverage made explicit

- Founder Map release `0.1-20261004-r5` extends `atlas-temporal-universe` to v0.2 with a read-only `coverage` block.
- The coverage block does not create events. It reports observable historical-source reach: Activity Inbox count/last receipt, Company Event Export source coverage, and missing historical ledgers.
- Current live finding: Activity Inbox has 15 records and its latest receipt is 2026-09-29; Research Ledger and Commercial Ledger are absent historical sources. `coverage_complete=false` is therefore explicit.
- Timeline UI now renders this incompleteness above the temporal field. Empty days are labelled as an observability gap, not proof that no work occurred.
- Activity Inbox remains the branch event interface and is not backfilled from Continuity or read-model snapshots.
- Testing return bridge was verified healthy; immutable GATE_RESULT events already flow to Continuity. Testing snapshot `updated_at` is not promoted into historical fact.
- Browser regression passed at 1680 / 1280 / 820 / 390 with no JS errors.

## 2026-10-04 — Prospective Research/Commercial ledgers + branch event producer contract

- Added a new read-only Company Event Ledger service with separate Research and Commercial domains over stable Company Memory `memory_id` identities.
- First observation is baseline-only: no historical events are created from current snapshots.
- Future events are append-only observations of changes to `state`, `evidence_status`, or `owning_branch`.
- Event time is explicitly observation time; it is not promoted to reconstructed occurrence time.
- Research baseline currently covers 80 RESEARCH/FORECAST/TEST/PUBLICATION objects; Commercial baseline covers 9 COMMERCIAL objects.
- `Company Event Export v0.2` now consumes both ledgers and marks them `PROSPECTIVE_FROM_BASELINE`; both remain `coverage_complete=false`.
- Temporal Universe coverage now distinguishes `missing_historical_sources[]` from `prospective_only_sources[]`.
- Added `ACTIVITY_EVENT_PRODUCER_CONTRACT_v0.2.md` and the corresponding server-side local publisher. It requires stable producer/event identity, evidence refs, materiality class and source-backed `valid_at`; telemetry/readback/polling events are rejected.
- Live idempotency check passed: publishing the same producer/source_event pair twice with changed wording added exactly one Activity Inbox record.
- The Research/Commercial ledger activation itself was published as a material company-map event and appeared on the 2026-10-04 Timeline.

## 2026-10-04 — Gate 1 resolved: live Agent Registry / Lineage connected

- Upstream selected the canonical owner: AICLAVIS Agent Registry Authority. Lineage is a separate logical authority in the same v1 service package.
- Live verification: Agent Registry revision 18 contains 18/18 VERIFIED agents; Lineage revision 14 contains 14/14 VERIFIED edges.
- Founder projection is LIVE and exposes separate `registry_revision`, `lineage_revision`, verified `agents[]`, and source-backed counts. Current live counts include `lineage_gaps=3`, `authority_conflicts=0`, `unregistered_agents=0`, `decisions_without_evidence=0`.
- Real canonical agent-record and lineage-edge payloads both pass the updated `dev/upstream-gate-check.mjs` v0.2 shape validator.
- Added `FOUNDER_PANEL_UPSTREAM_GATES_CONSUMER_CONTRACT_v0.2.md`; Gate 1 is now resolved for read-only Founder consumption while Gate 2 / ATLAS remains `NO_ATLAS_STATE_SOURCE`.
- Founder Panel reads only the upstream-approved same-origin GET projections `agent-registry` and `agent-lineage`; browser code does not access canonical service coordinates or `/api/v1/*` directly.
- Agent Network now renders verified identities, explicit `authority_scope`, verified Lineage edges, registry/lineage revisions, and source-provided gap counters. A non-zero lineage gap degrades the network state but does not make the entire source unavailable.
- Bootstrap census/registry/edge seed artifacts remain below the live boundary and are never rendered directly.
- Browser regression passed at 1680 / 1280 / 820 / 390 with no JS errors.

## 2026-10-04 — Gate 2 resolved: canonical ATLAS State connected

- Consumed the ATLAS return package: `dev/atlas_state_payload_gate2.json`, `dev/atlas_state_contract_v1.json`, and `dev/ATLAS_STATE_GATE2_RETURN_2026-10-04.md`.
- The real live payload passes `node dev/upstream-gate-check.mjs atlas-state` under nvm Node 22; all 13 required fields are present.
- Canonical authority is `aiclavis-atlas-state` / `ATLAS_STATE_CANON_V1`; contract `aiclavis.atlas-state.v1` v1.0.0; current operating mode is `PARTIAL_DECLARED_STATE`.
- Gate 2 is now resolved for read-only Founder consumption. Added `FOUNDER_PANEL_UPSTREAM_GATES_CONSUMER_CONTRACT_v0.3.md`.
- The canonical ATLAS source retains internal evidence locations server-side. Founder projection was hardened in ATLAS State release `v1.0.0-20261004-r3`: internal evidence URLs are replaced by stable logical `evidence_ref_id` values and `projection_boundary=FOUNDER_READ_ONLY_SANITIZED_V1` is explicit.
- Live same-origin Founder projection contains no localhost/private service coordinates. The browser reads only the approved `/founder-ui-preview/api/atlas-state` projection and never accesses the canonical service route directly.
- ATLAS renderer now shows canonical authority/revision/operating mode, active modules, domain-specific semantic freshness, research gate, investment review, current blockers/gates, and explicit UNKNOWN commercial/freeze domains.
- The renderer does not synthesize a global health value from domain status and does not promote pending investment review into a committed decision.
- Signal state, research state, investment state, commercial state, freeze registry and Founder projections remain distinct authority domains.
- Browser regression passed at 1680 / 1280 / 820 / 390 with no JS errors.

## 2026-10-04 — Final live-source audit

- Completed a full live-source sweep after Gate 1 and Gate 2 activation. Agent Registry/Lineage, ATLAS State, Twin, Signals and Signal Lab are live; the remaining non-green states were audited individually instead of normalized away.
- Foundation false-partial condition was traced to Hub READ credential drift inside `context-steward-face`: its embedded token had been revoked by rotation. The Face service now uses systemd `LoadCredential` from the canonical root-owned Hub READ token file rather than duplicating the secret in the unit.
- After restoring Hub access, Foundation exposed one real historical orphan receipt. Exact SHA/receipt investigation found the corresponding structured cleanup event proving it was a `KLIM_RULE_SELFTEST`, explicitly REJECTED and removed as a test artifact with `scientific_promotion=false`.
- Hub release r10 introduced an append-only, exact-SHA durability exclusion with scope `PRODUCTION_DURABILITY_ORPHAN_METRIC_ONLY`. The original STORED receipt remains immutable. Live production orphan count is now 0; `excluded_test_orphan_receipts=1` remains separately visible.
- Hub release r11 corrected review-gap semantics: `still_unreviewed=1302` is not presented as 1302 manual-review problems. Live breakdown is `manual_review_required=93`, `non_manual_pending=1209`, `unassigned_review_quarantine=93`, `actionable_review=0`.
- Foundation is now `READY / FRESH`; all four mandatory dimensions are PASS. Its durability detail explicitly carries the evidence-backed self-test exclusion so READY does not erase the historical receipt.
- Documents UI now distinguishes production orphan count, evidence-backed self-test exclusions, manual review debt, non-manual pending records, and unassigned review authority.
- The legacy pre-Gate-2 `/api/panel/atlas` route was retired with HTTP 410. The only current Founder read path is the official sanitized `/founder-ui-preview/api/atlas-state` projection.
- `integrated_smoke.mjs` was updated to the current contracts: ATLAS Gate 2 route/state and Foundation READY with production orphan=0 plus visible self-test exclusion.
- Operations remains intentionally `DEGRADED / STALE` because its canonical source is the narrow Continuity commitments projection and its last commitment movement is 2026-09-26. The UI explicitly does not interpret this as company-wide inactivity.
- BrazilPortal remains intentionally `DEGRADED / STALE`: its FND-007 source has no recent projected/material movement and projected `status` retains `canonical_relation=UNRESOLVED`. The UI does not choose a canonical status locally.
- Temporal Universe remains `coverage_complete=false` because Research and Commercial ledgers are prospective-only from their baseline. This is an honest historical-coverage limitation, not a broken collector.
- Full local browser regression passed at 1680 / 1280 / 820 / 390 with no JS errors after the final-audit UI changes.
- Full residual classification is recorded in `FOUNDER_PANEL_FINAL_AUDIT_2026-10-04.md`.


## 2026-10-04 — Founder Radar legacy cleanup + final smoke

- Reconciled the final integrated smoke with the already-approved Founder Radar v0.2 contract. Founder Radar remains the current Signals surface; the pre-Radar internal Signals-page model is not restored.
- Removed dead browser renderers `renderSignals(...)` and `renderFieldMovement(...)`; their old DOM hooks no longer exist after the Radar replacement.
- Raw Market Scanner signals / Field Movement remain read-only current-cycle sources for diagnostics. They are not a second competing Founder Signals UI.
- Updated integrated Pass 5 to verify Radar field signal → card → inspector → exact bounded Steward context, explicit empty/unavailable behavior, Scanner/Field Movement diagnostic reads, and the closed ingest/write boundary.
- Updated integrated smoke passes 41/41. Standard browser regression matrix also passes for normal, Temporal-down, Admission-down and large-Founder-inbox scenarios across 1680 / 1280 / 820 / 390.
- Current Agent Registry/Lineage authority after network hardening: Registry revision 42 with 36 verified agents; Lineage revision 43 with 39 active VERIFIED edges. Authority history contains 41 distinct verified edge identities, 2 later retracted. Current source counters report lineage_gaps=0 and authority_conflicts=0.


## 2026-10-04 — Review authority pipeline repair

- Founder Panel review-queue follow-up traced the apparent `93 manual_review_required / 93 unassigned` state to two separate classes: a frozen 34-row legacy quarantine plus 59 post-baseline rows.
- 57 of the 59 post-baseline rows were false review surfaces caused by classifier format gaps: `CHAT_UPDATE_*` filenames were not recognized as Chat Update transport, and two Money Book status packets used `Branch:` rather than `Source Branch:`. They were reclassified append-only as `OPERATIONAL_EVIDENCE`; no queue history or artifact bytes were rewritten.
- The remaining two rows are real `CANONICAL_REVIEW` results: `ATLAS-RCH-RV1-20260930-BLIND-v0.1` and `ATLAS-RCH-RV2N1-20261002-BLIND-v0.2-R1`. Their frozen requests explicitly assign scientific adjudication to `ATLAS / Forecast Core / REACHABILITY-01`. Exact append-only authority repairs now expose `OWNING_BRANCH / PACKET_EXPLICIT`; Hub reports both as `ACTIONABLE_REVIEW`.
- Testing dispatcher was hardened for future results: an owning-branch authority tuple is emitted only when the frozen request explicitly states that the owning branch performs scientific adjudication. `source_branch` alone never grants authority; negative control `INFRA-ZC-001` remains unassigned.
- Legacy review quarantine baseline upgraded from count-only v0.1 to exact-key `AICLAVIS_REVIEW_QUARANTINE_BASELINE_v0.2`: 34 immutable legacy classification keys. Hub now distinguishes `legacy_unassigned_quarantine` from `new_unassigned_quarantine`.
- Review freshness now tracks actionable review + Founder-gated review + new unassigned review, not frozen legacy quarantine. Historical authority repair age starts when explicit authority is assigned rather than retroactively at original ingest time.
- Continuity Hub credential was rotated after the old read token began returning 401. `research-hub-sync-health` is healthy again and its sanitized semantic snapshot preserves the review-authority counters.
- Supervisor now prefers the exact `new_unassigned_quarantine` value, with the old count-delta rule retained only as backward-compatible fallback.

Current verified state:
- `manual_review_required = 36`
- `actionable_review = 2`
- `unassigned_review_quarantine = 34`
- `legacy_unassigned_quarantine = 34`
- `new_unassigned_quarantine = 0`
- `review_new_authority_debt = 0`
- review source `available = true`
- review freshness = `OK`
- current Supervisor discrepancies contain no review-authority-unavailable or review-queue-freshness alert.

## 2026-10-04 — Post-review upstream discrepancy pass

- Mac outbox health false-positive repaired in `~/bin/icam-hub-push`. Three old delivery attempts had remained `QUEUED` under their original `local_event_id` although identical immutable SHA objects were later delivered and ACKED under new event IDs. The append-only ledger was not rewritten; the derived summary now treats a stranded QUEUED/SENT attempt as `SUPERSEDED` when the exact same SHA has an ACKED delivery.
- After rebuilding the Mac summary, `branch_freshness.UNKNOWN` moved from `pending_count=3 / STALE` to `pending_count=0 / CURRENT`.
- Continuity recovery logic was hardened so `CURRENT` is a healthy recovery state alongside FRESH/HEALTHY/OK/PASS/SYNCED. This lets a prior branch-freshness STALE issue auto-resolve instead of remaining open forever after recovery.
- A second review-classification ingress gap was found: `/usr/local/bin/icam_hub_ingest.py` can append file-ingested update packets directly to `pending_updates.jsonl` without creating a REV_FLOW classification record. Exact-key baseline v0.2 exposed three fresh false anonymous-review rows immediately.
- Hub r14 read model now fail-safely runs the deterministic current classifier when a queue row has no persisted classification record. Persisted classification remains authoritative when present; missing-record fallback is marked `DERIVED_READPATH`. The three new `CHAT_UPDATE_*` rows therefore resolve to `OPERATIONAL_EVIDENCE`; verified review state returned to 36 manual / 2 actionable / 34 exact legacy / 0 new anonymous, freshness OK.
- The remaining `ingress_accepted_but_not_ingested` discrepancy was inspected exactly. Two historical packets are deliberately unresolved:
  - SHA `4e6de2ec...`: `object_id=PANEL_SYNC_INFRA`, `event_type=INFRASTRUCTURE_DECISION` (outside the closed Continuity event vocabulary).
  - SHA `8a28240f...`: `event_type=NEW_FILE`, but `object_id` is explicitly empty.
  No automatic semantic normalization or branch-to-object inference was authorized. Keep this as honest historical owner debt unless a canonical alias/binding is supplied.
- FND-002 `TERMINAL_CONFLICT` was traced to exact provenance. The fresh next-move field comes from raw event `fe424809-d3c1-4276-bca4-29cdacc16d44`, which is the `last_raw_event_id` of cleared blocker `SECURITY-CREDENTIAL-ROTATION-20260926-001`. The blocker is `CLEARED`, owned by `SYSTEM / Infrastructure Security`; next gate is CLOSED. A Supervisor patch has been prepared locally to classify an exact terminal next-move sourced from a CLEARED blocker as `TERMINAL_CLOSURE` instead of `TERMINAL_CONFLICT`. This uses event provenance, not text interpretation. Deployment was not yet verified at the time of this handoff note because the SSH channel reset during the final provenance read.

## 2026-10-04 — Final closure of remaining Founder Panel upstream debt

- Supervisor release `21-terminal-closure-20261004-r1` was compiled, integrity-hashed, activated, and restarted successfully.
- Exact FND-002 provenance rule is live: a fresh next-move sourced from the exact `last_raw_event_id` of a `CLEARED` blocker under a terminal gate is classified as `TERMINAL_CLOSURE`, not as an executable route and not as `TERMINAL_CONFLICT`.
- Verified current FND-002 state: `canonical_route.route_state = TERMINAL_CLOSURE`; projected executable `next_move = None`; projected executable `next_gate = None`.
- Verified current Supervisor discrepancies no longer contain `canonical-terminal-next-move:FND-002`.
- Verified prior `branch_freshness.UNKNOWN.freshness=STALE` attention is resolved and absent from current discrepancies.
- Final service smoke: `icam-hub-api.service=active`, `context-steward.service=active`, `aiclavis-supervisor.service=active`.
- Final review-authority smoke: `manual_review_required=36`, `actionable_review=2`, `unassigned_review_quarantine=34`, `legacy_unassigned_quarantine=34`, `new_unassigned_quarantine=0`, `freshness=OK`.
- Remaining `ingress_accepted_but_not_ingested=2` is intentionally unresolved historical owner debt, not an infrastructure defect: one packet has an out-of-contract event type and one has an explicitly empty object_id. Do not auto-map either without a canonical alias/binding.

## 2026-10-04 — Founder decision closure + external signal source repair

- Founder decision path was verified with the real GVF-002A action. Lifecycle `FDL-0a39b64bade7f11ec971931e` is `RESOLVED`; the authoritative Continuity DECISION is `action-approved:1f9c7700-2f8e-4486-a663-98014657e59c`, effect `APPROVE`, with exact `decision_id=GVF002A_2019_FOUNDER_GATE_v0.1` and matching decision-packet SHA.
- Root cause of the stale “Founder approval required” card: Continuity Attention Lifecycle opened `FOUNDER_APPROVAL_REQUIRED` but had no symmetric rule to close it when the exact formal decision was later recorded.
- Context Steward now reconciles open Founder approval issues against native DECISION events by exact `decision_id` plus packet SHA when present. Only APPROVE/REJECT resolve; DEFER deliberately leaves the gate open. Object/title similarity is never used.
- Verified after repair: Continuity Founder Inbox has `needs_founder_count=0`; FND-003/GVF-002A is absent. Founder Projection was explicitly refreshed and exposes zero open founder decisions. Supervisor discrepancies contain no FND-003/GVF gate.
- Market Scanner source repair:
  - Celonis moved from dead `/news/press/` to official `https://www.celonis.com/news`.
  - Quid moved from dead `/press/` to official `https://www.quid.com/knowledge-hub/product-releases`.
  - Both return HTTP 200 from the production server and the scanner run verifies them as OK.
  - Gartner remains explicit DEGRADED: production server receives HTTP 403 from Gartner public research/conference pages; no browser-UA spoofing or access-wall bypass is authorized.
  - Latest scan: 12 sources, 11 OK, 1 failing (Gartner), signals_emitted=0, scanner freshness FRESH.
- Radar Opportunities is still legitimately empty. Current Signals API window contains only research signals (50/50); actions are watch/review-atlas/none. The current scanner is market/research sensing, not an opportunity-discovery feed. Do not promote research-watch items into Opportunities just to fill the UI. A separate opportunity-sensing source set is still required for grants/programs/RFPs/partnerships/conference calls or other actionable external windows.
- Current update cadence:
  - open Panel browser re-reads live sources every 90s;
  - Continuity adapter poll ~30s, attention/projection loops ~15s;
  - Mac ICAM outbox transport runs every 120s, but only transports files already emitted into `ICAM_SYNC_OUTBOX`;
  - Founder Projection compiles every 5min;
  - canonical ATLAS State compiles every 60s;
  - Market Scanner runs every 6h;
  - market-signal ingest every 15min, enrichment every 20min.
- Important boundary: ordinary chat activity is not itself a canonical branch-state update. `com.klim.conversations-sync` archives conversations every 120s, but does not create Continuity state events. A branch appears current only after it emits a structured update/event into the canonical transport. Transport is automatic; event creation is not yet universal across branches.

- GVF-002A execution follow-through check: no GVF-specific decision consumer/runner was found on the server, and the generic aiclavis execution dispatcher contains no GVF/Founder-decision binding. Therefore the Panel APPROVE currently records governance truth and resolves the decision lifecycle, but does not itself execute the 120-call forecast run. A separate exact decision-to-owning-branch handoff/dispatch contract is still required before Founder decisions can cause downstream work.
