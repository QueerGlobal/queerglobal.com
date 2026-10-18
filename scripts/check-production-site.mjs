/**
 * Production smoke check for the Queer Global coming-soon page.
 *
 * @module check-production-site
 * @exports {string} EXPECTED_COMING_SOON_TITLE - Document title substring required in HTML.
 * @exports {number} EXPECTED_HTTP_STATUS - Required successful HTTP status (200).
 * @exports {htmlContainsTitle} htmlContainsTitle - Test whether HTML includes the title text.
 * @exports {checkComingSoonProduction} checkComingSoonProduction - Fetch URL and validate status + title.
 * @exports {runComingSoonCheck} runComingSoonCheck - CLI helper; returns process exit code.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ ok: true, status: number, titleFound: true }} ComingSoonOk */
/** @typedef {{ ok: false, status: number | null, error: string, bodySnippet?: string }} ComingSoonFail */

export const EXPECTED_COMING_SOON_TITLE = "Queer Global: coming soon";
export const EXPECTED_HTTP_STATUS = 200;

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * @param {string} html
 * @param {string} expectedTitle
 * @returns {boolean}
 */
export function htmlContainsTitle(html, expectedTitle = EXPECTED_COMING_SOON_TITLE) {
  return html.includes(expectedTitle);
}

/**
 * @param {string} url
 * @param {{
 *   expectedTitle?: string,
 *   expectedStatus?: number,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 * }} [options]
 * @returns {Promise<ComingSoonOk | ComingSoonFail>}
 */
export async function checkComingSoonProduction(url, options = {}) {
  const expectedTitle = options.expectedTitle ?? EXPECTED_COMING_SOON_TITLE;
  const expectedStatus = options.expectedStatus ?? EXPECTED_HTTP_STATUS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });
    const status = response.status;
    const body = await response.text();

    if (status !== expectedStatus) {
      return {
        ok: false,
        status,
        error: `Expected HTTP ${expectedStatus}, got ${status}.`,
        bodySnippet: body.slice(0, 240),
      };
    }

    if (!htmlContainsTitle(body, expectedTitle)) {
      return {
        ok: false,
        status,
        error: `Response body did not include title text: ${expectedTitle}`,
        bodySnippet: body.slice(0, 240),
      };
    }

    return { ok: true, status, titleFound: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: null,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function runComingSoonCheck(argv = process.argv.slice(2)) {
  const url = argv[0] ?? "https://queerglobal.grandkru.com";
  const result = await checkComingSoonProduction(url);
  if (result.ok) {
    console.log(`OK ${url} returned ${result.status} with expected title.`);
    return 0;
  }
  console.error(`Production check failed for ${url}: ${result.error}`);
  if (result.status !== null) {
    console.error(`HTTP status: ${result.status}`);
  }
  if (result.bodySnippet) {
    console.error(`Body snippet: ${result.bodySnippet}`);
  }
  return 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  process.exitCode = await runComingSoonCheck();
}
