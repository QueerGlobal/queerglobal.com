#!/bin/bash
# Installed under each wrapped command name (git, curl, doppler, bash, gh, tofu, jq,
# wrangler, npx, aws, node). Logs the full argv, one record per call, then runs the
# real binary for bash, node and git, unwraps `doppler run -- <cmd>`, stands in for
# tofu, and does nothing for the rest so no test ever reaches the network.
set -euo pipefail

name="$(basename "$0")"
{
  printf '%s' "$name"
  for arg in "$@"; do
    printf '\037%s' "$arg"
  done
  printf '\036'
} >>"${ARGV_LOG_FILE:?ARGV_LOG_FILE required}"

case "$name" in
  bash) exec "${REAL_BASH:?}" "$@" ;;
  node) exec "${REAL_NODE:?}" "$@" ;;
  git) exec "${REAL_GIT:?}" "$@" ;;
  doppler)
    if [ "${1:-}" = run ]; then
      while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done
      shift
      exec "$@"
    fi
    if [[ "$*" == *secrets*get*BOOTSTRAP_STATE_PASSPHRASE* ]]; then
      if [ -f "${ARGV_DOPPLER_PASSPHRASE_FILE:-}" ]; then
        cat "${ARGV_DOPPLER_PASSPHRASE_FILE}"
      else
        echo "Secret not found" >&2
        exit 1
      fi
      exit 0
    fi
    if [[ "$*" == *secrets*set*BOOTSTRAP_STATE_PASSPHRASE* ]]; then
      cat >"${ARGV_DOPPLER_PASSPHRASE_FILE:-/dev/null}"
      exit 0
    fi
    if [[ "$*" == *secrets*set* ]]; then
      cat >/dev/null
      exit 0
    fi
    cat >/dev/null
    ;;
  tofu)
    case " $* " in
      *" show -json "*)
        printf '%s\n' '{"resource_changes":[{"address":"cloudflare_workers_custom_domain.coming_soon","change":{"actions":["delete"]}},{"address":"cloudflare_workers_script.coming_soon","change":{"actions":["delete"]}}]}'
        ;;
      *" plan "*)
        for arg in "$@"; do
          case "$arg" in
            -out=*)
              : >"${arg#-out=}"
              ;;
          esac
        done
        ;;
      *" apply "*)
        if [ -n "${ARGV_TOFU_FAIL_APPLY:-}" ]; then exit 1; fi
        ;;
    esac
    ;;
esac
exit 0
