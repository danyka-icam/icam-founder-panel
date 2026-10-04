# Founder Panel — Upstream Gates Consumer Contract v0.2

Date: 2026-10-04
Status: ACTIVE CONSUMER BOUNDARY
Scope: panel-v2 only.

This version supersedes v0.1 for current integration state.

## Gate 1 — Agent Registry / Lineage

State: RESOLVED FOR READ-ONLY FOUNDER CONSUMPTION.

Canonical owner: AICLAVIS Agent Registry Authority.
Lineage is a separate logical authority in the same v1 service package with an independent append-only revision lifecycle.

Verified current source properties:
- canonical Agent Registry service is live;
- registry snapshot is live and versioned;
- Lineage snapshot is live and versioned;
- seed records are not rendered directly;
- Founder projection contains verified agents only;
- lineage snapshot contains verified edges only;
- registry and lineage revisions are separate;
- unknown fields remain unknown;
- browser mutation is forbidden.

Founder Panel may consume only:
- normalized Founder projection for agent identity/state/authority/counts;
- verified Lineage snapshot for explicit source_id → relation → target_id edges.

The panel MUST NOT:
- read bootstrap census/seed files as live state;
- infer agent identity from service/process names;
- infer authority from observed behavior;
- infer ancestry from call order or semantic similarity;
- write Registry or Lineage state.

A non-zero `lineage_gaps` is a live network condition, not a reason to mark the entire source unavailable.

Current panel read-model contract remains defined in `FOUNDER_PANEL_UPSTREAM_SOURCE_CONTRACTS.md`.

## Gate 2 — ATLAS own state

State: UNRESOLVED / `NO_ATLAS_STATE_SOURCE`.

Existing ATLAS-related sources remain valid only inside their declared domains. ATLAS signal state, observer/research runtime state, commercial workflow state and Founder-facing projections must not be silently merged into one canonical ATLAS state.

Before Gate 2 may be removed, upstream must define ownership and semantics and expose a versioned authoritative source with the fields already listed in v0.1.

## Change control

Gate 1 was removed only after canonical ownership was selected, the service was deployed, verified registry and lineage revisions existed, and the read-only Founder projection was live.

Gate 2 remains protected by the original no-inference rules.
