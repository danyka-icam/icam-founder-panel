# ATLAS State → Founder Panel Gate 2 return

Date: 2026-10-04
Status: DEPLOYED / SHAPE_PASS / SEMANTICALLY_PARTIAL

## Authority

Canonical source authority:
- authority_id: `aiclavis-atlas-state`
- class: `CANONICAL_CROSS_DOMAIN_READ_MODEL`
- semantic owner: `ATLAS_STATE_CANON_V1`

The authority may aggregate only declared canonical domain sources.
It must preserve UNKNOWN/null and must not infer state from absence.
It does not replace domain authorities.

## Contract

Contract: `aiclavis.atlas-state.v1`
Version: `1.0.0`
Read-only: true

Canonical endpoint:
`http://127.0.0.1:8845/api/v1/atlas-state`

Contract endpoint:
`http://127.0.0.1:8845/api/v1/atlas-state/contract`

Founder projection endpoint:
`http://127.0.0.1:8845/api/v1/founder-projection`

Required Gate 2 fields are present:
- atlas_state_version
- generated_at
- source_authority
- operating_mode
- active_modules
- signal_pipeline_health
- research_runs_active
- commercial_runs_active
- frozen_or_disabled_branches
- current_blockers
- current_decisions_or_gates
- evidence_refs
- freshness

## Deploy

Service: `aiclavis-atlas-state.service`
Status: active
Collector: `aiclavis-atlas-state-collector.timer`
Canonical revision observed during handoff: 3
Source status: LIVE
Operating mode: PARTIAL_DECLARED_STATE

## Domain boundaries

### Signal pipeline
Authority: `atlas-signals`
Current state: LIVE
Stored signals: 110
Semantic freshness: DEGRADED because the current health endpoint does not expose the semantic time of the latest signal. HTTP response time is not used as a substitute.

### Research
Authority: `signal-lab`
Current state: RUNNING
Phase: `GLOBAL_COMPARATIVE_EXPANSION`
Current stage: `FREEZE_GLOBAL_UNIVERSE` / IN_PROGRESS
Next gate: `GLOBAL_UNIVERSE_FREEZE`
Founder action required: false
Semantic freshness: LIVE from Signal Lab `generated_at`.

### Investment Live Lab
Authority: `investment-live-lab`
State: LIVE_SHADOW
Current committed architecture: `ATLAS_INVESTMENT_DECISION_LAYER_V0_2`
Last decision architecture: `ATLAS_INVESTMENT_DECISION_LAYER_V0_4_2`
Last decision: `NO_CHANGE`
Decision cycle committed: 2
Current watcher state: `REVIEW_REQUIRED`
Pending review cycle: 3
Important: pending review is not a committed investment decision.
Semantic freshness basis: last committed decision time plus separately reported evidence-feed state.

### Commercial
State: UNKNOWN
Authority: null
Reason: `NO_DECLARED_CANONICAL_SOURCE`
No reconstruction from historical activity events is allowed.

### Frozen / disabled branches
State: UNKNOWN
Reason: `NO_DECLARED_CANONICAL_SOURCE`
Absence of activity is not treated as freeze.

## Current decisions / gates

- research → GATE → `GLOBAL_UNIVERSE_FREEZE`
- investment-lab → GATE → `prospective evidence accumulation`
- investment-lab → DECISION_REVIEW → `REVIEW_REQUIRED` → cycle 3

## Freshness policy

Freshness is semantic freshness of the authoritative source/domain.
HTTP response time is never substituted for semantic freshness.

Status vocabulary:
- LIVE
- DEGRADED
- STALE
- UNAVAILABLE

Current domain status:
- signal_pipeline: DEGRADED (semantic event timestamp not exposed)
- research: LIVE
- investment: LIVE
- commercial: UNAVAILABLE
- freeze_registry: UNAVAILABLE

## Gate check

The payload file `dev/atlas_state_payload_gate2.json` contains all required `atlas-state` fields.
Independent field-presence check: PASS.

The panel-side Node validator could not execute on the Mac because the local Node binary currently has a missing `libllhttp.9.3.dylib` dependency. This is an environment failure, not a payload/schema failure.

## Files for panel-v2

- `dev/atlas_state_payload_gate2.json` — real live payload
- `dev/atlas_state_contract_v1.json` — read-only contract
- `dev/ATLAS_STATE_GATE2_RETURN_2026-10-04.md` — this handoff

## Projection boundary

Founder Panel must consume a server-side read-only projection of this canonical source.
The browser must not reconstruct missing ATLAS state from signal store, Signal Lab, activity history, systemd, or Founder Map.
