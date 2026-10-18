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
 * @param {string} bucketName
 * @returns {boolean}
 */
export function isR2BucketAlreadyExistsMessage(message, bucketName) {
  const normalized = message.toLowerCase();
  const bucket = bucketName.toLowerCase();
  if (!normalized.includes(bucket)) {
    return false;
  }
  return (
    /a bucket with (?:that|this) name already exists/.test(normalized) ||
    /bucket already exists/.test(normalized) ||
    /you already own a bucket with this name/.test(normalized)
  );
}

/**
 * @param {{
 *   bucketName?: string,
 *   accountId?: string,
 *   apiToken?: string,
 *   spawnImpl?: typeof spawnSync,
 *   wranglerBin?: string,
 * }} [options]
 * @returns {{ created: boolean, skipped: boolean, output: string }}
 */
export function ensureTfStateBucket(options = {}) {
  const bucketName = options.bucketName ?? process.env.TF_STATE_BUCKET;
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  const spawnImpl = options.spawnImpl ?? spawnSync;
  const wranglerBin =
    options.wranglerBin ?? path.join(process.cwd(), "node_modules", ".bin", "wrangler");

  if (!bucketName || !accountId || !apiToken) {
    throw new Error(
      "TF_STATE_BUCKET, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN are required.",
    );
  }

  const result = spawnImpl(
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
  if (isR2BucketAlreadyExistsMessage(output, bucketName)) {
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
