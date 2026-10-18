#!/usr/bin/env bash
# Export committed bootstrap slugs and (when CLOUDFLARE_API_TOKEN is set) derived account id.
set -euo pipefail
_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
eval "$(node "$_root/scripts/bootstrap-export-committed-env.mjs")"
