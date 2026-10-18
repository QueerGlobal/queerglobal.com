/**
 * Preflight checks before bootstrap OpenTofu apply.
 *
 * @module preflight-bootstrap
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { preflightBootstrapCloudflare } from "./preflight-bootstrap-cloudflare.mjs";

/**
 * @param {string} token
 * @returns {boolean}
 */
export function dopplerManagementTokenLooksValid(token) {
  return /^dp\.(pt|sa)\./.test(token);
}

/**
 * @returns {Promise<number>}
 */
export async function runPreflightBootstrapCli() {
  const githubToken = process.env.TF_VAR_github_token ?? "";
  const dopplerToken = process.env.TF_VAR_doppler_management_token ?? "";
  const dopplerProject = process.env.TF_VAR_doppler_project ?? "";
  const reviewersRaw = process.env.TF_VAR_production_reviewer_usernames ?? "";

  if (!githubToken) {
    console.error("TF_VAR_github_token is required.");
    return 1;
  }
  if (!dopplerToken) {
    console.error("TF_VAR_doppler_management_token is required.");
    return 1;
  }
  if (!dopplerManagementTokenLooksValid(dopplerToken)) {
    console.error(
      "TF_VAR_doppler_management_token must be a personal token (dp.pt.) or service account token (dp.sa.), not a config service token (dp.st.).",
    );
    return 1;
  }
  if (!dopplerProject) {
    console.error("TF_VAR_doppler_project is required.");
    return 1;
  }

  let reviewers = [];
  try {
    reviewers = JSON.parse(reviewersRaw);
  } catch {
    console.error("TF_VAR_production_reviewer_usernames must be valid JSON array.");
    return 1;
  }
  if (!Array.isArray(reviewers) || reviewers.length === 0) {
    console.error("TF_VAR_production_reviewer_usernames must list at least one reviewer.");
    return 1;
  }

  const cloudflare = await preflightBootstrapCloudflare({});
  if (!cloudflare.ok) {
    console.error(cloudflare.error);
    return 1;
  }

  console.log("OK bootstrap preflight passed.");
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  process.exitCode = await runPreflightBootstrapCli();
}
