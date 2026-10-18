/**
 * Cloudflare Workers deployment helpers for production rollback.
 *
 * @module worker-rollback
 * @exports {listWorkerDeployments} listWorkerDeployments
 * @exports {getLatestDeploymentVersionId} getLatestDeploymentVersionId
 * @exports {deployWorkerVersion} deployWorkerVersion
 * @exports {rollbackWorkerToVersion} rollbackWorkerToVersion
 * @exports {WORKER_VERSION_ID_PATTERN} WORKER_VERSION_ID_PATTERN
 * @exports {isValidWorkerVersionId} isValidWorkerVersionId
 * @exports {assertValidWorkerVersionId} assertValidWorkerVersionId
 * @exports {formatRollbackCliUsage} formatRollbackCliUsage
 * @exports {runRollbackCli} runRollbackCli
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareBearerRequest, CLOUDFLARE_API_BASE } from "./lib/cloudflare-github-api.mjs";
import { runCliWithErrorReport } from "./lib/sentry-report.mjs";

const API_BASE = CLOUDFLARE_API_BASE;

/** Cloudflare Workers version IDs are UUIDs. */
export const WORKER_VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string} versionId
 * @returns {boolean}
 */
export function isValidWorkerVersionId(versionId) {
  return WORKER_VERSION_ID_PATTERN.test(versionId);
}

/**
 * @param {string} versionId
 * @returns {string}
 */
export function assertValidWorkerVersionId(versionId) {
  if (!isValidWorkerVersionId(versionId)) {
    throw new Error(
      `Invalid Worker version ID (expected UUID format): ${JSON.stringify(versionId)}`,
    );
  }
  return versionId;
}

/** Marker written when no Worker existed before deploy (first production release). */
export const NO_PREVIOUS_WORKER_VERSION = "__NO_PREVIOUS_WORKER__";

/** Cloudflare Workers API code when the script name does not exist yet. */
export const WORKER_SCRIPT_NOT_FOUND_API_CODE = 10007;

/**
 * @param {Response} response
 * @param {{ success?: boolean, errors?: Array<{ message?: string, code?: number }> }} payload
 * @returns {boolean}
 */
export function isWorkerScriptNotFound(response, payload) {
  const err = payload.errors?.[0];
  const msg = err?.message ?? response.statusText ?? "";
  if (err?.code === WORKER_SCRIPT_NOT_FOUND_API_CODE) {
    return true;
  }
  return /script not found/i.test(msg);
}

/**
 * @param {string} accountId
 * @param {string} scriptName
 * @param {string} apiToken
 * @param {{ fetchImpl?: typeof fetch, limit?: number }} [options]
 * @returns {Promise<Array<{ id: string, versions: Array<{ version_id: string, percentage: number }> }>>}
 *   Newest first, taken from `result.deployments` in the Cloudflare response.
 */
export async function listWorkerDeployments(
  accountId,
  scriptName,
  apiToken,
  options = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = options.limit ?? 5;
  const url = `${API_BASE}/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/deployments?limit=${limit}`;
  const response = await cloudflareBearerRequest(
    url.replace(API_BASE, ""),
    apiToken,
    fetchImpl,
  );
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    if (isWorkerScriptNotFound(response, payload)) {
      return [];
    }
    const msg = payload.errors?.[0]?.message ?? response.statusText;
    throw new Error(`List deployments failed: ${msg}`);
  }
  const deployments = payload.result?.deployments;
  if (!Array.isArray(deployments)) {
    throw new Error("List deployments returned an unexpected payload (missing result.deployments).");
  }
  return deployments;
}

/**
 * @param {Array<{ versions: Array<{ version_id: string, percentage: number }> }>} deployments
 * @returns {string | null}
 */
export function getLatestDeploymentVersionId(deployments) {
  if (deployments.length === 0) {
    return null;
  }
  const primary = deployments[0].versions?.find((v) => v.percentage > 0);
  return primary?.version_id ?? deployments[0].versions?.[0]?.version_id ?? null;
}

/**
 * @param {string} accountId
 * @param {string} scriptName
 * @param {string} versionId
 * @param {string} apiToken
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function deployWorkerVersion(
  accountId,
  scriptName,
  versionId,
  apiToken,
  options = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pathSuffix = `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/deployments`;
  const response = await cloudflareBearerRequest(pathSuffix, apiToken, fetchImpl, {
    method: "POST",
    body: JSON.stringify({
      strategy: "percentage",
      versions: [{ version_id: versionId, percentage: 100 }],
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const msg = payload.errors?.[0]?.message ?? response.statusText;
    throw new Error(`Deploy version failed: ${msg}`);
  }
  return payload.result;
}

/**
 * @param {string} accountId
 * @param {string} scriptName
 * @param {string} versionId
 * @param {string} apiToken
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function rollbackWorkerToVersion(
  accountId,
  scriptName,
  versionId,
  apiToken,
  options = {},
) {
  assertValidWorkerVersionId(versionId);
  return deployWorkerVersion(accountId, scriptName, versionId, apiToken, options);
}

/**
 * @param {string} [scriptName]
 * @returns {string}
 */
export function formatRollbackCliUsage(scriptName = "<worker_script_name>") {
  return `Usage: WORKER_NAME=${scriptName} CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/worker-rollback.mjs <version_id>`;
}

/**
 * @param {string[]} argv
 * @param {{
 *   accountId?: string,
 *   apiToken?: string,
 *   scriptName?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 * @returns {Promise<number>}
 */
export async function runRollbackCli(argv = process.argv.slice(2), options = {}) {
  const versionId = argv[0];

  if (!versionId) {
    console.error(formatRollbackCliUsage(options.scriptName ?? process.env.WORKER_NAME));
    return 1;
  }

  try {
    assertValidWorkerVersionId(versionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return 1;
  }

  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  const scriptName = options.scriptName ?? process.env.WORKER_NAME;

  if (!accountId || !apiToken || !scriptName) {
    console.error(formatRollbackCliUsage(scriptName ?? "<worker_script_name>"));
    return 1;
  }

  await rollbackWorkerToVersion(accountId, scriptName, versionId, apiToken, {
    fetchImpl: options.fetchImpl,
  });
  console.log(`Rolled back ${scriptName} to version ${versionId}.`);
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  process.env.WORKER_NAME ??= "queerglobal-grandkru";
  runCliWithErrorReport(
    async () => {
      process.exitCode = await runRollbackCli();
      if (process.exitCode !== 0) {
        throw new Error("Worker rollback failed.");
      }
    },
    { component: "worker-rollback" },
  ).catch(() => {
    process.exitCode = 1;
  });
}
