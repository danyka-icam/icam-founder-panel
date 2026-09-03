#!/usr/bin/env bash
# Deploy the ICAM Founder Panel workbench to production.
#
# Requires GNU rsync (macOS ships BSD/openrsync by default — install with
# `brew install rsync` first; Linux/CI already has GNU rsync).
#
# Usage:
#   ./deploy.sh              # deploy current working tree (registry/ + final/ + v2/)
#
# Rollback: `git checkout <older-commit> -- registry final && ./deploy.sh`,
# then commit the revert. There is no separate rollback mechanism because
# deploy is just a file sync — any git state can be redeployed the same way.
#
# This uses a dedicated, restricted deploy key (icam_panel_deploy_key, kept
# out of this repo — provided separately). The key can ONLY rsync into
# /opt/icam/preview/founder-ui-preview on the server (enforced server-side by
# `rrsync` in authorized_keys — see PANEL_HANDOFF.md). It has no shell access,
# no sudo, and cannot reach anything outside that one directory.
#
# No service restart is needed: these are static files served directly by
# nginx from disk. If the nginx config itself ever needs to change (new API
# proxy route, new screen needing a new backend), that is a separate,
# root-only step — not part of this script. See PANEL_HANDOFF.md.

set -euo pipefail
cd "$(dirname "$0")"

KEY="${ICAM_PANEL_DEPLOY_KEY:-./icam_panel_deploy_key}"
HOST="${ICAM_PANEL_DEPLOY_HOST:-icam-panel-deploy@187.127.32.207}"

if [ ! -f "$KEY" ]; then
  echo "Deploy key not found at $KEY (set ICAM_PANEL_DEPLOY_KEY or place the key next to this script)." >&2
  exit 1
fi
chmod 600 "$KEY"

echo "Deploying registry/ + final/ + v2/ to production..."
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  registry/ "$HOST":registry/
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  final/ "$HOST":final/
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  v2/ "$HOST":v2/

echo "Done. Verify: https://console.attentionmechanics.institute/founder-ui-preview/final/index.html"
echo "       and:   https://console.attentionmechanics.institute/founder-ui-preview/v2/index.html"
