#!/usr/bin/env bash
# Load TF_VAR_bootstrap_state_passphrase from the bootstrap Doppler config, or create it on first run.
# Keep the passphrase out of xtrace output even when the caller runs with set -x.
_passphrase_xtrace=0
case "$-" in *x*) _passphrase_xtrace=1 ;; esac
{ set +x; } 2>/dev/null
set -euo pipefail

_self="${BASH_SOURCE[0]:-$0}"
dir="$(cd "$(dirname "$_self")/.." && pwd)"
project="${TF_VAR_doppler_project:-}"
config="${TF_VAR_doppler_bootstrap_config:-bootstrap}"
first_run="${BOOTSTRAP_FIRST_RUN:-}"
pass_file=""

get_err=""
cleanup() {
  rm -f "${pass_file:-}" "${get_err:-}"
}
_sourced=0
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  _sourced=1
else
  trap cleanup EXIT
fi

if [ -z "$project" ]; then
  echo "TF_VAR_doppler_project is required to load the bootstrap state passphrase." >&2
  exit 1
fi
if ! command -v doppler >/dev/null 2>&1; then
  echo "doppler CLI is required to load the bootstrap state passphrase." >&2
  exit 1
fi

umask 077
pass_file="$(mktemp)"
get_err="$(mktemp)"
get_code=0
if doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain -p "$project" -c "$config" >"$pass_file" 2>"$get_err"; then
  :
else
  get_code=$?
fi
if [ -s "$pass_file" ]; then
  :
elif [ "$first_run" = "1" ] && node "$dir/scripts/lib/doppler-secret-missing.mjs" "$get_err" "$get_code" BOOTSTRAP_STATE_PASSPHRASE; then
  node "$dir/scripts/bootstrap-generate-passphrase.mjs" | doppler secrets set BOOTSTRAP_STATE_PASSPHRASE -p "$project" -c "$config"
  doppler secrets get BOOTSTRAP_STATE_PASSPHRASE --plain -p "$project" -c "$config" >"$pass_file"
elif [ "$first_run" = "1" ]; then
  cat "$get_err" >&2
  echo "Refusing to generate BOOTSTRAP_STATE_PASSPHRASE: Doppler get failed for a reason other than a missing secret." >&2
  cleanup
  exit 1
else
  cat "$get_err" >&2
  echo "BOOTSTRAP_STATE_PASSPHRASE is missing in Doppler ($project/$config); set BOOTSTRAP_FIRST_RUN=1 for a new bootstrap." >&2
  cleanup
  exit 1
fi
rm -f "$get_err"

if [ ! -s "$pass_file" ]; then
  echo "Bootstrap state passphrase in Doppler is empty." >&2
  cleanup
  exit 1
fi

export TF_VAR_bootstrap_state_passphrase
TF_VAR_bootstrap_state_passphrase="$(<"$pass_file")"
if [ "$_sourced" = 1 ]; then
  rm -f "$pass_file"
  pass_file=""
fi
if [ "$_passphrase_xtrace" = 1 ]; then
  set -x
fi
