#!/usr/bin/env bash
# End-to-end: TF_ENCRYPTION rotation on encrypted state (with existing .backup, no rm).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

OLD1='bootstrap-rotation-old-passphrase'
NEW1='bootstrap-rotation-new-passphrase'
OLD2='bootstrap-rotation-new-passphrase'
NEW2='bootstrap-rotation-newer-passphrase'

mkdir -p "$work/fixture"
cp "$root/infra/bootstrap/versions.tf" "$root/infra/bootstrap/variables.tf" "$work/fixture/"
cat >"$work/fixture/main.tf" <<'EOF'
resource "terraform_data" "marker" {
  input = "bootstrap-passphrase-rotation-e2e"
}
EOF

tofu -chdir="$work/fixture" init -input=false

export TF_VAR_bootstrap_state_passphrase="$OLD1"
export TF_VAR_bootstrap_state_passphrase_next=""
tofu -chdir="$work/fixture" apply -auto-approve -input=false -lock=false
cp "$work/fixture/terraform.tfstate" "$work/fixture/terraform.tfstate.backup"

assert_state_key_provider() {
  if ! grep -q 'key_provider.pbkdf2.bootstrap' "$work/fixture/terraform.tfstate"; then
    echo "Expected state metadata key_provider.pbkdf2.bootstrap after rotation." >&2
    exit 1
  fi
}

rotate_once() {
  local old=$1
  local new=$2
  export TF_VAR_bootstrap_state_passphrase="$old"
  export TF_VAR_bootstrap_state_passphrase_next="$new"
  bash "$root/scripts/bootstrap-passphrase-rotate.sh" "$work/fixture" <<<rotate
  assert_state_key_provider
  export TF_VAR_bootstrap_state_passphrase="$new"
  export TF_VAR_bootstrap_state_passphrase_next=""
  if ! tofu -chdir="$work/fixture" show -no-color >/dev/null; then
    echo "Expected show with new passphrase to succeed." >&2
    exit 1
  fi
  if TF_VAR_bootstrap_state_passphrase="$old" TF_VAR_bootstrap_state_passphrase_next="" \
    tofu -chdir="$work/fixture" show -no-color >/dev/null 2>&1; then
    echo "Expected show with old passphrase to fail." >&2
    exit 1
  fi
}

rotate_once "$OLD1" "$NEW1"
test -f "$work/fixture/terraform.tfstate.backup"

rotate_once "$OLD2" "$NEW2"

echo "OK bootstrap passphrase rotation e2e passed (two rotations, backup retained)."
