/**
 * Verify the bootstrap Cloudflare API token before OpenTofu writes.
 *
 * @module preflight-bootstrap-cloudflare
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.cloudflare.com/client/v4";

/** @type {readonly string[]} */
export const REQUIRED_CLOUDFLARE_PERMISSION_GROUPS = [
  "Account API Tokens Write",
  "Workers R2 Storage Write",
  "Zone Read",
];

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
 * @param {unknown} policies
 * @param {string} accountId
 * @param {string} zoneId
 * @returns {string | null}
 */
export function missingCloudflareBootstrapPolicies(policies, accountId, zoneId) {
  if (!Array.isArray(policies)) {
    return "Token has no policies.";
  }

  const accountResource = `com.cloudflare.api.account.${accountId}`;
  const zoneResource = `com.cloudflare.api.account.zone.${zoneId}`;

  /** @type {Map<string, { account: boolean, zone: boolean }>} */
  const found = new Map(
    REQUIRED_CLOUDFLARE_PERMISSION_GROUPS.map((name) => [name, { account: false, zone: false }]),
  );

  for (const policy of policies) {
    if (policy?.effect !== "allow") {
      continue;
    }
    const resources = policy.resources ?? {};
    const resourceKeys = Object.keys(resources);
    const onAccount = resourceKeys.some(
      (key) => key === accountResource || key === "com.cloudflare.api.account.*",
    );
    const onZone = resourceKeys.some(
      (key) =>
        key === zoneResource ||
        key === "com.cloudflare.api.account.zone.*" ||
        key.endsWith(`.zone.${zoneId}`),
    );

    for (const group of policy.permission_groups ?? []) {
      const name = group?.name;
      if (typeof name !== "string" || !found.has(name)) {
        continue;
      }
      const entry = found.get(name);
      if (!entry) {
        continue;
      }
      if (name === "Zone Read") {
        if (onZone || onAccount) {
          entry.zone = true;
        }
      } else if (onAccount) {
        entry.account = true;
      }
    }
  }

  for (const name of REQUIRED_CLOUDFLARE_PERMISSION_GROUPS) {
    const entry = found.get(name);
    if (!entry) {
      return `Missing allow policy for ${name}.`;
    }
    if (name === "Zone Read") {
      if (!entry.zone) {
        return `Zone Read must be allowed for this account and zone (grandkru.com).`;
      }
    } else if (!entry.account) {
      return `${name} must be allowed for account ${accountId}.`;
    }
  }

  return null;
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

  let tokenKind = "user";
  let tokenId = "";

  const accountVerify = await cloudflareGet(
    token,
    `/accounts/${accountId}/tokens/verify`,
    fetchImpl,
  );
  const accountVerifyBody = await accountVerify.json();
  if (accountVerify.ok && accountVerifyBody.success === true) {
    tokenKind = "account";
    tokenId = accountVerifyBody.result?.id ?? "";
  } else {
    const userVerify = await cloudflareGet(token, "/user/tokens/verify", fetchImpl);
    const userVerifyBody = await userVerify.json();
    if (!userVerify.ok || userVerifyBody.success !== true) {
      const message =
        userVerifyBody.errors?.[0]?.message ??
        accountVerifyBody.errors?.[0]?.message ??
        userVerify.statusText;
      return { ok: false, error: `Cloudflare token verify failed: ${message}` };
    }
    tokenKind = "user";
    tokenId = userVerifyBody.result?.id ?? "";
  }

  if (!tokenId) {
    return { ok: false, error: "Cloudflare token verify did not return a token id." };
  }

  const tokenPath =
    tokenKind === "account"
      ? `/accounts/${accountId}/tokens/${tokenId}`
      : `/user/tokens/${tokenId}`;
  const tokenRecord = await cloudflareGet(token, tokenPath, fetchImpl);
  const tokenRecordBody = await tokenRecord.json();
  if (!tokenRecord.ok || tokenRecordBody.success !== true) {
    const message = tokenRecordBody.errors?.[0]?.message ?? tokenRecord.statusText;
    return { ok: false, error: `Cloudflare token record fetch failed: ${message}` };
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
  const zoneId = zonesBody.result[0]?.id;
  if (typeof zoneId !== "string" || zoneId.length === 0) {
    return { ok: false, error: `Zone ${zoneName} response missing zone id.` };
  }

  const policyError = missingCloudflareBootstrapPolicies(
    tokenRecordBody.result?.policies,
    accountId,
    zoneId,
  );
  if (policyError) {
    return { ok: false, error: policyError };
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
