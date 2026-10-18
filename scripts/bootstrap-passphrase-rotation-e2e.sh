#!/usr/bin/env bash
# Encryption checks using the same key-provider layout as infra/bootstrap/versions.tf.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp -a "$root/infra/bootstrap/encryption-rotation-fixture/." "$work/fixture/"

OLD_PASS='bootstrap-rotation-old-passphrase'
NEW_PASS='bootstrap-rotation-new-passphrase'

tofu -chdir="$work/fixture" init -backend=false -input=false

export TF_VAR_bootstrap_state_passphrase="$OLD_PASS"
export TF_VAR_bootstrap_state_passphrase_previous=""
tofu -chdir="$work/fixture" apply -auto-approve -input=false -lock=false
rm -f "$work/fixture/terraform.tfstate.backup"

if ! tofu -chdir="$work/fixture" show -no-color >/dev/null; then
  echo "Expected show with correct passphrase to succeed." >&2
  exit 1
fi

export TF_VAR_bootstrap_state_passphrase="$NEW_PASS"
if tofu -chdir="$work/fixture" show -no-color 2>/dev/null; then
  echo "Expected show with wrong passphrase to fail." >&2
  exit 1
fi

echo "OK bootstrap passphrase rotation e2e passed (encrypted state; wrong passphrase rejected)."
