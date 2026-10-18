#!/usr/bin/env bash
# End-to-end: preflight marker, real init, mock plan (no remote backend).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

marker="$work/preflight.ok"
export BOOTSTRAP_FIRST_RUN=1

cp -a "$root/infra/bootstrap/." "$work/bootstrap/"
rm -f "$work/bootstrap/terraform.tfstate" "$work/bootstrap/terraform.tfstate.backup"
rm -rf "$work/bootstrap/.terraform"

export TF_VAR_github_token=ghp_mock_bootstrap_token_000000000000
export TF_VAR_doppler_management_token=dp.pt.mock_management_token_000000000000
export TF_VAR_doppler_project=queerglobal
export TF_VAR_doppler_config=prd
export TF_VAR_doppler_bootstrap_config=bootstrap
export TF_VAR_bootstrap_state_passphrase=mock-bootstrap-passphrase-for-ci

node "$root/scripts/bootstrap-e2e-preflight.mjs" "$marker"
test -f "$marker"

bash "$root/scripts/bootstrap-tofu-init.sh" "$work/bootstrap"

log="$work/first-apply-e2e.log"
tofu -chdir="$work/bootstrap" test -filter=mock.tofutest.hcl -concise -no-color 2>&1 | tee "$log"

grep -q 'run "plan_mock"... pass' "$log"
grep -q 'Success!' "$log"

echo "OK bootstrap first-apply e2e (preflight + init + mock plan) passed."
