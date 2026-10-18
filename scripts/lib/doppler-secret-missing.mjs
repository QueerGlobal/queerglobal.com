/**
 * Classify Doppler CLI `secrets get` failures (missing secret vs other errors).
 *
 * @module lib/doppler-secret-missing
 */

import fs from "node:fs";

/**
 * @param {string} stderr
 * @param {number} exitCode
 * @returns {boolean}
 */
export function dopplerSecretGetMeansMissing(stderr, exitCode) {
  if (exitCode === 0) {
    return false;
  }
  const text = stderr.toLowerCase();
  if (
    text.includes("could not find") ||
    text.includes("not found") ||
    text.includes("does not exist") ||
    text.includes("secret not found") ||
    text.includes("404")
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {string[]} argv
 * @returns {number}
 */
export function runDopplerSecretMissingCli(argv = process.argv.slice(2)) {
  const stderrPath = argv[0];
  const exitCode = Number(argv[1]);
  if (!stderrPath || Number.isNaN(exitCode)) {
    process.stderr.write("usage: doppler-secret-missing.mjs <stderr-file> <exit-code>\n");
    return 2;
  }
  const stderr = fs.readFileSync(stderrPath, "utf8");
  return dopplerSecretGetMeansMissing(stderr, exitCode) ? 0 : 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  process.exitCode = runDopplerSecretMissingCli();
}
