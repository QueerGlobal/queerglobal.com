#!/usr/bin/env bash
# Export committed bootstrap slugs and, unless --slugs-only is passed, the Cloudflare account id
# derived from CLOUDFLARE_API_TOKEN. Fails the sourcing script if the export cannot be built.
set -euo pipefail
_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_committed_exports="$(node "$_root/scripts/bootstrap-export-committed-env.mjs" "$@")"
eval "$_committed_exports"
unset _committed_exports
