/**
 * Verify the bootstrap Cloudflare API token before OpenTofu writes (capability probes).
 *
 * @module preflight-bootstrap-cloudflare
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBootstrapCli } from "./bootstrap-error-report.mjs";

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
 * @param {unknown} body
 * @returns {body is { success: true, result: { status: string } }}
 */
function verifyBodyActive(body) {
  return (
    typeof body === "object" &&
    body !== null &&
    body.success === true &&
    typeof body.result === "object" &&
    body.result !== null &&
    body.result.status === "active"
  );
}

/**
 * @param {{
 *   token: string,
 *   accountId: string,
 *   fetchImpl: typeof fetch,
 * }} input
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function cloudflareVerifyActiveToken(input) {
  const accountVerify = await cloudflareGet(
    input.token,
    `/accounts/${input.accountId}/tokens/verify`,
    input.fetchImpl,
  );
  const accountBody = await accountVerify.json();
  if (accountVerify.ok && verifyBodyActive(accountBody)) {
    return { ok: true };
  }

  const userVerify = await cloudflareGet(input.token, "/user/tokens/verify", input.fetchImpl);
  const userBody = await userVerify.json();
  if (userVerify.ok && verifyBodyActive(userBody)) {
    return { ok: true };
  }

  const message =
    userBody.errors?.[0]?.message ??
    accountBody.errors?.[0]?.message ??
    userVerify.statusText;
  return { ok: false, error: `Cloudflare token verify failed (must be active): ${message}` };
}

/**
 * @param {{
 *   token: string,
 *   accountId: string,
 *   fetchImpl: typeof fetch,
 * }} input
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function cloudflareProbeR2Buckets(input) {
  const response = await cloudflareGet(
    input.token,
    `/accounts/${input.accountId}/r2/buckets`,
    input.fetchImpl,
  );
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    const code = body.errors?.[0]?.code;
    const message = body.errors?.[0]?.message ?? response.statusText;
    return {
      ok: false,
      error: `Cloudflare R2 probe failed (need Workers R2 Storage access on account ${input.accountId}): ${message}${code !== undefined ? ` (code ${code})` : ""}. R2 write cannot be verified by a read probe; the first bootstrap apply fails closed if write is missing.`,
    };
  }
  if (!Array.isArray(body.result)) {
    return { ok: false, error: "Cloudflare R2 probe returned an unexpected payload." };
  }
  return { ok: true };
}

/**
 * @param {{
 *   token: string,
 *   accountId: string,
 *   zoneName: string,
 *   fetchImpl: typeof fetch,
 * }} input
 * @returns {Promise<{ ok: true, zoneId: string } | { ok: false, error: string }>}
 */
export async function cloudflareProbeZoneOnAccount(input) {
  const query = new URLSearchParams({
    name: input.zoneName,
    "account.id": input.accountId,
  });
  const response = await cloudflareGet(
    input.token,
    `/zones?${query.toString()}`,
    input.fetchImpl,
  );
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    const message = body.errors?.[0]?.message ?? response.statusText;
    return {
      ok: false,
      error: `Cloudflare zone probe failed for ${input.zoneName} on account ${input.accountId}: ${message}`,
    };
  }
  if (!Array.isArray(body.result) || body.result.length !== 1) {
    return {
      ok: false,
      error: `Expected exactly one zone named ${input.zoneName} on account ${input.accountId}.`,
    };
  }
  const zone = body.result[0];
  const zoneAccountId = zone.account?.id ?? zone.account_id;
  if (zoneAccountId !== input.accountId) {
    return {
      ok: false,
      error: `Zone ${input.zoneName} is not on account ${input.accountId}.`,
    };
  }
  if (typeof zone.id !== "string" || zone.id.length === 0) {
    return { ok: false, error: `Zone ${input.zoneName} response missing id.` };
  }
  return { ok: true, zoneId: zone.id };
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

  const verify = await cloudflareVerifyActiveToken({ token, accountId, fetchImpl });
  if (!verify.ok) {
    return verify;
  }

  const r2 = await cloudflareProbeR2Buckets({ token, accountId, fetchImpl });
  if (!r2.ok) {
    return r2;
  }

  const zone = await cloudflareProbeZoneOnAccount({
    token,
    accountId,
    zoneName,
    fetchImpl,
  });
  if (!zone.ok) {
    return zone;
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
  runBootstrapCli(async () => {
    process.exitCode = await runPreflightBootstrapCloudflareCli();
  }).catch(() => {
    process.exitCode = 1;
  });
}
