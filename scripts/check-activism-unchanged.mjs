/**
 * Ensure activism.grandkru.com was not replaced by the queerglobal coming-soon page.
 *
 * @module check-activism-unchanged
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_COMING_SOON_TITLE } from "./check-production-site.mjs";

export const DEFAULT_ACTIVISM_URL = "https://activism.grandkru.com";

/**
 * @param {string} html
 * @param {string} forbiddenTitle
 * @returns {boolean}
 */
export function activismHtmlLooksUnchanged(html, forbiddenTitle = EXPECTED_COMING_SOON_TITLE) {
  return !html.includes(forbiddenTitle);
}

/**
 * @param {string} [url]
 * @param {{ fetchImpl?: typeof fetch, forbiddenTitle?: string }} [options]
 * @returns {Promise<{ ok: true } | { ok: false, error: string, status: number | null }>}
 */
export async function checkActivismUnchanged(url = DEFAULT_ACTIVISM_URL, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const forbiddenTitle = options.forbiddenTitle ?? EXPECTED_COMING_SOON_TITLE;

  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      headers: { Accept: "text/html" },
    });
    const body = await response.text();
    if (!activismHtmlLooksUnchanged(body, forbiddenTitle)) {
      return {
        ok: false,
        status: response.status,
        error: `${url} unexpectedly includes coming-soon title text: ${forbiddenTitle}`,
      };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, error: message };
  }
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function runActivismUnchangedCheck(argv = process.argv.slice(2)) {
  const url = argv[0] ?? DEFAULT_ACTIVISM_URL;
  const result = await checkActivismUnchanged(url);
  if (result.ok) {
    console.log(`OK ${url} does not show the queerglobal coming-soon page.`);
    return 0;
  }
  console.error(`Activism check failed: ${result.error}`);
  return 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  process.exitCode = await runActivismUnchangedCheck();
}
