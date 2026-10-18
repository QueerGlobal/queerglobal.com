#!/usr/bin/env bash
# Plan the main infra stack for CI (writes plan + stamp under INFRA_CI_PLAN_DIR).
set -euo pipefail

umask 077
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
plan_dir="${INFRA_CI_PLAN_DIR:-}"
if [ -z "$plan_dir" ]; then
  echo "INFRA_CI_PLAN_DIR is required for run-infra-tofu-plan.sh" >&2
  exit 1
fi
if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "run-infra-tofu-plan.sh is for GitHub Actions only." >&2
  exit 1
fi
if [ -z "${GITHUB_RUN_ID:-}" ]; then
  echo "GITHUB_RUN_ID is required for run-infra-tofu-plan.sh" >&2
  exit 1
fi

mkdir -p "$plan_dir"
plan="$plan_dir/tfplan"
stamp="$plan_dir/stamp"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

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
printf '%s\n' "$GITHUB_RUN_ID" >"$stamp"
