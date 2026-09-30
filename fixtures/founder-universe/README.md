# Founder Universe fixtures (synthetic)

Synthetic payloads for the two read-only Founder Universe APIs used by the v2
panel. **Not real company data.** Used by `dev/stand.mjs` for local runs.

| File | Endpoint | Schema |
|---|---|---|
| `temporal-universe.json` | `GET /founder-star-view/api/temporal-universe` | `atlas-temporal-universe.v0.1` |
| `portfolio-admission.json` | `GET /founder-star-view/api/portfolio-admission` | `atlas-portfolio-admission.v0.1` |

Regenerate with `python3 fixtures/founder-universe/generate.py`.

Counts match production-preview at the time of writing:
3 worlds / 16 lines / 24 placed stars / 7 company events / 4 line events /
3 unresolved; memory=113, placed=24, exact_owner_candidates=11,
review_required=78, owner_conflicts=1.

## What is contract, what is assumed

Contract (from the backend summary):
- TU top level: `window`, `company_history`, `worlds`, `strategic_trajectories`, `unresolved_history`, `rules`
- `worlds[].lines[]`: `id`, `title`, `branches`, `capital`, `recent_history`
- `branches[]`: `id`, `title`, `canonical_title`, `memory_id`, `verified`, `temporal`
- Admission top level: `compiled_at`, `counts`, `trusted_owner_map`, `owner_conflicts`, `exact_owner_candidates`, `review_required`, `rules`
- `exact_owner_candidates[]`: `memory_id`, `kind`, `title`, `state`, `evidence_status`, `owning_branch`, `proposed_line`, `basis`
- `review_required[]`: `memory_id`, `kind`, `title`, `state`, `evidence_status`, `owning_branch`, `reason`

Assumed here (the panel reads these tolerantly and shows unknown keys as-is):
- a top-level `schema` string (the panel only rejects a *different* schema family; a missing field is accepted)
- world keys `id`, `title`
- history items `{at, title, kind}`; unresolved items `{at, title, reason}`
- `temporal` as `{past, present, waiting, next}`
- `capital` as a flat object or `null`
- `strategic_trajectories[]` as `{id, title, lines: [line ids], status}`
- `owner_conflicts[]` as `{memory_id, title, owners, reason}`
- `trusted_owner_map` as `{memory_id: {line, world}}`
- `rules` as a list of strings
