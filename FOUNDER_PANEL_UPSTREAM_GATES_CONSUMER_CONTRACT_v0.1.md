# Founder Panel — Upstream Gates Consumer Contract v0.1

Date: 2026-10-03
Status: ACTIVE CONSUMER BOUNDARY
Scope: panel-v2 only.

This contract consumes the agent-network handoff `FOUNDER_PANEL_UPSTREAM_GATES_HANDOFF_2026-10-03.md`.
It does not create upstream ownership and does not promote audit artifacts into live canonical state.

`FOUNDER_PANEL_UPSTREAM_SOURCE_CONTRACTS.md` is a separate downstream contract: it defines the normalized read-only shape consumed by Founder Panel after a gate is resolved. Its fields do not become canonical truth merely because the panel can render them.

Required layering:

`canonical upstream → normalized server projection → Founder Panel`.

## Gate 1 — Agent Registry / Lineage

Current state: UNRESOLVED / NOT AVAILABLE.

The existing `AGENT_REGISTRY_v0.1` and network census/edge artifacts are schema/audit seeds only.
Founder Panel MUST NOT treat those files, systemd inventory, process/service names, receipts, transport identities, or semantic similarity as canonical Agent Registry or Lineage.

Before the panel may activate a live Agent Network source, upstream must provide a versioned canonical source with resolved ownership.

Minimum canonical Agent Registry fields:

- `agent_id`
- `name`
- `kind`
- `owner_branch`
- `runtime_identity`
- `service_or_runtime`
- `status`
- `version/release`
- `authority_class`
- `canonical_write_scope`
- `approval_requirement`
- `input_channels`
- `output_channels`
- `evidence_contract`
- `parent_lineage_sources`
- `downstream_consumers`
- `health/last_execution`

Lineage is a separate canonical edge source, minimum fields:

- `source_id`
- `target_id`
- `relation`
- `gate_or_evidence`
- `observed_at`
- `version/source`

Ownership is explicitly unresolved. The panel must not choose between ICAM Hub ownership and a separate canonical Agent Registry service.

Panel activation rule:
- absent canonical source => render unavailable/unknown;
- no fallback from service inventory;
- no inferred lineage;
- no inferred authority;
- no browser mutation of registry, authority, or lineage.

A later normalized Founder projection may derive counts/incidents from the canonical sources, but only after those sources exist and the derivation is explicit.

## Gate 2 — ATLAS own state

Current state: `NO_ATLAS_STATE_SOURCE`.

Existing ATLAS-related sources are valid only inside their declared domains:
- `atlas-signals` — signal-store / signal-pipeline state;
- Signal Lab — module-local observer/research runtime state;
- Founder Map and related services — derived Founder-facing projections.

They MUST NOT be merged or promoted into an inferred overall ATLAS state.

Before the panel may render canonical ATLAS state, upstream must define the semantics and expose an authoritative versioned source with at least:

- `atlas_state_version`
- `generated_at`
- `source_authority`
- `operating_mode`
- `active_modules`
- `signal_pipeline_health`
- `research_runs_active`
- `commercial_runs_active`
- `frozen_or_disabled_branches`
- `current_blockers`
- `current_decisions_or_gates`
- `evidence_refs`
- `freshness`

The source contract must keep these domains distinct:
1. ATLAS signal state;
2. research / experiment state;
3. commercial workflow state;
4. Founder-facing derived projections.

Panel activation rule:
- no authoritative source => keep `NO_ATLAS_STATE_SOURCE`;
- Hub documents are not current state;
- signal-store state is not overall ATLAS state;
- observer state is not overall ATLAS state;
- Founder projections are not canonical ATLAS state.

## Safe sources before gate resolution

Founder Panel may continue consuming:
- declared Founder read projections;
- ICAM Hub read/review APIs inside their declared authority;
- ATLAS signal store only under explicit signal-domain labeling;
- execution/supervisor projections as derived state.

These permissions do not resolve either upstream gate.

## Change control

Removing either gate requires an explicit versioned contract change plus tests.
A new endpoint alone is not sufficient evidence of canonical ownership.
