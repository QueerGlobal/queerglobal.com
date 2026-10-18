#!/usr/bin/env bash
# Bootstrap apply with local state and Doppler backup (no R2 backend).
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bootstrap_dir="${BOOTSTRAP_APPLY_DIR:-$dir/infra/bootstrap}"
apply_started=0
# Keep any EXIT trap the caller already set and run it after ours. `trap -p` prints
# `trap -- '<command>' EXIT` with shell quoting, so let the shell unquote it.
_trap_command() {
  eval "set -- $1"
  printf '%s' "$3"
}
previous_exit_trap=""
saved_exit="$(trap -p EXIT)"
if [ -n "$saved_exit" ]; then
  previous_exit_trap="$(_trap_command "$saved_exit")"
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
if [ "$apply_ec" -ne 0 ]; then
  exit "$apply_ec"
fi
