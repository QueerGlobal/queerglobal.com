#!/usr/bin/env bash
# End-to-end: clean bootstrap dir, init script, then mock plan (first apply path without remote backend).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp -a "$root/infra/bootstrap/." "$work/bootstrap/"
rm -f "$work/bootstrap/terraform.tfstate" "$work/bootstrap/terraform.tfstate.backup"
rm -rf "$work/bootstrap/.terraform"

export TF_VAR_cloudflare_account_id=00000000000000000000000000000001
export TF_VAR_github_token=ghp_mock_bootstrap_token_000000000000
export TF_VAR_doppler_management_token=dp.pt.mock_management_token_000000000000
export TF_VAR_doppler_project=queerglobal
export TF_VAR_doppler_config=prd
export TF_VAR_doppler_bootstrap_config=bootstrap
export TF_VAR_production_reviewer_usernames='["octocat"]'
export TF_VAR_bootstrap_state_passphrase=mock-bootstrap-passphrase-for-ci

bash "$root/scripts/bootstrap-tofu-init.sh" "$work/bootstrap"

log="$work/first-apply-e2e.log"
tofu -chdir="$work/bootstrap" test -filter=mock.tofutest.hcl -concise 2>&1 | tee "$log"

grep -q 'run "plan_mock"... pass' "$log"
grep -q 'Success!' "$log"

echo "OK bootstrap first-apply e2e (init + mock plan) passed."
