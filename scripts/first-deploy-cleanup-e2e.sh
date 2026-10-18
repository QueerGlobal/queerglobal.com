#!/usr/bin/env bash
# E2e: failed first deploy path runs automated infra cleanup (stub tofu), and the
# cleanup refuses to run against an existing deployment or an unexpected plan.
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
  *" show -json "*)
    printf '{"resource_changes":[%s]}\n' "${TOFU_PLAN_CHANGES:?}" ;;
esac
exit 0
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

allowed='{"address":"cloudflare_workers_custom_domain.coming_soon","change":{"actions":["delete"]}},{"address":"cloudflare_workers_script.coming_soon","change":{"actions":["delete"]}}'
first="$work/first-deploy"
echo "__NO_PREVIOUS_WORKER__" >"$first"

# Happy path: validate, plan, plan check, then apply of exactly that plan.
TOFU_PLAN_CHANGES="$allowed" bash "$root/scripts/run-infra-first-deploy-cleanup.sh" "$first"
order="$(grep -oE ' (init|validate|plan -destroy|show -json|apply -auto-approve)' "$log" | tr -d ' ' | tr '\n' ' ')"
test "$order" = "init validate plan-destroy show-json apply-auto-approve " || { echo "unexpected order: $order" >&2; exit 1; }
grep -q 'target=cloudflare_workers_custom_domain.coming_soon' "$log"
grep -q 'target=cloudflare_workers_script.coming_soon' "$log"
grep -q 'apply -auto-approve -input=false .*destroy.tfplan$' "$log"

# Existing deployment: a real previous version must stop cleanup before any tofu call.
: >"$log"
existing="$work/existing"
echo "11111111-2222-3333-4444-555555555555" >"$existing"
if TOFU_PLAN_CHANGES="$allowed" bash "$root/scripts/run-infra-first-deploy-cleanup.sh" "$existing" 2>/dev/null; then
  echo "cleanup ran against an existing deployment" >&2
  exit 1
fi
test ! -s "$log" || { echo "tofu was called despite an existing deployment" >&2; exit 1; }

# Unexpected plan: anything outside the Worker and domain stops before apply.
: >"$log"
extra='{"address":"cloudflare_dns_record.other","change":{"actions":["delete"]}}'
if TOFU_PLAN_CHANGES="$extra" bash "$root/scripts/run-infra-first-deploy-cleanup.sh" "$first" 2>/dev/null; then
  echo "cleanup applied an unexpected destroy plan" >&2
  exit 1
fi
if grep -q ' apply ' "$log"; then
  echo "apply ran after the plan check failed" >&2
  exit 1
fi

echo "OK first-deploy cleanup e2e (gated destroy plan and apply, refuses existing deployments and unexpected plans)."
