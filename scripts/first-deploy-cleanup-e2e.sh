#!/usr/bin/env bash
# E2e: failed first deploy path runs automated infra cleanup (stub tofu).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

log="$work/tofu.log"
tofu_stub="$work/bin"
mkdir -p "$tofu_stub"
cat >"$tofu_stub/tofu" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "${TOFU_LOG:?}"
case "$*" in
  *" validate"*) exit 0 ;;
  *" plan "*) exit 0 ;;
  *" apply "*) exit 0 ;;
  *" init "*) exit 0 ;;
  *) exit 0 ;;
esac
STUB
chmod +x "$tofu_stub/tofu"

export PATH="$tofu_stub:$PATH"
export TOFU_LOG="$log"
export CLOUDFLARE_API_TOKEN=cf_mock_first_deploy_cleanup
export CLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123456789abcdef
export TF_STATE_BUCKET=mock-bucket
export TF_STATE_KEY=queerglobal-grandkru/terraform.tfstate
export TF_STATE_REGION=auto
export TF_STATE_ENDPOINT=https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com
export AWS_ACCESS_KEY_ID=mock_key
export AWS_SECRET_ACCESS_KEY=mock_secret

bash "$root/scripts/run-infra-first-deploy-cleanup.sh"

grep -q 'validate' "$log"
grep -q 'plan -destroy' "$log"
grep -q 'target=cloudflare_workers_custom_domain.coming_soon' "$log"
grep -q 'target=cloudflare_workers_script.coming_soon' "$log"
grep -q 'apply -auto-approve' "$log"

echo "OK first-deploy cleanup e2e (automated destroy plan/apply, no manual README destroy)."
