#!/usr/bin/env bash
# Plan and apply the main infra stack. Requires secrets in the environment (Doppler run).
set -euo pipefail

umask 077
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmp=$(mktemp -d)
plan="$tmp/tfplan"
trap 'rm -f "$plan"; rm -rf "$tmp"' EXIT

on_err() {
  node "$ROOT/scripts/report-cli-failure.mjs" "run-infra-tofu-apply" "$1" 2>/dev/null || true
}
trap 'on_err $LINENO' ERR

test -n "${CLOUDFLARE_API_TOKEN:-}"
test -n "${CLOUDFLARE_ACCOUNT_ID:-}"
test -n "${TF_STATE_BUCKET:-}"
test -n "${TF_STATE_ENDPOINT:-}"
test -n "${AWS_ACCESS_KEY_ID:-}"
test -n "${AWS_SECRET_ACCESS_KEY:-}"

export TF_VAR_cloudflare_account_id="$CLOUDFLARE_ACCOUNT_ID"
if [ -n "${AWS_SESSION_TOKEN:-}" ]; then
  export AWS_SESSION_TOKEN
fi

{
  echo "bucket = \"$TF_STATE_BUCKET\""
  echo "key = \"${TF_STATE_KEY:-queerglobal-grandkru/terraform.tfstate}\""
  echo "region = \"${TF_STATE_REGION:-auto}\""
  echo "endpoint = \"$TF_STATE_ENDPOINT\""
  echo "skip_credentials_validation = true"
  echo "skip_metadata_api_check = true"
  echo "skip_region_validation = true"
} >"$tmp/backend.hcl"

tofu -chdir="$ROOT/infra" init -backend-config="$tmp/backend.hcl" -input=false
tofu -chdir="$ROOT/infra" validate -no-color
tofu -chdir="$ROOT/infra" plan -input=false -out="$plan"
tofu -chdir="$ROOT/infra" apply -auto-approve -input=false "$plan"
