/** Shared stand-in fetch for bootstrap preflight tests. */

export const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
export const ZONE_ID = "4f8b3c2d1e0a9b8c7d6e5f4a3b2c1d0e";

/**
 * @returns {typeof fetch}
 */
export function bootstrapStandInFetch() {
  return async (url) => {
    const pathStr = String(url);
    if (pathStr.includes(`/accounts/${ACCOUNT_ID}/tokens/verify`)) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: { id: "cf-token-id", status: "active" },
        }),
      };
    }
    if (pathStr.includes("/user/tokens/verify")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: { id: "cf-user-token-id", status: "active" },
        }),
      };
    }
    if (pathStr.includes(`/accounts/${ACCOUNT_ID}/r2/buckets`)) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [{ name: "existing-bucket", creation_date: "2024-01-01T00:00:00.000Z" }],
        }),
      };
    }
    if (pathStr.includes("/zones?")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              id: ZONE_ID,
              name: "grandkru.com",
              account: { id: ACCOUNT_ID, name: "Example account" },
            },
          ],
        }),
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
    throw new Error(`bootstrap stand-in fetch: unexpected url ${url}`);
  };
}

/**
 * @param {(url: string) => Promise<Response> | Response | undefined} override
 * @returns {typeof fetch}
 */
export function fetchWith(override) {
  const base = bootstrapStandInFetch();
  return async (url, init) => {
    const custom = await override(String(url));
    if (custom !== undefined) {
      return custom;
    }
    return base(url, init);
  };
}

/**
 * Realistic Cloudflare shapes for tests that need explicit verify + zone payloads.
 * @returns {typeof fetch}
 */
export function cloudflareFullShapeFetch() {
  return bootstrapStandInFetch();
}
