# Founder Panel ↔ Agent Network Signal Contract v0.1

Status: integration boundary; read-only on Founder Panel side.

## Ownership boundary

Agent Network owns:
- agent identity and Agent Registry;
- authority and forbidden actions;
- signal collection / interpretation / deduplication;
- evidence contract;
- lineage graph;
- agent/runtime health;
- canonical signal state.

Founder Panel owns:
- read-only presentation;
- Founder-level filtering and grouping;
- visual emphasis;
- inspector/navigation;
- no signal creation, no authority mutation, no agent control.

## Non-negotiable rule

No agent writes directly into Founder Panel and Founder Panel never becomes a canonical signal store.

Expected route:
source/event → collector or agent → validation/evidence → canonical signal projection → Founder Radar.

Activity Inbox / Temporal Universe remain valid sources for branch events and dated waiting states. Future agent signals may join the Radar only through a normalized read projection.

## Minimal normalized signal envelope

A future Agent Network signal projection should expose, when known:

- signal_id — stable signal identity;
- title_ru — human title;
- summary_ru — concise human summary;
- signal_class — e.g. MARKET / RESEARCH / COMMERCIAL / INSTITUTIONAL / PREDICTION / REPUTATION;
- state — source lifecycle state;
- observed_at — when observed;
- effective_at — when effective, if different;
- deadline_at / resolve_at / reveal_at — explicit future date when applicable;
- branch_ref / memory_id — exact branch/object identity when proven;
- source_ref — exact source identity;
- agent_id — Registry identity, when an agent participated;
- lineage_id — lineage chain identity, when available;
- evidence_refs / evidence_count — source evidence;
- authority_scope — what the producing agent was allowed to do;
- recommended_action — only if assigned by the source/authorized agent;
- importance_class — only if explicitly produced by the source/authorized rules.

Unknown fields remain unknown. No semantic similarity may invent agent, branch, lineage, authority, or source identity.

## Founder Radar behavior

Signals page contains signals only. Founder decisions/tasks remain in Command Center.

Visual language:
- calm teal = normal observed signal;
- amber/orange = IMPORTANT_NOW;
- coral/red is reserved for an explicit critical state from the source; the panel does not infer crisis.

Until Agent Network exposes importance_class, Radar may use only transparent deterministic presentation rules:
- explicit source action/opportunity state; or
- explicit dated milestone within the configured near-term window; or
- existing source relevance classification.
This presentation tone is not a canonical priority.

## Inspector

Right-side inspector may show:
- why the signal is on Radar;
- source;
- observed/effective/deadline date;
- exact branch context;
- evidence count;
- agent_id;
- lineage_id;
- authority scope;
- source state.

Agent identity / lineage are shown only when the upstream projection supplies exact values.

## Network placement

Signals page does NOT show the agent network topology.
Founder-level network summary belongs to System:
- network healthy;
- authority conflict;
- stalled agent;
- decision without evidence;
- new/unregistered agent/branch;
- network changed.

Deep network detail belongs to Agent Registry / Lineage Graph views.

## Coordination rule for both branches

Before adding a new signal-producing agent:
1. register identity;
2. define authority;
3. define evidence output;
4. define lineage output;
5. define canonical signal envelope;
6. only then expose the read projection to Founder Radar.

This file is the shared integration boundary. Changes to field meaning should be versioned rather than silently reinterpreted.

## System surface for Agent Network

Founder Panel now has a dedicated read-only page `#agents` / «Сеть агентов» under «Инструменты системы».

The page is gated by `FOUNDER_PANEL_UPSTREAM_GATES_CONSUMER_CONTRACT_v0.1.md`. No live Agent Registry / Lineage source exists yet, and the existing registry JSON / census / edge files are audit-schema seeds only.

A future Founder-facing normalized projection may expose summary counts such as `counts.total_agents`, `counts.active_agents`, `counts.degraded_agents`, `counts.stalled_agents`, `counts.unregistered_agents`, `counts.authority_conflicts`, `counts.lineage_gaps`, `counts.decisions_without_evidence`, plus agent/incident views. Those fields are downstream view-model fields, not substitutes for the canonical upstream contract.

Before activation, the canonical registry must expose the exact minimum identity/authority/runtime/evidence fields defined by the upstream-gates consumer contract, and Lineage must exist as a separately owned canonical edge source. Ownership must be resolved upstream; Founder Panel does not choose it.

Rules: systemd process names are not agent identity; service liveness is not network health; semantic similarity is not lineage; action history is not authority; missing lineage/authority/evidence remains unknown. Founder Panel may highlight an upstream incident but never mutate Agent Registry, authority or lineage. Until the gate is explicitly removed by a versioned contract change, the page remains unavailable rather than falling back to inventory or audit artifacts.
