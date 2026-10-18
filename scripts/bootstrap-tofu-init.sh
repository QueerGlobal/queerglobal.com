#!/usr/bin/env bash
# Initialize bootstrap OpenTofu backend (local first apply, then R2). No secrets on argv.
set -euo pipefail

umask 077
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

bootstrap_dir="${1:-infra/bootstrap}"
migrate_flag="${BOOTSTRAP_STATE_MIGRATE:-}"

if [ -n "${TF_STATE_BUCKET:-}" ] && [ -n "${TF_STATE_ENDPOINT:-}" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  {
    echo "bucket = \"$TF_STATE_BUCKET\""
    echo "key = \"${BOOTSTRAP_TF_STATE_KEY:-queerglobal-grandkru/bootstrap.tfstate}\""
    echo "region = \"${TF_STATE_REGION:-auto}\""
    echo "endpoint = \"$TF_STATE_ENDPOINT\""
    echo "skip_credentials_validation = true"
    echo "skip_metadata_api_check = true"
    echo "skip_region_validation = true"
  } >"$tmp/backend.hcl"
  if [ "$migrate_flag" = "1" ]; then
    tofu -chdir="$bootstrap_dir" init -backend-config="$tmp/backend.hcl" -migrate-state -input=false
  else
    tofu -chdir="$bootstrap_dir" init -backend-config="$tmp/backend.hcl" -input=false
  fi
else
  tofu -chdir="$bootstrap_dir" init -backend=false -input=false
fi
