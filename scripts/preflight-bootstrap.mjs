/**
 * Preflight checks before bootstrap OpenTofu apply (read-only; no Doppler or OpenTofu writes).
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
 * @param {{
 *   githubToken?: string,
 *   githubOwner?: string,
 *   githubRepository?: string,
 *   dopplerToken?: string,
 *   dopplerProject?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function preflightBootstrapGithubAdmin(options = {}) {
  const githubToken = options.githubToken ?? process.env.TF_VAR_github_token ?? "";
  const owner = options.githubOwner ?? process.env.TF_VAR_github_owner ?? "QueerGlobal";
  const repo = options.githubRepository ?? process.env.TF_VAR_github_repository ?? "queerglobal.com";
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!githubToken) {
    return { ok: false, error: "TF_VAR_github_token is required." };
  }

  const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const body = await response.json();
  if (!response.ok) {
    const message = body.message ?? response.statusText;
    return { ok: false, error: `GitHub repository check failed: ${message}` };
  }
  if (body.permissions?.admin !== true) {
    return {
      ok: false,
      error: `GitHub token lacks Administration (admin) on ${owner}/${repo}.`,
    };
  }
  return { ok: true };
}

/**
 * @param {{
 *   dopplerToken?: string,
 *   dopplerProject?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function preflightBootstrapDopplerProject(options = {}) {
  const dopplerToken = options.dopplerToken ?? process.env.TF_VAR_doppler_management_token ?? "";
  const dopplerProject = options.dopplerProject ?? process.env.TF_VAR_doppler_project ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!dopplerToken) {
    return { ok: false, error: "TF_VAR_doppler_management_token is required." };
  }
  if (!dopplerManagementTokenLooksValid(dopplerToken)) {
    return {
      ok: false,
      error:
        "TF_VAR_doppler_management_token must be a personal token (dp.pt.) or service account token (dp.sa.), not a config service token (dp.st.).",
    };
  }
  if (!dopplerProject) {
    return { ok: false, error: "TF_VAR_doppler_project is required." };
  }

  const response = await fetchImpl(`https://api.doppler.com/v3/projects/${dopplerProject}`, {
    headers: {
      Authorization: `Bearer ${dopplerToken}`,
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.messages?.[0]?.message ?? body.message ?? response.statusText;
    return { ok: false, error: `Doppler project read failed: ${message}` };
  }
  return { ok: true };
}

/**
 * @returns {Promise<number>}
 */
export async function runPreflightBootstrapCli() {
  const reviewersRaw = process.env.TF_VAR_production_reviewer_usernames ?? "";

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

  const github = await preflightBootstrapGithubAdmin({});
  if (!github.ok) {
    console.error(github.error);
    return 1;
  }

  const doppler = await preflightBootstrapDopplerProject({});
  if (!doppler.ok) {
    console.error(doppler.error);
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
