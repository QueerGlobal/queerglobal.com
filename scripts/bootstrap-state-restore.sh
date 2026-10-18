#!/usr/bin/env bash
# Restore encrypted bootstrap state from Doppler bootstrap config when local file is absent.
set -euo pipefail

bootstrap_dir="${1:-infra/bootstrap}"
state_file="$bootstrap_dir/terraform.tfstate"
project="${TF_VAR_doppler_project:-}"
config="${TF_VAR_doppler_bootstrap_config:-bootstrap}"

if [ -f "$state_file" ]; then
  exit 0
fi

if [ -z "$project" ]; then
  echo "No local bootstrap state; skipping Doppler restore (TF_VAR_doppler_project unset)." >&2
  exit 0
fi

if ! command -v doppler >/dev/null 2>&1; then
  echo "No local bootstrap state; skipping Doppler restore (doppler CLI not installed)." >&2
  exit 0
fi

umask 077
mkdir -p "$bootstrap_dir"

if doppler secrets get BOOTSTRAP_STATE_ENCRYPTED --plain -p "$project" -c "$config" >"$state_file" 2>/dev/null; then
  echo "Restored bootstrap state from Doppler ($project/$config) to $state_file."
else
  echo "No BOOTSTRAP_STATE_ENCRYPTED in Doppler ($project/$config); starting without local state."
  rm -f "$state_file"
fi
