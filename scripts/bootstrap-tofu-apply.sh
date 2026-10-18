#!/usr/bin/env bash
# Bootstrap apply with local state and Doppler backup (no R2 backend).
set -euo pipefail

node scripts/preflight-bootstrap.mjs
bash scripts/bootstrap-tofu-init.sh
tofu -chdir=infra/bootstrap apply "$@"
bash scripts/bootstrap-state-backup.sh
