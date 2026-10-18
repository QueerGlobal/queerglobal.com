/**
 * Verify the bootstrap Cloudflare API token before OpenTofu writes (capability probes).
 *
 * @module preflight-bootstrap-cloudflare
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBootstrapCli } from "./bootstrap-error-report.mjs";
import { cloudflareAccountIdFromToken } from "./lib/cloudflare-account-from-token.mjs";
import { cloudflareBearerGet } from "./lib/cloudflare-github-api.mjs";

const ACCOUNT_API_TOKENS_WRITE = "Account API Tokens Write";

/**
 * @param {unknown} body
 * @returns {body is { success: true, result: { status: string, id?: string } }}
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
 * @returns {Promise<
 *   | { ok: true, tokenId: string, tokenKind: "account" | "user" }
 *   | { ok: false, error: string }
 * >}
 */
export async function cloudflareVerifyActiveToken(input) {
  const accountVerify = await cloudflareBearerGet(
    `/accounts/${input.accountId}/tokens/verify`,
    input.token,
    input.fetchImpl,
  );
  const accountBody = await accountVerify.json();
  if (accountVerify.ok && verifyBodyActive(accountBody)) {
    const tokenId = accountBody.result.id;
    if (typeof tokenId === "string" && tokenId.length > 0) {
      return { ok: true, tokenId, tokenKind: "account" };
    }
    return { ok: false, error: "Cloudflare account token verify succeeded but returned no token id." };
  }

  const userVerify = await cloudflareBearerGet("/user/tokens/verify", input.token, input.fetchImpl);
  const userBody = await userVerify.json();
  if (userVerify.ok && verifyBodyActive(userBody)) {
    const tokenId = userBody.result.id;
    if (typeof tokenId === "string" && tokenId.length > 0) {
      return { ok: true, tokenId, tokenKind: "user" };
    }
    return { ok: false, error: "Cloudflare user token verify succeeded but returned no token id." };
  }

  const message =
    userBody.errors?.[0]?.message ??
    accountBody.errors?.[0]?.message ??
    userVerify.statusText;
  return { ok: false, error: `Cloudflare token verify failed (must be active): ${message}` };
}

/**
 * True when a token policy's resources include this account (by ID or the account wildcard).
 *
 * @param {{ resources?: Record<string, unknown> }} policy
 * @param {string} accountId
 * @returns {boolean}
 */
function policyCoversAccount(policy, accountId) {
  const keys = Object.keys(policy.resources ?? {});
  return keys.includes(`com.cloudflare.api.account.${accountId}`) || keys.includes("com.cloudflare.api.account.*");
}

/**
 * @param {{
 *   token: string,
 *   accountId: string,
 *   tokenId: string,
 *   tokenKind: "account" | "user",
 *   fetchImpl: typeof fetch,
 * }} input
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function cloudflareProbeAccountApiTokensWrite(input) {
  const pathSuffix =
    input.tokenKind === "account"
      ? `/accounts/${input.accountId}/tokens/${input.tokenId}`
      : `/user/tokens/${input.tokenId}`;
  const response = await cloudflareBearerGet(pathSuffix, input.token, input.fetchImpl);
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    const message = body.errors?.[0]?.message ?? response.statusText;
    return {
      ok: false,
      error: `Cloudflare token policy read failed (GET ${pathSuffix}): ${message}`,
    };
  }
  const policies = body.result?.policies;
  if (!Array.isArray(policies)) {
    return { ok: false, error: "Cloudflare token detail returned an unexpected payload." };
  }
  const grantsWrite = (policy) =>
    (policy.permission_groups ?? []).some(
      (group) =>
        typeof group.name === "string" &&
        group.name.toLowerCase() === ACCOUNT_API_TOKENS_WRITE.toLowerCase(),
    ) && policyCoversAccount(policy, input.accountId);
  const denied = policies.some((policy) => policy.effect === "deny" && grantsWrite(policy));
  const hasWrite = !denied && policies.some((policy) => policy.effect === "allow" && grantsWrite(policy));
  if (!hasWrite) {
    return {
      ok: false,
      error: `Cloudflare bootstrap token is missing an allow policy for ${ACCOUNT_API_TOKENS_WRITE} on account ${input.accountId} (required to create account API tokens during bootstrap apply).`,
    };
  }
  return { ok: true };
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
  const response = await cloudflareBearerGet(
    `/accounts/${input.accountId}/r2/buckets`,
    input.token,
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
  const response = await cloudflareBearerGet(
    `/zones?${query.toString()}`,
    input.token,
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
  let accountId = options.accountId ?? "";
  const zoneName = options.zoneName ?? "grandkru.com";
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!token) {
    return { ok: false, error: "CLOUDFLARE_API_TOKEN is required." };
  }
  if (!accountId) {
    const derived = await cloudflareAccountIdFromToken({ token, zoneName, fetchImpl });
    if (!derived.ok) {
      return derived;
    }
    accountId = derived.accountId;
    const fromEnv = process.env.TF_VAR_cloudflare_account_id ?? "";
    if (fromEnv && fromEnv !== accountId) {
      return {
        ok: false,
        error: `TF_VAR_cloudflare_account_id does not match the account for ${zoneName} from the token; unset it and let preflight derive the account id.`,
      };
    }
    process.env.TF_VAR_cloudflare_account_id = accountId;
  }

  const verify = await cloudflareVerifyActiveToken({ token, accountId, fetchImpl });
  if (!verify.ok) {
    return verify;
  }

  const tokensWrite = await cloudflareProbeAccountApiTokensWrite({
    token,
    accountId,
    tokenId: verify.tokenId,
    tokenKind: verify.tokenKind,
    fetchImpl,
  });
  if (!tokensWrite.ok) {
    return tokensWrite;
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
