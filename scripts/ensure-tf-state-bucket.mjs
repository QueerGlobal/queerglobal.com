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

/** Bucket exists and is owned by this account (create race or duplicate create). */
export const WRANGLER_R2_BUCKET_ALREADY_OWNED_CODE = 10004;

/** Bucket not found (safe to create). */
export const WRANGLER_R2_BUCKET_NOT_FOUND_CODE = 10006;

/** Bucket name taken by another account. */
export const WRANGLER_R2_BUCKET_NAME_CONFLICT_CODE = 10073;

/**
 * @param {string} output
 * @returns {number | null}
 */
export function parseWranglerErrorCode(output) {
  const match = output.match(/\[code:\s*(\d+)\]/i);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

/**
 * @param {{ status?: number | null, stdout?: string | null, stderr?: string | null }} result
 * @returns {string}
 */
export function formatWranglerOutput(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

/**
 * @param {string} wranglerBin
 * @param {string[]} args
 * @param {string} accountId
 * @param {string} apiToken
 * @param {typeof spawnSync} spawnImpl
 * @returns {{ status: number | null, stdout: string, stderr: string, output: string, code: number | null }}
 */
export function runWranglerR2Command(wranglerBin, args, accountId, apiToken, spawnImpl) {
  const result = spawnImpl(wranglerBin, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: apiToken,
    },
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const output = formatWranglerOutput(result);
  return {
    status: result.status ?? null,
    stdout,
    stderr,
    output,
    code: parseWranglerErrorCode(output),
  };
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

  const info = runWranglerR2Command(
    wranglerBin,
    ["r2", "bucket", "info", bucketName],
    accountId,
    apiToken,
    spawnImpl,
  );

  if (info.status === 0) {
    return { created: false, skipped: true, output: info.output };
  }

  if (info.code !== WRANGLER_R2_BUCKET_NOT_FOUND_CODE) {
    throw new Error(
      `Failed to inspect R2 bucket ${bucketName}: ${info.output || info.status}`,
    );
  }

  const create = runWranglerR2Command(
    wranglerBin,
    ["r2", "bucket", "create", bucketName],
    accountId,
    apiToken,
    spawnImpl,
  );

  if (create.status === 0) {
    return { created: true, skipped: false, output: create.output };
  }

  if (create.code === WRANGLER_R2_BUCKET_ALREADY_OWNED_CODE) {
    return { created: false, skipped: true, output: create.output };
  }

  if (create.code === WRANGLER_R2_BUCKET_NAME_CONFLICT_CODE) {
    throw new Error(
      `R2 bucket name ${bucketName} is already used by another account [code: ${WRANGLER_R2_BUCKET_NAME_CONFLICT_CODE}].`,
    );
  }

  throw new Error(`Failed to create R2 bucket ${bucketName}: ${create.output || create.status}`);
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
