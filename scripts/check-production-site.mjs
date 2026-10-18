/**
 * Production smoke check for the Queer Global coming-soon page.
 *
 * @module check-production-site
 * @exports {string} EXPECTED_COMING_SOON_TITLE - Document title substring required in HTML.
 * @exports {number} EXPECTED_HTTP_STATUS - Required successful HTTP status (200).
 * @exports {htmlContainsTitle} htmlContainsTitle - Test whether HTML includes the title text.
 * @exports {checkComingSoonProduction} checkComingSoonProduction - Fetch URL and validate status + title.
 * @exports {checkComingSoonProductionWithRetries} checkComingSoonProductionWithRetries - Retry until success or budget exhausted.
 * @exports {parseRetryConfigFromEnv} parseRetryConfigFromEnv - Read retry settings from environment variables.
 * @exports {runComingSoonCheck} runComingSoonCheck - CLI helper; returns process exit code.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ ok: true, status: number, titleFound: true }} ComingSoonOk */
/** @typedef {{ ok: false, status: number | null, error: string, bodySnippet?: string }} ComingSoonFail */

export const EXPECTED_COMING_SOON_TITLE = "Queer Global: coming soon";
export const EXPECTED_HTTP_STATUS = 200;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOTAL_MS = 300_000;
const DEFAULT_INITIAL_DELAY_MS = 5_000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_BACKOFF_MULTIPLIER = 1.5;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   maxTotalMs: number,
 *   initialDelayMs: number,
 *   maxDelayMs: number,
 *   backoffMultiplier: number,
 * }}
 */
export function parseRetryConfigFromEnv(env = process.env) {
  const readInt = (key, fallback) => {
    const raw = env[key];
    if (raw === undefined || raw === "") {
      return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${key} must be a non-negative integer, got ${raw}`);
    }
    return parsed;
  };

  const readFloat = (key, fallback) => {
    const raw = env[key];
    if (raw === undefined || raw === "") {
      return fallback;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${key} must be a positive number, got ${raw}`);
    }
    return parsed;
  };

  return {
    maxTotalMs: readInt("CHECK_PRODUCTION_MAX_TOTAL_MS", DEFAULT_MAX_TOTAL_MS),
    initialDelayMs: readInt(
      "CHECK_PRODUCTION_INITIAL_DELAY_MS",
      DEFAULT_INITIAL_DELAY_MS,
    ),
    maxDelayMs: readInt("CHECK_PRODUCTION_MAX_DELAY_MS", DEFAULT_MAX_DELAY_MS),
    backoffMultiplier: readFloat(
      "CHECK_PRODUCTION_BACKOFF_MULTIPLIER",
      DEFAULT_BACKOFF_MULTIPLIER,
    ),
  };
}

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
 * @param {string} url
 * @param {{
 *   expectedTitle?: string,
 *   expectedStatus?: number,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   maxTotalMs?: number,
 *   initialDelayMs?: number,
 *   maxDelayMs?: number,
 *   backoffMultiplier?: number,
 *   sleepFn?: (ms: number) => Promise<void>,
 *   logFn?: (entry: Record<string, unknown>) => void,
 *   nowFn?: () => number,
 * }} [options]
 * @returns {Promise<ComingSoonOk | ComingSoonFail>}
 */
export async function checkComingSoonProductionWithRetries(url, options = {}) {
  const envRetry = parseRetryConfigFromEnv();
  const maxTotalMs = options.maxTotalMs ?? envRetry.maxTotalMs;
  const initialDelayMs = options.initialDelayMs ?? envRetry.initialDelayMs;
  const maxDelayMs = options.maxDelayMs ?? envRetry.maxDelayMs;
  const backoffMultiplier = options.backoffMultiplier ?? envRetry.backoffMultiplier;
  const sleepFn =
    options.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const logFn = options.logFn ?? ((entry) => console.log(JSON.stringify(entry)));
  const nowFn = options.nowFn ?? (() => Date.now());

  const startedAtMs = nowFn();
  let attempt = 0;
  let delayMs = initialDelayMs;
  /** @type {ComingSoonOk | ComingSoonFail | undefined} */
  let lastResult;

  while (true) {
    attempt += 1;
    const attemptStartedAtMs = nowFn();
    lastResult = await checkComingSoonProduction(url, options);

    logFn({
      event: "production_smoke_check_attempt",
      url,
      attempt,
      ok: lastResult.ok,
      httpStatus: lastResult.status,
      error: lastResult.ok ? undefined : lastResult.error,
      elapsedMs: attemptStartedAtMs - startedAtMs,
    });

    if (lastResult.ok) {
      return lastResult;
    }

    const elapsedMs = nowFn() - startedAtMs;
    if (elapsedMs >= maxTotalMs) {
      logFn({
        event: "production_smoke_check_exhausted",
        url,
        attempts: attempt,
        maxTotalMs,
        lastError: lastResult.error,
      });
      return lastResult;
    }

    const remainingMs = maxTotalMs - elapsedMs;
    const waitMs = Math.min(delayMs, remainingMs);
    if (waitMs <= 0) {
      logFn({
        event: "production_smoke_check_exhausted",
        url,
        attempts: attempt,
        maxTotalMs,
        lastError: lastResult.error,
      });
      return lastResult;
    }

    logFn({
      event: "production_smoke_check_backoff",
      url,
      attempt,
      waitMs,
      nextAttempt: attempt + 1,
    });

    await sleepFn(waitMs);
    delayMs = Math.min(Math.ceil(delayMs * backoffMultiplier), maxDelayMs);
  }
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function runComingSoonCheck(argv = process.argv.slice(2)) {
  const url = argv[0] ?? "https://queerglobal.grandkru.com";
  const result = await checkComingSoonProductionWithRetries(url);
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
