/**
 * Fail closed when the GitHub production environment is missing reviewers.
 *
 * @module verify-production-environment
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {{
 *   owner?: string,
 *   repo?: string,
 *   environment?: string,
 *   token?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 * @returns {Promise<{ reviewers: number, protectedBranches: boolean }>}
 */
export async function verifyProductionEnvironmentProtected(options = {}) {
  const repository = process.env.GITHUB_REPOSITORY;
  const [defaultOwner, defaultRepo] = repository?.includes("/")
    ? repository.split("/", 2)
    : ["", ""];

  const owner = options.owner ?? defaultOwner;
  const repo = options.repo ?? defaultRepo;
  const environment = options.environment ?? "production";
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!owner || !repo || !token) {
    throw new Error(
      "GITHUB_REPOSITORY and GITHUB_TOKEN are required to verify the production environment.",
    );
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/environments/${encodeURIComponent(environment)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    const message = payload.message ?? response.statusText;
    throw new Error(`Failed to load GitHub environment ${environment}: ${message}`);
  }

  const reviewers = Array.isArray(payload.reviewers) ? payload.reviewers.length : 0;
  const protectedBranches =
    payload.deployment_branch_policy?.protected_branches === true ||
    payload.protection_rules?.some((rule) => rule.type === "required_reviewers");

  if (reviewers === 0) {
    throw new Error(
      `GitHub environment "${environment}" has no required reviewers; refusing to deploy.`,
    );
  }

  return { reviewers, protectedBranches };
}

/**
 * @returns {Promise<number>}
 */
export async function runVerifyProductionEnvironmentCli() {
  try {
    const result = await verifyProductionEnvironmentProtected();
    console.log(
      JSON.stringify({
        event: "production_environment_verified",
        reviewers: result.reviewers,
        protectedBranches: result.protectedBranches,
      }),
    );
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  process.exitCode = await runVerifyProductionEnvironmentCli();
}
