#!/usr/bin/env bash
# Initialize bootstrap OpenTofu (local backend) and restore state from Doppler when missing.
set -euo pipefail

# shellcheck source=scripts/bootstrap-committed-env.sh
. "$(cd "$(dirname "$0")/.." && pwd)/scripts/bootstrap-committed-env.sh"

bootstrap_dir="${1:-infra/bootstrap}"
state_file="$bootstrap_dir/terraform.tfstate"

bash scripts/bootstrap-state-restore.sh "$bootstrap_dir"

tofu -chdir="$bootstrap_dir" init -input=false

if [ ! -f "$state_file" ]; then
  echo "No local bootstrap state at $state_file (restore from Doppler returned nothing)." >&2
fi
