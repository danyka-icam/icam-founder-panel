# Founder Panel — upstream gates ready

Date: 2026-10-04

## Gate 1 — Agent Registry / Lineage

Status: LIVE CANONICAL UPSTREAM.

Routes:
- `/founder-ui-preview/api/agent-registry`
- `/founder-ui-preview/api/agent-lineage`

Current canonical state:
- `registry_revision = 42`
- `lineage_revision = 43`
- verified canonical nodes: 36
- explicit unresolved lineage gaps: 0
- authority conflicts: 0
- decisions without evidence: 0

The original 18-node census was only a seed. The live authority now contains 36 verified agent identities. The current Lineage snapshot exposes 39 active VERIFIED edges; the authority history contains 41 distinct verified edge identities, with 2 later retracted.

Two old seed edges were not promoted:
- direct `atlas-signals-store -> founder-projections` was superseded by the canonical `atlas-state-authority` path;
- direct `testing-local-runner -> icam-hub` was rejected because the runner has no Hub authority. The verified testing pipeline uses dispatcher/return bridge boundaries.

## Gate 2 — ATLAS State

Status: LIVE CANONICAL UPSTREAM.

Route:
- `/founder-ui-preview/api/atlas-state`

Canonical service: `aiclavis-atlas-state.service`
Current source status: `LIVE`
Operating mode: `PARTIAL_DECLARED_STATE`

Declared live domains:
- ATLAS Signals
- Signal Lab
- ATLAS Activity
- Investment Live Lab

Explicit UNKNOWN domains in v1:
- overall commercial ATLAS state
- frozen/disabled branch registry

These UNKNOWN values must remain unknown in the Panel. Do not reconstruct them from Founder Map, historical files, chat context, or neighboring services.

## Panel instruction

Both upstream availability gates may now be removed. Consume only these read-only same-origin routes and preserve explicit UNKNOWNs. Do not create registry, lineage, authority, ATLAS state, or missing relations in the browser.

## Post-revision network audit

The canonical network was re-audited against live systemd and authority/write boundaries. Ten previously hidden trust-boundary services were promoted to explicit verified nodes (0D staging chain, Continuity boundary services, ICAM Testing API/ingress bridges). Final live checks: 0 service/identity mismatches, 0 dangling edges, 0 isolated nodes.

## Signal Lab hardening

The three Signal Lab canonical nodes were revised in place after HARD-004: runtime identity is now `atlassignallab` rather than root. Subsequent HARD-009/HARD-010 hardening added/updated Testing bridge and retained commercial-service authorities. Current Registry/Lineage revisions are 42/43.
