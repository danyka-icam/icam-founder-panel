# Founder Panel — Upstream Gates Consumer Contract v0.3

Date: 2026-10-04
Status: ACTIVE CONSUMER BOUNDARY
Scope: panel-v2 only.

This version supersedes v0.2 for current integration state.

## Gate 1 — Agent Registry / Lineage

State: RESOLVED FOR READ-ONLY FOUNDER CONSUMPTION.

Canonical owner: AICLAVIS Agent Registry Authority.
Lineage remains a separate logical authority in the same service package.
Founder Panel consumes only the approved read-only Founder projection and verified Lineage projection.

All v0.2 non-inference and no-write rules remain active.

## Gate 2 — ATLAS own state

State: RESOLVED FOR READ-ONLY FOUNDER CONSUMPTION.

Canonical source authority:
- authority_id: `aiclavis-atlas-state`
- authority_class: `CANONICAL_CROSS_DOMAIN_READ_MODEL`
- semantic_owner: `ATLAS_STATE_CANON_V1`

Contract:
- `aiclavis.atlas-state.v1`
- version `1.0.0`
- read-only

Verified acceptance state:
- real live payload passes `dev/upstream-gate-check.mjs atlas-state`;
- all 13 required Gate-2 fields are present;
- source status is LIVE;
- operating mode is `PARTIAL_DECLARED_STATE`;
- unknown domain state remains UNKNOWN/null rather than being inferred;
- semantic freshness is domain-specific and HTTP response time is not substituted;
- canonical state and Founder projection are separate exposure boundaries.

### Required browser boundary

Founder Panel MUST consume only the approved same-origin sanitized Founder projection.

The browser MUST NOT receive:
- internal service coordinates;
- canonical service host/port details;
- internal evidence URLs;
- secrets or write capabilities.

The sanitized Founder projection may replace internal evidence locations with stable logical `evidence_ref_id` values while preserving domain, authority and evidence identity.

### Domain separation remains mandatory

The canonical ATLAS state may aggregate only declared authorities and must keep these domains distinguishable:
- signal pipeline;
- research / experiment state;
- investment live-lab state;
- commercial state;
- frozen / disabled branch registry;
- blockers and decisions/gates;
- Founder-facing derived projections.

A domain may be LIVE while another is DEGRADED or UNAVAILABLE. Founder Panel must not collapse that into a fabricated global health value.

### Current honest partials

At Gate-2 activation:
- signal pipeline exists, but semantic freshness is DEGRADED because latest signal semantic time is not exposed by its health surface;
- research state is LIVE/RUNNING;
- investment live lab is live shadow state with a pending review distinct from a committed decision;
- commercial canonical source remains UNKNOWN / not declared;
- frozen/disabled branch registry remains UNKNOWN / not declared.

These partials do not invalidate Gate 2. They are part of the canonical `PARTIAL_DECLARED_STATE` model.

## Browser write boundary

Resolving either gate does not grant browser write authority.
Founder Panel remains a read surface except for separately authorized bounded Founder action paths already covered by their own contracts.

## Change control

Any future replacement of Agent Registry authority, Lineage authority, ATLAS State Authority, or their projection semantics requires a versioned contract change and regression tests. A new endpoint alone is not sufficient evidence of authority.
