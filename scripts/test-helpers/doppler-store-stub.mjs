/**
 * A stand-in doppler CLI backed by one file per secret, for behavioral tests of the bootstrap scripts.
 *
 * Supports `run [-p P] [-c C] [--only-secrets A,B] -- cmd...` (loads only the listed secrets into the
 * environment of cmd, keeping the rest of the environment) and `secrets get|set|delete NAME`
 * (set reads the value from stdin). Every call's argv is appended to the log, one call per record,
 * arguments separated by \x1f and calls by \x1e.
 *
 * @module test-helpers/doppler-store-stub
 */

import fs from "node:fs";
import path from "node:path";

import { mkdtempTracked, stubBin } from "./test-temp.mjs";

/**
 * @param {Record<string, string>} [secrets]
 * @returns {{ bin: string, store: string, log: string, read: (name: string) => string | undefined, calls: () => string[][] }}
 */
export function dopplerStoreStub(secrets = {}) {
  const store = mkdtempTracked("doppler-store-");
  const log = path.join(store, ".argv.log");
  for (const [name, value] of Object.entries(secrets)) {
    fs.writeFileSync(path.join(store, name), value);
  }
  const bin = stubBin(
    "doppler",
    `store='${store}'
printf '%s\\x1f' "$@" >> '${log}'
printf '\\x1e' >> '${log}'
if [ "$1" = run ]; then
  shift
  only=""
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
    case "$1" in
      --only-secrets) only="$2"; shift 2 ;;
      -p|-c) shift 2 ;;
      *) shift ;;
    esac
  done
  shift
  IFS=, read -ra names <<<"$only"
  for n in "\${names[@]}"; do
    if [ -f "$store/$n" ]; then export "$n=$(cat "$store/$n")"; fi
  done
  exec "$@"
fi
if [ "$1" = secrets ]; then
  case "$2" in
    get)
      if [ -f "$store/$3" ]; then cat "$store/$3"; else echo "Doppler Error: Could not find requested secret: $3" >&2; exit 1; fi ;;
    set) cat > "$store/$3" ;;
    delete) rm -f "$store/$3" ;;
  esac
fi
exit 0`,
  );
  return {
    bin,
    store,
    log,
    read: (name) => (fs.existsSync(path.join(store, name)) ? fs.readFileSync(path.join(store, name), "utf8") : undefined),
    calls: () =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, "utf8")
            .split("\x1e")
            .filter(Boolean)
            .map((line) => line.split("\x1f").slice(0, -1))
        : [],
  };
}
