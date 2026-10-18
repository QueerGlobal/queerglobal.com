#!/usr/bin/env bash
# Bootstrap apply with local state and Doppler backup (no R2 backend).
set -euo pipefail

dir="$(cd "$(dirname "$0")/.." && pwd)"
bootstrap_dir="${BOOTSTRAP_APPLY_DIR:-$dir/infra/bootstrap}"
apply_started=0
previous_exit_trap=""
if saved_exit=$(trap -p EXIT 2>/dev/null); then
  previous_exit_trap=$(printf '%s' "$saved_exit" | sed -n "s/^trap -- \(.*\) EXIT\$/\1/p")
fi

_on_exit() {
  local code=$?
  if [ "$apply_started" = 1 ]; then
    bash "$dir/scripts/bootstrap-state-backup.sh" "$bootstrap_dir" || true
  fi
  if [ -n "$previous_exit_trap" ]; then
    eval "$previous_exit_trap"
  fi
  exit "$code"
}
trap '_on_exit' EXIT

node "$dir/scripts/preflight-bootstrap.mjs"
bash "$dir/scripts/bootstrap-tofu-init.sh" "$bootstrap_dir"
apply_started=1
set +e
tofu -chdir="$bootstrap_dir" apply "$@"
apply_ec=$?
set -e
bash "$dir/scripts/bootstrap-state-backup.sh" "$bootstrap_dir" || true
if [ "$apply_ec" -ne 0 ]; then
  exit "$apply_ec"
fi
