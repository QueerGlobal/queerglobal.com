/**
 * Cloudflare Workers deployment helpers for production rollback.
 *
 * @module worker-rollback
 * @exports {listWorkerDeployments} listWorkerDeployments
 * @exports {getLatestDeploymentVersionId} getLatestDeploymentVersionId
 * @exports {deployWorkerVersion} deployWorkerVersion
 * @exports {rollbackWorkerToVersion} rollbackWorkerToVersion
 * @exports {runRollbackCli} runRollbackCli
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * @param {string} accountId
 * @param {string} scriptName
 * @param {string} apiToken
 * @param {{ fetchImpl?: typeof fetch, limit?: number }} [options]
 * @returns {Promise<Array<{ id: string, versions: Array<{ version_id: string, percentage: number }> }>>}
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
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const msg = payload.errors?.[0]?.message ?? response.statusText;
    throw new Error(`List deployments failed: ${msg}`);
  }
  return payload.result ?? [];
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
  const url = `${API_BASE}/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/deployments`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
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
  return deployWorkerVersion(accountId, scriptName, versionId, apiToken, options);
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function runRollbackCli(argv = process.argv.slice(2)) {
  const versionId = argv[0];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const scriptName = process.env.WORKER_NAME ?? "queerglobal-grandkru";

  if (!versionId || !accountId || !apiToken) {
    console.error(
      "Usage: WORKER_NAME=queerglobal-grandkru CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/worker-rollback.mjs <version_id>",
    );
    return 1;
  }

  await rollbackWorkerToVersion(accountId, scriptName, versionId, apiToken);
  console.log(`Rolled back ${scriptName} to version ${versionId}.`);
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  process.exitCode = await runRollbackCli();
}
