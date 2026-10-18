#!/usr/bin/env bash
# Re-encrypt bootstrap state with a new passphrase (TF_ENCRYPTION two-hop rotation).
set -euo pipefail

dir="${1:-infra/bootstrap}"

on_err() {
  echo "bootstrap-passphrase-rotate.sh failed at line ${1:-?}." >&2
}
trap 'on_err $LINENO' ERR

: "${TF_VAR_bootstrap_state_passphrase:?current passphrase required (TF_VAR_bootstrap_state_passphrase)}"
: "${TF_VAR_bootstrap_state_passphrase_next:?new passphrase required (TF_VAR_bootstrap_state_passphrase_next)}"

if [ ! -f "${dir}/terraform.tfstate" ]; then
  echo "No state at ${dir}/terraform.tfstate; init and apply before rotating." >&2
  exit 1
fi

printf 'Type rotate to confirm bootstrap state passphrase rotation: '
read -r confirm
if [ "$confirm" != "rotate" ]; then
  echo "Aborted." >&2
  exit 1
fi

old="$TF_VAR_bootstrap_state_passphrase"
new="$TF_VAR_bootstrap_state_passphrase_next"

hop() {
  local primary=$1
  local secondary=$2
  cat <<HCL
key_provider "pbkdf2" "rotation" {
  passphrase = var.bootstrap_state_passphrase_next
}
method "aes_gcm" "rotation" {
  keys = key_provider.pbkdf2.rotation
}
state {
  method   = method.aes_gcm.${primary}
  enforced = true
  fallback {
    method = method.aes_gcm.${secondary}
  }
}
plan {
  method   = method.aes_gcm.${primary}
  enforced = true
  fallback {
    method = method.aes_gcm.${secondary}
  }
}
HCL
}

TF_ENCRYPTION="$(hop rotation bootstrap)" \
  tofu -chdir="$dir" apply -refresh-only -auto-approve -input=false

TF_VAR_bootstrap_state_passphrase="$new" \
  TF_ENCRYPTION="$(hop bootstrap rotation)" \
  tofu -chdir="$dir" apply -refresh-only -auto-approve -input=false

TF_VAR_bootstrap_state_passphrase="$new"
TF_VAR_bootstrap_state_passphrase_next=""
tofu -chdir="$dir" plan -detailed-exitcode -input=false >/dev/null

if TF_VAR_bootstrap_state_passphrase="$old" TF_VAR_bootstrap_state_passphrase_next="" \
  tofu -chdir="$dir" plan -input=false >/dev/null 2>&1; then
  echo "Old passphrase still decrypts state; rotation failed." >&2
  exit 1
fi

export TF_VAR_bootstrap_state_passphrase="$new"
export TF_VAR_bootstrap_state_passphrase_next=""

if [ "${BOOTSTRAP_ROTATE_PROMOTE_DOPPLER:-}" = "1" ]; then
  : "${TF_VAR_doppler_project:?TF_VAR_doppler_project required to promote passphrases in Doppler}"
  config="${TF_VAR_doppler_bootstrap_config:-bootstrap}"
  printf '%s' "$new" | doppler secrets set BOOTSTRAP_STATE_PASSPHRASE \
    -p "$TF_VAR_doppler_project" -c "$config"
  doppler secrets delete BOOTSTRAP_STATE_PASSPHRASE_NEXT -p "$TF_VAR_doppler_project" -c "$config" --yes
fi

echo "Rotation complete: state re-encrypted with the new passphrase; the old passphrase is rejected."
