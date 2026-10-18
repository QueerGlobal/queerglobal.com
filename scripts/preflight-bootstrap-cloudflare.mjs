/**
 * Verify the bootstrap Cloudflare API token before OpenTofu writes.
 *
 * @module preflight-bootstrap-cloudflare
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.cloudflare.com/client/v4";

/**
 * @param {string} token
 * @param {string} pathSuffix
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<Response>}
 */
async function cloudflareGet(token, pathSuffix, fetchImpl) {
  return fetchImpl(`${API}${pathSuffix}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * @param {{
 *   accountId: string,
 *   zoneName?: string,
 *   token?: string,
 *   fetchImpl?: typeof fetch,
 * }} options
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function preflightBootstrapCloudflare(options) {
  const token = options.token ?? process.env.CLOUDFLARE_API_TOKEN;
  const accountId = options.accountId ?? process.env.TF_VAR_cloudflare_account_id;
  const zoneName = options.zoneName ?? "grandkru.com";
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!token) {
    return { ok: false, error: "CLOUDFLARE_API_TOKEN is required." };
  }
  if (!accountId) {
    return { ok: false, error: "TF_VAR_cloudflare_account_id is required." };
  }

  const verify = await cloudflareGet(token, "/user/tokens/verify", fetchImpl);
  const verifyBody = await verify.json();
  if (!verify.ok || verifyBody.success !== true) {
    const message = verifyBody.errors?.[0]?.message ?? verify.statusText;
    return { ok: false, error: `Cloudflare token verify failed: ${message}` };
  }

  const groups = await cloudflareGet(
    token,
    `/accounts/${accountId}/tokens/permission_groups`,
    fetchImpl,
  );
  const groupsBody = await groups.json();
  if (!groups.ok || groupsBody.success !== true) {
    const message = groupsBody.errors?.[0]?.message ?? groups.statusText;
    return {
      ok: false,
      error: `Cloudflare token cannot list account API token permission groups (need Account API Tokens Write): ${message}`,
    };
  }

  const zones = await cloudflareGet(
    token,
    `/zones?name=${encodeURIComponent(zoneName)}`,
    fetchImpl,
  );
  const zonesBody = await zones.json();
  if (!zones.ok || zonesBody.success !== true) {
    const message = zonesBody.errors?.[0]?.message ?? zones.statusText;
    return { ok: false, error: `Cloudflare token cannot read zone ${zoneName}: ${message}` };
  }
  if (!Array.isArray(zonesBody.result) || zonesBody.result.length === 0) {
    return { ok: false, error: `Zone ${zoneName} was not found in this account.` };
  }

  return { ok: true };
}

/**
 * @returns {Promise<number>}
 */
export async function runPreflightBootstrapCloudflareCli() {
  const result = await preflightBootstrapCloudflare({});
  if (result.ok) {
    console.log("OK Cloudflare bootstrap token preflight passed.");
    return 0;
  }
  console.error(result.error);
  return 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  process.exitCode = await runPreflightBootstrapCloudflareCli();
}
