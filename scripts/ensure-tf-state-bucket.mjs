/**
 * Idempotently create the OpenTofu remote state bucket (Cloudflare R2).
 *
 * Requires Doppler (or env): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN,
 * TF_STATE_BUCKET.
 *
 * Usage: doppler run -- node scripts/ensure-tf-state-bucket.mjs
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {string} message
 * @returns {boolean}
 */
function isAlreadyExistsMessage(message) {
  return /already exists|bucket already owned|409/i.test(message);
}

/**
 * @param {{ bucketName?: string, accountId?: string, apiToken?: string }} [options]
 * @returns {{ created: boolean, skipped: boolean, output: string }}
 */
export function ensureTfStateBucket(options = {}) {
  const bucketName = options.bucketName ?? process.env.TF_STATE_BUCKET;
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;

  if (!bucketName || !accountId || !apiToken) {
    throw new Error(
      "TF_STATE_BUCKET, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN are required.",
    );
  }

  const wranglerBin = path.join(process.cwd(), "node_modules", ".bin", "wrangler");
  const result = spawnSync(
    wranglerBin,
    ["r2", "bucket", "create", bucketName],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: accountId,
        CLOUDFLARE_API_TOKEN: apiToken,
      },
    },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status === 0) {
    return { created: true, skipped: false, output };
  }
  if (isAlreadyExistsMessage(output)) {
    return { created: false, skipped: true, output };
  }

  throw new Error(`Failed to create R2 bucket ${bucketName}: ${output || result.status}`);
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  const outcome = ensureTfStateBucket();
  if (outcome.skipped) {
    console.log(`R2 bucket already exists (${process.env.TF_STATE_BUCKET}).`);
  } else {
    console.log(`Created R2 bucket ${process.env.TF_STATE_BUCKET}.`);
  }
}
