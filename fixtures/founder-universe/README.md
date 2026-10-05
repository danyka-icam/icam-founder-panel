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

## Shapes (reconciled with the live backend files, 2026-09-30)

Both payloads carry `schema_id` (`atlas-temporal-universe.v0.1`,
`atlas-portfolio-admission.v0.1`). The panel reads `schema_id` first and
rejects a different schema family as an incompatible source.

Temporal Universe
- `worlds[].lines[]`: `id` (graph ID `N-…`), `title`, `branches`, `capital`, `recent_history`
- `branches[]`: `id`, `title`, `canonical_title`, `memory_id`, `verified`, `temporal`
- `temporal`: `{now: {state, truth, valid_from, recorded_at}, waiting: [{id, title, time_class, valid_from, recorded_at}], next_transition: [...], history: [event]}`
  → UI: История ← `history`, Сейчас ← `now.state`, Ждём ← `waiting`, Следующий переход ← `next_transition`
- history event (company_history, recent_history, unresolved_history, temporal.history):
  `{event_id, change, transition, subject, line, world, evidence_count, truth_status, why_it_matters, next_milestone, source_branch, scope, binding_class, target, date}`
  → UI: `change` first, then `why_it_matters`, then `next_milestone`, `date`, and `truth_status · binding_class` as the evidence tag
- `capital`: `[{id, title}]` — shown as proven capital of the line
- `strategic_trajectories[]`: `id, title, status, horizon, north_star, path` and optionally `publication_contour, growth_programs, rule, feeds_back_to, evidence_basis`.
  `path` is a list of human-readable stages; a stage links to a line only on exact title equality.

Portfolio Admission
- `exact_owner_candidates[].proposed_line` is an exact canonical line **title** (matched by exact equality only; the fixture contains one near-miss, `"atlas advisory"`, which must stay unmatched)
- `trusted_owner_map`: `{owning_branch: exact line title}`
- `owner_conflicts`: `{owning_branch: [competing exact line titles]}`

Still assumed (not covered by the reconciliation): `window` as `{from, to, days}`, world keys `id`/`title`, `rules` as a list of strings.
