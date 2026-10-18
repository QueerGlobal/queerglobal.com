/**
 * Fail closed when the GitHub production environment is missing reviewers.
 *
 * @module verify-production-environment
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ type?: string, reviewers?: Array<unknown> }} ProtectionRule */

/**
 * @param {{ protection_rules?: ProtectionRule[] }} payload
 * @returns {number}
 */
export function countRequiredReviewersFromProtectionRules(payload) {
  const rules = payload.protection_rules ?? [];
  let count = 0;
  for (const rule of rules) {
    if (rule.type === "required_reviewers" && Array.isArray(rule.reviewers)) {
      count += rule.reviewers.length;
    }
  }
  return count;
}

/**
 * @param {{
 *   deployment_branch_policy?: {
 *     protected_branches?: boolean,
 *     custom_branch_policies?: boolean,
 *     custom_branch_policy_names?: string[],
 *   },
 * }} payload
 * @param {string} [defaultBranch]
 * @returns {boolean}
 */
export function environmentDeploysFromMainOnly(payload, defaultBranch = "main") {
  const policy = payload.deployment_branch_policy;
  if (!policy) {
    return false;
  }
  if (policy.custom_branch_policies === true) {
    const names = policy.custom_branch_policy_names ?? [];
    return names.length === 1 && names[0] === defaultBranch;
  }
  return policy.protected_branches === true && policy.custom_branch_policies === false;
}

/**
 * @param {{
 *   owner?: string,
 *   repo?: string,
 *   environment?: string,
 *   token?: string,
 *   fetchImpl?: typeof fetch,
 *   defaultBranch?: string,
 * }} [options]
 * @returns {Promise<{ reviewers: number, mainOnlyDeploy: boolean }>}
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
  const defaultBranch = options.defaultBranch ?? "main";

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

  const reviewers = countRequiredReviewersFromProtectionRules(payload);
  const mainOnlyDeploy = environmentDeploysFromMainOnly(payload, defaultBranch);

  if (reviewers === 0) {
    throw new Error(
      `GitHub environment "${environment}" has no required reviewers; refusing to deploy.`,
    );
  }

  if (!mainOnlyDeploy) {
    throw new Error(
      `GitHub environment "${environment}" must deploy from ${defaultBranch} only; refusing to deploy.`,
    );
  }

  return { reviewers, mainOnlyDeploy };
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
        mainOnlyDeploy: result.mainOnlyDeploy,
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
