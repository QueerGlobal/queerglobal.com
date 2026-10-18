#!/usr/bin/env bash
# Run one bootstrap command with the three bootstrap tokens from the bootstrap Doppler config.
# The tokens exist only in the environment of the command this starts: never typed into or exported
# from the caller's shell, never on argv, and never traced.
{ set +x; } 2>/dev/null
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: bash scripts/bootstrap-run.sh <command> [args...]" >&2
  exit 2
fi
if [ -n "${CLOUDFLARE_API_TOKEN:-}${TF_VAR_github_token:-}${TF_VAR_doppler_management_token:-}" ]; then
  echo "A bootstrap token is already set in this shell. Unset it; bootstrap tokens come only from the bootstrap Doppler config." >&2
  exit 1
fi

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/bootstrap-committed-env.sh
. "$dir/scripts/bootstrap-committed-env.sh" --slugs-only
project="${TF_VAR_doppler_project:?TF_VAR_doppler_project is required}"
config="${TF_VAR_doppler_bootstrap_config:?TF_VAR_doppler_bootstrap_config is required}"

# The child maps the Doppler names to the names the scripts and providers read, refuses to start
# if any token is missing or empty, and only then runs the command. Only variable names appear here.
# shellcheck disable=SC2016
exec doppler run \
  -p "$project" \
  -c "$config" \
  --only-secrets CLOUDFLARE_API_TOKEN,BOOTSTRAP_GITHUB_TOKEN,BOOTSTRAP_DOPPLER_MANAGEMENT_TOKEN \
  -- bash -c '
{ set +x; } 2>/dev/null
set -euo pipefail
for name in CLOUDFLARE_API_TOKEN BOOTSTRAP_GITHUB_TOKEN BOOTSTRAP_DOPPLER_MANAGEMENT_TOKEN; do
  if [ -z "${!name:-}" ]; then
    echo "$name is missing or empty in the bootstrap Doppler config ($TF_VAR_doppler_project/$TF_VAR_doppler_bootstrap_config)." >&2
    exit 1
  fi
done
export TF_VAR_github_token="$BOOTSTRAP_GITHUB_TOKEN"
export TF_VAR_doppler_management_token="$BOOTSTRAP_DOPPLER_MANAGEMENT_TOKEN"
unset BOOTSTRAP_GITHUB_TOKEN BOOTSTRAP_DOPPLER_MANAGEMENT_TOKEN
exec "$@"
' bootstrap-run "$@"
