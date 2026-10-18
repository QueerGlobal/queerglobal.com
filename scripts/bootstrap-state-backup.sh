#!/usr/bin/env bash
# Back up encrypted local bootstrap state to Doppler bootstrap config (stdin, not argv).
set -euo pipefail

bootstrap_dir="${1:-infra/bootstrap}"
state_file="$bootstrap_dir/terraform.tfstate"
project="${TF_VAR_doppler_project:-}"
config="${TF_VAR_doppler_bootstrap_config:-bootstrap}"

if [ ! -f "$state_file" ]; then
  echo "No bootstrap state at $state_file; skip backup." >&2
  exit 0
fi

if [ -z "$project" ]; then
  echo "TF_VAR_doppler_project is required to back up bootstrap state." >&2
  exit 1
fi

if ! command -v doppler >/dev/null 2>&1; then
  echo "doppler CLI is required to back up bootstrap state." >&2
  exit 1
fi

cat "$state_file" | doppler secrets set BOOTSTRAP_STATE_ENCRYPTED -p "$project" -c "$config"
echo "Backed up bootstrap state to Doppler ($project/$config) as BOOTSTRAP_STATE_ENCRYPTED."
