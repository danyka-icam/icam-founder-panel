ICAM Founder Panel — Public Handoff

Current as of: 2026-08-31
 
Repository and branches

- Repository: `github.com/danyka-icam/icam-founder-panel`
- Repository visibility: **public**
- `main` = production branch
- `panel-v2` = current v2 development branch
- Push/merge to `main` triggers the existing production deployment workflow.
- Work in `panel-v2` must not be treated as production until Founder review and merge.

Repository structure

Current production workbench:
- `registry/` — older scaffold / reference material
- `final/` — current production Founder Panel frontend
- `.github/workflows/deploy.yml` — production deploy workflow
- `smoke.mjs` — production browser smoke check

Founder Panel v2 is being built separately so current production remains stable.

Safe operating boundary

This repository owns the Founder Panel frontend and its read-only presentation logic.

Normal frontend work may include:
- HTML
- CSS
- JavaScript
- shared shell/navigation
- read-only API consumption
- Founder-facing information architecture
- browser-side diagnostics

This repository does **not** grant authority to:
- change backend service semantics
- change canonical research state
- widen system authority
- modify infrastructure configuration
- expose credentials
- create a second truth store

Any backend/network/auth/infrastructure change requires the appropriate owning system and approval path.

Production deployment

The existing GitHub Actions workflow deploys only from `main`.

Normal safe flow:

`panel-v2 → review → PR → Founder acceptance → merge to main → deploy → smoke check`

Do not edit production directly during v2 work.

Source map

Founder Panel uses same-origin read paths under:

`/founder-ui-preview/api/...`

Primary source systems:

| Founder Panel area | Frontend source | Same-origin API family | Source system |
|---|---|---|---|
| Home / Foundation / Registry | `panel-live.js`, `semantic.js`, `live3.js` | `continuity/*`, `continuity-health` | Continuity |
| Research | `research-live.js` | `continuity/objects`, `continuity/blockers`, `continuity/rd1-projection/*` | Continuity / RD1 projection |
| Operations / Orchestrator read surface | `ops-live.js` + v2 adapters | `observer/routes`, `observer/metrics`, `observer/summary` | Orchestrator / Observer |
| Documents | `docs-live.js` | `hub/sync-health` | ICAM Hub |
| Testing | `testing-live.js` | `testing/*`, `testing-health`, `testing-runner-health` | ICAM Testing |
| Shared trust / UI | `truth-guard.js`, `trust-contract.js`, `panel-*.js`, CSS | presentation only | no new truth source |

All new v2 data wiring must continue to use explicit source ownership and freshness.

Founder Panel v2 direction

The existing `final/` workbench remains intact while v2 is built in parallel.

v2 principles:
- live-first, not mock-first
- no plausible current-state facts embedded in static HTML
- one data client
- one writer per UI zone
- shared shell
- shared state vocabulary
- compact unavailable/degraded states
- detail drawer for depth
- RU-first Founder semantics
- no authority widening

Planned top-level v2 navigation:

1. Главная
2. Оркестратор
3. Фундамент
4. Исследования
5. ATLAS
6. Digital Twin
7. BrazilPortal
8. Операции
9. Реестр
10. Сигналы
11. Документы
12. Тестирование
13. Диагностика

Known product boundary

Founder Panel is a Founder-facing read/decision surface.

Local product state may exist in owning systems such as Orchestrator route memory, but Founder Panel itself must not become a parallel canonical database.

Consequential/canonical writes continue through the existing authority/approval path.

Review rule

A green browser smoke check confirms technical loading only.

Founder Panel is not considered daily-use ready until:
- required live sources are trustworthy,
- key screens are semantically clear,
- no fake current-state data is visible,
- Founder visually accepts the production interface.
