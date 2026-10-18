/**
 * Test helper: run the real bootstrap preflight against stand-in API responses and
 * write a marker file only when it passes. Used by scripts/bootstrap-first-apply-e2e.sh.
 *
 * @module test-helpers/bootstrap-e2e-preflight
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPreflightBootstrapCli } from "../preflight-bootstrap.mjs";
import { ACCOUNT_ID, bootstrapStandInFetch } from "./fetch-stub.mjs";

/**
 * @param {string} markerPath
 * @returns {Promise<number>}
 */
export async function runBootstrapE2ePreflight(markerPath) {
  process.env.CLOUDFLARE_API_TOKEN = "bootstrap-e2e-cf-token";
  process.env.TF_VAR_cloudflare_account_id = ACCOUNT_ID;
  const code = await runPreflightBootstrapCli({ fetchImpl: bootstrapStandInFetch() });
  if (code === 0) {
    await fs.writeFile(markerPath, `${Date.now()}\n`, { mode: 0o600 });
  }
  return code;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  const marker = process.argv[2];
  if (!marker) {
    console.error("Usage: node scripts/test-helpers/bootstrap-e2e-preflight.mjs <marker-file>");
    process.exitCode = 1;
  } else {
    process.exitCode = await runBootstrapE2ePreflight(marker);
  }
}
