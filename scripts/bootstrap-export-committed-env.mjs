/**
 * Print shell exports for committed bootstrap slugs and derived Cloudflare account id.
 *
 * @module bootstrap-export-committed-env
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { bootstrapProjectTfVarEnv } from "./lib/bootstrap-project.mjs";
import { cloudflareAccountIdFromToken } from "./lib/cloudflare-account-from-token.mjs";

/**
 * @param {string} value
 * @returns {string}
 */
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * @returns {Promise<number>}
 */
export async function runBootstrapExportCommittedEnvCli() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const env = bootstrapProjectTfVarEnv(repoRoot);
  const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
  if (token) {
    const derived = await cloudflareAccountIdFromToken({ token });
    if (!derived.ok) {
      console.error(derived.error);
      return 1;
    }
    env.TF_VAR_cloudflare_account_id = derived.accountId;
  }
  for (const [key, value] of Object.entries(env)) {
    process.stdout.write(`export ${key}=${shellQuote(value)}\n`);
  }
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  runBootstrapExportCommittedEnvCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    });
}
