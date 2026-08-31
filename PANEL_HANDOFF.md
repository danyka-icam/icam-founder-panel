# ICAM Founder Panel — Handoff

One-time handoff so this panel's visual/product work can continue without pulling Klim off BrazilPortal. Everything below is current as of 2026-08-31.

## Repo / branch

- **Repo**: `github.com/danyka-icam/icam-founder-panel` (private)
- **Branch**: `main` — this is also production. There is no separate staging branch; deploy = push to `main` locally, then run `./deploy.sh`.
- **Contents**: `registry/` (older scaffold, kept but not actively used) and `final/` (the live 9-screen workbench — this is what you'll be editing).

Until this handoff, these files lived ONLY on the server (`/opt/icam/preview/founder-ui-preview/`, no git anywhere) — this repo is the first version-controlled copy.

## Production

- **Public URL**: `https://console.attentionmechanics.institute/founder-ui-preview/final/index.html` (HTTP Basic Auth, separate creds from the main Research Console — ask Niki)
- **Server path**: `/opt/icam/preview/founder-ui-preview/` on `klim-new` (187.127.32.207)
- **Server role**: served directly by nginx from disk as static files (`icam-preview.conf`, loopback `127.0.0.1:8083`, publicly reverse-proxied by `console.attentionmechanics.institute`'s nginx block in `icam.conf`).

## Deploy (no restart needed)

Because these are static files read straight off disk on every request, **deploying is just copying files — nginx never needs a restart or reload for content changes.**

```
brew install rsync    # one-time, macOS ships an incompatible rsync by default
git clone https://github.com/danyka-icam/icam-founder-panel
cd icam-founder-panel
# place icam_panel_deploy_key here (provided separately, not in the repo)
./deploy.sh
```

That's it. Refresh the production URL to see the change.

**Rollback**: `git checkout <older-commit-or-tag> -- registry final && ./deploy.sh`, then commit. Rollback is just deploying an older tree — there's no separate rollback path to learn.

## Scoped deploy access (no root, no shell)

A dedicated OS user, `icam-panel-deploy`, was created on the server specifically for this:

- **Can do**: rsync files into/out of `/opt/icam/preview/founder-ui-preview/` only.
- **Cannot do**: anything else. No shell (SSH forced-command via `rrsync`, `restrict` flag), no sudo, no access to any other path, no systemctl, nothing. Verified: an interactive SSH session with this key gets refused a shell outright.
- The private key is **not in this repo** — Klim is sending it to Niki separately. Treat it like a password: it's the entire access grant.

If you ever need to change the **nginx config itself** (a genuinely new backend/API route, not just editing existing screens) — that's a root-only step outside this key's scope. Ping Klim or Niki for that specific change; everything else (HTML/CSS/JS on the 9 screens, including the live-data wiring) is yours to edit freely.

## Map: screen → JS file → API path → backend service

Every screen's "live" data goes through the SAME nginx layer (`icam-preview.conf`, GET-only enforced — `limit_except GET { deny all; }` on every one of these locations, independent of what the backend itself would allow). No screen currently talks to anything write-capable.

| Screen | File | Calls (`/founder-ui-preview/api/...`) | Real backend | systemd unit |
|---|---|---|---|---|
| Home | `panel-live.js` | `continuity/founder-inbox`, `continuity-health` | Continuity CORE | `context-steward.service` (:8793) |
| Research | `research-live.js` | `continuity/blockers`, `continuity/objects`, `continuity/rd1-projection/` | Continuity CORE | `context-steward.service` (:8793) |
| Operations | `ops-live.js` | `observer/metrics`, `observer/routes`, `observer/summary` | ICAM Observer | `icam-observer.service` (:8789) |
| Documents | `docs-live.js` | `hub/sync-health` | ICAM Hub API | `icam-hub-api.service` (:8788) |
| Testing | `testing-live.js` | `testing/summary`, `testing/tests`, `testing/lineage/`, `testing-health`, `testing-runner-health`, `continuity/objects` | ICAM Testing API + runner | `icam-testing-api.service` (:8801), `icam-testing-local-runner.service` (:8802) |
| Foundation, Signals, Settings, +1 more | `live3.js` | reuses all of the above (`continuity/*`, `observer/*`, `hub/sync-health`, `testing/*`) — no new backend surface | (same four services) | (same as above) |
| Everything else (nav shell, layout, cards) | `app.js`, `panel-*.js`, `*.css`, `truth-guard.js`, `trust-contract.js`, `semantic.js` | none (pure visual/shell logic) | — | — |

**Not wired yet** (shipped as mock, intentionally — see comments in `app.js` and the two collapsed home-screen cards): "ПРИОРИТЕТЫ RD1", "РАДАР", the "Карта роста ICAM" and "BrazilPortal — живой слой" home-screen blocks. These are real, open product-buildout items, not accidental gaps.

## Render check (done as part of this handoff, 2026-08-31)

Loaded the live production URL headlessly (Playwright, via the server's own `icam-panel-watchdog` tooling): **0 JS console errors**, live cards populate with real current data (e.g. Steward integrity index, a real Research Hub sync-health alert). Screenshot kept for reference.

One small honesty gap found and left for you to fix: the page footer still says *"BROWSER WORKBENCH • mock data only • visual layer only"* — no longer fully true now that several screens are live-wired. Small copy fix, not urgent.

## What Klim still owns

- The **live production backend services** themselves (Continuity, Observer, Hub, Testing) — this handoff only covers the panel's own frontend files and its read-only wiring to them.
- Any change to the **nginx config** (new proxy routes, new screens needing a new backend connection).
- The write-capable path (`context-steward-actions`) is not exposed to this panel at all and is out of scope here.
