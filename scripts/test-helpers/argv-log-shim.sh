#!/usr/bin/env bash
# Log full argv for a wrapped command, then exec the real binary (for secret-on-argv tests).
set -euo pipefail

name="${1:?argv-log-shim: command name required}"
shift
log="${ARGV_LOG_FILE:?ARGV_LOG_FILE required}"
printf '%s\t%s\n' "$name" "$*" >>"$log"
if [ "${ARGV_LOG_NO_EXEC:-0}" = 1 ]; then
  exit 0
fi
exec "$name" "$@"
