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
