#!/usr/bin/env bash
# Restore encrypted bootstrap state from Doppler bootstrap config when local file is absent.
set -euo pipefail

bootstrap_dir="${1:-infra/bootstrap}"
state_file="$bootstrap_dir/terraform.tfstate"
project="${TF_VAR_doppler_project:-}"
config="${TF_VAR_doppler_bootstrap_config:-bootstrap}"
first_run="${BOOTSTRAP_FIRST_RUN:-}"

if [ -f "$state_file" ]; then
  exit 0
fi

if [ "$first_run" = "1" ]; then
  if [ -z "$project" ]; then
    echo "BOOTSTRAP_FIRST_RUN=1: no local state; starting without Doppler restore." >&2
    exit 0
  fi
  if ! command -v doppler >/dev/null 2>&1; then
    echo "BOOTSTRAP_FIRST_RUN=1: no local state; Doppler CLI not installed, skipping restore." >&2
    exit 0
  fi
  umask 077
  mkdir -p "$bootstrap_dir"
  if doppler secrets get BOOTSTRAP_STATE_ENCRYPTED --plain -p "$project" -c "$config" >"$state_file" 2>/dev/null; then
    echo "Restored bootstrap state from Doppler ($project/$config) to $state_file."
  else
    echo "BOOTSTRAP_FIRST_RUN=1: no BOOTSTRAP_STATE_ENCRYPTED in Doppler; starting without local state." >&2
    rm -f "$state_file"
  fi
  exit 0
fi

if [ -z "$project" ]; then
  echo "TF_VAR_doppler_project is required to restore bootstrap state (or set BOOTSTRAP_FIRST_RUN=1 for a new bootstrap)." >&2
  exit 1
fi

if ! command -v doppler >/dev/null 2>&1; then
  echo "doppler CLI is required to restore bootstrap state (or set BOOTSTRAP_FIRST_RUN=1 for a new bootstrap)." >&2
  exit 1
fi

umask 077
mkdir -p "$bootstrap_dir"

if doppler secrets get BOOTSTRAP_STATE_ENCRYPTED --plain -p "$project" -c "$config" >"$state_file"; then
  echo "Restored bootstrap state from Doppler ($project/$config) to $state_file."
else
  echo "Failed to restore BOOTSTRAP_STATE_ENCRYPTED from Doppler ($project/$config)." >&2
  rm -f "$state_file"
  exit 1
fi
