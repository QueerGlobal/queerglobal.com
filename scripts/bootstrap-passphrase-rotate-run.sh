#!/usr/bin/env bash
# Run bootstrap passphrase rotation with passphrases loaded only in this process (not the caller's shell).
# Tracing stays off for the whole run, even under bash -x, because this process holds both passphrases.
{ set +x; } 2>/dev/null
set -euo pipefail

if [ -n "${BOOTSTRAP_FIRST_RUN:-}" ]; then
  echo "Rotation needs the existing BOOTSTRAP_STATE_PASSPHRASE; unset BOOTSTRAP_FIRST_RUN so no new passphrase is generated." >&2
  exit 1
fi

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/bootstrap-committed-env.sh
. "$dir/scripts/bootstrap-committed-env.sh"
# shellcheck source=scripts/bootstrap-passphrase-env.sh
. "$dir/scripts/bootstrap-passphrase-env.sh"

project="${TF_VAR_doppler_project:?TF_VAR_doppler_project is required}"
config="${TF_VAR_doppler_bootstrap_config:-bootstrap}"
next_file=""
get_err=""
cleanup() {
  rm -f "${next_file:-}" "${get_err:-}"
}
trap cleanup EXIT

umask 077
next_file="$(mktemp)"
get_err="$(mktemp)"
if ! doppler secrets get BOOTSTRAP_STATE_PASSPHRASE_NEXT --plain -p "$project" -c "$config" >"$next_file" 2>"$get_err"; then
  cat "$get_err" >&2
  echo "BOOTSTRAP_STATE_PASSPHRASE_NEXT must be set in Doppler ($project/$config) before rotation." >&2
  exit 1
fi
rm -f "$get_err"
get_err=""
if [ ! -s "$next_file" ]; then
  echo "BOOTSTRAP_STATE_PASSPHRASE_NEXT in Doppler is empty." >&2
  exit 1
fi

export TF_VAR_bootstrap_state_passphrase_next
TF_VAR_bootstrap_state_passphrase_next="$(<"$next_file")"
rm -f "$next_file"
next_file=""
if [ "$TF_VAR_bootstrap_state_passphrase_next" = "$TF_VAR_bootstrap_state_passphrase" ]; then
  echo "BOOTSTRAP_STATE_PASSPHRASE_NEXT equals the current passphrase; store a new one first." >&2
  exit 1
fi

exec bash "$dir/scripts/bootstrap-passphrase-rotate.sh" "$@"
