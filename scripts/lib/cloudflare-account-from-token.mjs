/**
 * Derive Cloudflare account ID from a bootstrap token (read-only zone lookup).
 *
 * @module lib/cloudflare-account-from-token
 */

import { cloudflareBearerGet } from "./cloudflare-github-api.mjs";

/**
 * @param {{
 *   token: string,
 *   zoneName?: string,
 *   fetchImpl?: typeof fetch,
 * }} input
 * @returns {Promise<{ ok: true, accountId: string } | { ok: false, error: string }>}
 */
export async function cloudflareAccountIdFromToken(input) {
  const zoneName = input.zoneName ?? "grandkru.com";
  const fetchImpl = input.fetchImpl ?? fetch;
  if (!input.token) {
    return { ok: false, error: "CLOUDFLARE_API_TOKEN is required." };
  }

  const response = await cloudflareBearerGet(
    `/zones?name=${encodeURIComponent(zoneName)}`,
    input.token,
    fetchImpl,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.errors?.[0]?.message ?? body.message ?? response.statusText;
    return { ok: false, error: `Cloudflare zone lookup failed for ${zoneName}: ${message}` };
  }
  const zones = body.result;
  if (!Array.isArray(zones) || zones.length !== 1) {
    return {
      ok: false,
      error: `Expected exactly one zone named ${zoneName} visible to the bootstrap token.`,
    };
  }
  const zone = zones[0];
  const accountId = zone.account?.id ?? zone.account_id;
  if (typeof accountId !== "string" || !/^[0-9a-f]{32}$/.test(accountId)) {
    return { ok: false, error: `Zone ${zoneName} response missing a valid account id.` };
  }
  return { ok: true, accountId };
}
