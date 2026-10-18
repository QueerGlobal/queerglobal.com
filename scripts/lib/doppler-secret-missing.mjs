/**
 * Classify Doppler CLI `secrets get` failures: only Doppler's own "could not find requested
 * secret" message for the named secret counts as missing. Anything else (network, auth such as
 * "token not found", a missing project or config) is a real error.
 *
 * @module lib/doppler-secret-missing
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {string} name
 * @returns {string}
 */
function escapeRegExp(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} stderr
 * @param {number} exitCode
 * @param {string} secretName
 * @returns {boolean}
 */
export function dopplerSecretGetMeansMissing(stderr, exitCode, secretName) {
  if (exitCode === 0 || !secretName) {
    return false;
  }
  const pattern = new RegExp(`Could not find requested secret: ${escapeRegExp(secretName)}\\s*$`, "m");
  return pattern.test(stderr);
}

/**
 * @param {string[]} argv `<stderr-file> <exit-code> <secret-name>`
 * @returns {number} 0 when the secret is missing, 1 for any other failure, 2 on bad usage
 */
export function runDopplerSecretMissingCli(argv = process.argv.slice(2)) {
  const [stderrPath, code, secretName] = argv;
  const exitCode = Number(code);
  if (!stderrPath || Number.isNaN(exitCode) || !secretName) {
    process.stderr.write("usage: doppler-secret-missing.mjs <stderr-file> <exit-code> <secret-name>\n");
    return 2;
  }
  const stderr = fs.readFileSync(stderrPath, "utf8");
  return dopplerSecretGetMeansMissing(stderr, exitCode, secretName) ? 0 : 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  process.exitCode = runDopplerSecretMissingCli();
}
