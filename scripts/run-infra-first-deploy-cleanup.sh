#!/usr/bin/env bash
# Targeted destroy after a failed first production deploy (Worker + custom domain only).
# Usage: run-infra-first-deploy-cleanup.sh <previous-worker-version-file>
# Refuses to run unless that file holds the first-deploy marker, and refuses to
# apply a destroy plan that touches anything other than this stack's Worker and domain.
set -euo pipefail

marker_file="${1:?usage: run-infra-first-deploy-cleanup.sh <previous-worker-version-file>}"

umask 077
tmp=$(mktemp -d)
plan="$tmp/destroy.tfplan"
trap 'rm -f "$plan"; rm -rf "$tmp"' EXIT

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

on_err() {
  node "$ROOT/scripts/report-cli-failure.mjs" "run-infra-first-deploy-cleanup" "$1" 2>/dev/null || true
}
trap 'on_err $LINENO' ERR

previous="$(tr -d '\n' <"$marker_file")"
if [ "$previous" != "__NO_PREVIOUS_WORKER__" ]; then
  echo "Refusing first-deploy cleanup: $marker_file does not hold the first-deploy marker (a previous Worker version exists)." >&2
  on_err "marker"
  exit 1
fi

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
tofu -chdir="$ROOT/infra" plan -destroy -input=false \
  -target=cloudflare_workers_custom_domain.coming_soon \
  -target=cloudflare_workers_script.coming_soon \
  -out="$plan"
tofu -chdir="$ROOT/infra" show -json "$plan" | node "$ROOT/scripts/assert-first-deploy-destroy-plan.mjs"
tofu -chdir="$ROOT/infra" apply -auto-approve -input=false "$plan"

echo "OK first-deploy cleanup destroy completed (Worker and custom domain)."
