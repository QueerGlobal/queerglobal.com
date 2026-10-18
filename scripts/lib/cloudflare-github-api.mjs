/** Shared Cloudflare and GitHub REST helpers (Bearer auth; no secrets on argv). */

export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * @param {string} pathSuffix
 * @param {string} token
 * @param {typeof fetch} fetchImpl
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export function cloudflareBearerRequest(pathSuffix, token, fetchImpl, init = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers ?? {}),
  };
  return fetchImpl(`${CLOUDFLARE_API_BASE}${pathSuffix}`, { ...init, headers });
}

/**
 * @param {string} pathSuffix
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Response>}
 */
export function cloudflareBearerGet(pathSuffix, token, fetchImpl = fetch) {
  return cloudflareBearerRequest(pathSuffix, token, fetchImpl, { method: "GET" });
}

/**
 * @param {string} url
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export function githubBearerRequest(url, token, fetchImpl = fetch, init = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(init.headers ?? {}),
  };
  return fetchImpl(url, { ...init, headers });
}
