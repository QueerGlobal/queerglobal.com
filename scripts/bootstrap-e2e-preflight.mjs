/**
 * Run bootstrap preflight with stand-in API responses for e2e scripts.
 *
 * @module bootstrap-e2e-preflight
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPreflightBootstrapCli } from "./preflight-bootstrap.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const ZONE_ID = "zone-grandkru-on-account";
const OTHER_ACCOUNT = "fedcba9876543210fedcba9876543210";

/**
 * @returns {typeof fetch}
 */
export function bootstrapE2eFetchImpl() {
  return async (url) => {
    const pathStr = String(url);
    if (pathStr.includes("/accounts/") && pathStr.includes("/tokens/verify")) {
      return {
        ok: true,
        json: async () => ({ success: true, result: { status: "active", id: "cf-token-id" } }),
      };
    }
    if (pathStr.includes("/accounts/") && pathStr.endsWith("/r2/buckets")) {
      return {
        ok: true,
        json: async () => ({ success: true, result: [], errors: [], messages: [] }),
      };
    }
    if (pathStr.includes("/zones?")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          result: [{ id: ZONE_ID, name: "grandkru.com", account: { id: ACCOUNT_ID } }],
          errors: [],
          messages: [],
        }),
      };
    }
    if (pathStr.includes("/accounts/") && pathStr.endsWith("/tokens")) {
      return {
        ok: true,
        json: async () => ({ success: true, result: [], errors: [], messages: [] }),
      };
    }
    if (pathStr.includes("api.github.com/repos/")) {
      return {
        ok: true,
        json: async () => ({ permissions: { admin: true } }),
      };
    }
    if (pathStr.includes("api.doppler.com/v3/projects/")) {
      return { ok: true, json: async () => ({ id: "proj", name: "queerglobal" }) };
    }
    throw new Error(`bootstrap e2e fetch: unexpected url ${url}`);
  };
}

/**
 * @param {string} markerPath
 * @returns {Promise<number>}
 */
export async function runBootstrapE2ePreflight(markerPath) {
  process.env.CLOUDFLARE_API_TOKEN = "bootstrap-e2e-cf-token";
  process.env.TF_VAR_cloudflare_account_id = ACCOUNT_ID;
  process.env.TF_VAR_production_reviewer_usernames = '["octocat"]';
  return runPreflightBootstrapCli({
    fetchImpl: bootstrapE2eFetchImpl(),
    markerPath,
  });
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  const marker = process.argv[2];
  if (!marker) {
    console.error("Usage: node scripts/bootstrap-e2e-preflight.mjs <marker-file>");
    process.exitCode = 1;
  } else {
    process.exitCode = await runBootstrapE2ePreflight(marker);
  }
}

export { ACCOUNT_ID, OTHER_ACCOUNT, ZONE_ID };
