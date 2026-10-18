#!/usr/bin/env bash
# Back up encrypted local bootstrap state to Doppler bootstrap config (stdin, not argv).
set -euo pipefail

# shellcheck source=scripts/bootstrap-committed-env.sh
. "$(cd "$(dirname "$0")/.." && pwd)/scripts/bootstrap-committed-env.sh"

bootstrap_dir="${1:-infra/bootstrap}"
state_file="$bootstrap_dir/terraform.tfstate"
project="${TF_VAR_doppler_project:-}"
config="${TF_VAR_doppler_bootstrap_config:-bootstrap}"

if [ ! -f "$state_file" ]; then
  echo "Bootstrap state file missing; backup refused: $state_file" >&2
  exit 1
fi

if [ -z "$project" ]; then
  echo "TF_VAR_doppler_project is required to back up bootstrap state." >&2
  exit 1
fi

if ! command -v doppler >/dev/null 2>&1; then
  echo "doppler CLI is required to back up bootstrap state." >&2
  exit 1
fi

if ! doppler secrets set BOOTSTRAP_STATE_ENCRYPTED -p "$project" -c "$config" <"$state_file"; then
  echo "Bootstrap state backup to Doppler failed; local state kept at $state_file" >&2
  exit 1
fi
echo "Backed up bootstrap state to Doppler ($project/$config) as BOOTSTRAP_STATE_ENCRYPTED."
