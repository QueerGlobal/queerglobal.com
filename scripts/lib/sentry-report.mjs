/**
 * Optional Sentry reporting (no-op when SENTRY_DSN is unset).
 *
 * @module lib/sentry-report
 */

import * as Sentry from "@sentry/node";

/**
 * @param {unknown} err
 * @returns {string}
 */
function errorMessage(err) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

const SECRET_ENV_NAMES = [
  "CLOUDFLARE_API_TOKEN",
  "TF_VAR_github_token",
  "TF_VAR_doppler_management_token",
  "TF_VAR_bootstrap_state_passphrase",
  "TF_VAR_bootstrap_state_passphrase_next",
  "DOPPLER_TOKEN",
  "SENTRY_DSN",
  "GITHUB_TOKEN",
];
const TOKEN_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]+/g,
  /\bgithub_pat_[A-Za-z0-9_]+/g,
  /\bdp\.(pt|st|sa|ct|scim|audit)\.[A-Za-z0-9_.-]+/g,
  /Bearer\s+\S+/gi,
  /x-access-token:[A-Za-z0-9_.-]+/gi,
];

/**
 * @param {string} text
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function scrubSecrets(text, env = process.env) {
  let out = text;
  for (const name of SECRET_ENV_NAMES) {
    const value = env[name];
    if (value && value.length >= 4) {
      out = out.split(value).join("[redacted]");
    }
  }
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

let initialized = false;

/**
 * @param {{ dsn?: string, component?: string }} [options]
 */
function ensureSentry(options = {}) {
  const dsn = options.dsn ?? process.env.SENTRY_DSN ?? "";
  if (!dsn || initialized) {
    return dsn;
  }
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.message) {
        event.message = scrubSecrets(String(event.message));
      }
      if (event.exception?.values) {
        for (const value of event.exception.values) {
          if (value.value) {
            value.value = scrubSecrets(value.value);
          }
        }
      }
      event.tags = { ...event.tags, component: options.component ?? "cli" };
      return event;
    },
  });
  initialized = true;
  return dsn;
}

/**
 * @param {{ dsn?: string, component?: string, capture?: (err: unknown) => Promise<void> }} [options]
 */
export function createErrorReporter(options = {}) {
  const dsn = options.dsn ?? process.env.SENTRY_DSN ?? "";
  if (dsn) {
    ensureSentry({ ...options, dsn });
  }
  const capture =
    options.capture ??
    (async (err) => {
      Sentry.captureException(err instanceof Error ? err : new Error(errorMessage(err)));
      await Sentry.flush(3000);
    });

  return {
    async report(err) {
      if (!dsn) {
        return;
      }
      try {
        const message = scrubSecrets(errorMessage(err));
        await capture(err instanceof Error ? new Error(message) : new Error(message));
      } catch {
        // Reporting must never mask the original failure or hang the CLI.
      }
    },
  };
}

/**
 * @param {() => Promise<void>} fn
 * @param {{ dsn?: string, component?: string, capture?: (err: unknown) => Promise<void> }} [options]
 */
export async function runCliWithErrorReport(fn, options = {}) {
  const reporter = createErrorReporter(options);
  try {
    await fn();
  } catch (err) {
    await reporter.report(err);
    throw err;
  }
}

/**
 * @param {unknown} err
 * @param {{ component?: string }} [options]
 */
export async function reportCliFailure(err, options = {}) {
  await createErrorReporter(options).report(err);
}
