#!/usr/bin/env bash
# Apply the main infra stack only from a plan stamped earlier in the same gated workflow run.
set -euo pipefail

umask 077
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

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

apply_ci_plan() {
  local plan_dir="${INFRA_CI_PLAN_DIR:-}"
  local plan stamp tmp
  if [ -z "$plan_dir" ]; then
    echo "INFRA_CI_PLAN_DIR is required for CI apply." >&2
    exit 1
  fi
  if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
    echo "CI apply requires GITHUB_ACTIONS=true." >&2
    exit 1
  fi
  if [ -z "${GITHUB_RUN_ID:-}" ]; then
    echo "GITHUB_RUN_ID is required for CI apply." >&2
    exit 1
  fi
  plan="$plan_dir/tfplan"
  stamp="$plan_dir/stamp"
  if [ ! -f "$plan" ] || [ ! -f "$stamp" ]; then
    echo "Missing plan or stamp under $plan_dir; run run-infra-tofu-plan.sh in this workflow first." >&2
    exit 1
  fi
  if [ "$(cat "$stamp")" != "$GITHUB_RUN_ID" ]; then
    echo "Plan stamp does not match this workflow run; refusing apply." >&2
    exit 1
  fi
  tmp=$(mktemp -d)
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
  if ! tofu -chdir="$ROOT/infra" apply -auto-approve -input=false "$plan"; then
    on_err $LINENO
    exit 1
  fi
  rm -rf "$tmp"
}

if [ -z "${INFRA_CI_PLAN_DIR:-}" ]; then
  echo "Refusing to apply infra outside the gated Deploy production workflow: INFRA_CI_PLAN_DIR must hold a plan stamped by this run." >&2
  exit 1
fi
apply_ci_plan
