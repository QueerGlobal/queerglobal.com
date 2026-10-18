/**
 * Run bootstrap preflight with stand-in API responses for e2e scripts.
 *
 * @module bootstrap-e2e-preflight
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBootstrapCli } from "./bootstrap-error-report.mjs";
import { runPreflightBootstrapCli } from "./preflight-bootstrap.mjs";
import { ACCOUNT_ID, bootstrapStandInFetch } from "./test-helpers/fetch-stub.mjs";

export { ACCOUNT_ID, bootstrapStandInFetch as bootstrapE2eFetchImpl };

/**
 * @param {string} markerPath
 * @returns {Promise<number>}
 */
export async function runBootstrapE2ePreflight(markerPath) {
  process.env.CLOUDFLARE_API_TOKEN = "bootstrap-e2e-cf-token";
  process.env.TF_VAR_cloudflare_account_id = ACCOUNT_ID;
  process.env.TF_VAR_production_reviewer_usernames = '["octocat"]';
  return runPreflightBootstrapCli({
    fetchImpl: bootstrapStandInFetch(),
    markerPath,
  });
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  const marker = process.argv[2];
  if (!marker) {
    console.error("Usage: node scripts/bootstrap-e2e-preflight.mjs <marker-file>");
    process.exitCode = 1;
  } else {
    runBootstrapCli(async () => {
      process.exitCode = await runBootstrapE2ePreflight(marker);
    }).catch(() => {
      process.exitCode = 1;
    });
  }
}
