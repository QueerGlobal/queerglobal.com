import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getLatestDeploymentVersionId,
  listWorkerDeployments,
  NO_PREVIOUS_WORKER_VERSION,
} from "./worker-rollback.mjs";

/**
 * @param {{
 *   accountId?: string,
 *   apiToken?: string,
 *   scriptName?: string,
 *   outputPath?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 * @returns {Promise<string | null>}
 */
export async function captureWorkerVersionId(options = {}) {
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  const scriptName = options.scriptName ?? process.env.WORKER_NAME ?? "queerglobal-grandkru";

  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
  }

  const deployments = await listWorkerDeployments(accountId, scriptName, apiToken, {
    fetchImpl: options.fetchImpl,
  });
  const versionId = getLatestDeploymentVersionId(deployments);
  if (options.outputPath) {
    if (versionId) {
      fs.writeFileSync(options.outputPath, `${versionId}\n`, "utf8");
    } else {
      fs.writeFileSync(
        options.outputPath,
        `${NO_PREVIOUS_WORKER_VERSION}\n`,
        "utf8",
      );
    }
  }
  return versionId;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  const outputPath = process.argv[2] ?? ".previous-worker-version";
  const versionId = await captureWorkerVersionId({ outputPath });
  if (!versionId) {
    console.log("No previous Worker version found (first deploy).");
    process.exitCode = 0;
  } else {
    console.log(`Saved previous version ${versionId} to ${outputPath}.`);
  }
}
