/**
 * Optional Sentry reporting for bootstrap Node CLIs (no-op when SENTRY_DSN is unset).
 *
 * @module bootstrap-error-report
 */

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
];
const TOKEN_PATTERNS = [/\bgh[pousr]_[A-Za-z0-9_]+/g, /\bgithub_pat_[A-Za-z0-9_]+/g, /\bdp\.(pt|st|sa|ct|scim|audit)\.[A-Za-z0-9_.-]+/g, /Bearer\s+\S+/gi];

/**
 * Remove known secret values and token-shaped strings before anything leaves the machine.
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

/**
 * @param {string} dsn
 * @param {unknown} err
 * @param {typeof fetch} fetchImpl
 */
async function defaultCapture(dsn, err, fetchImpl) {
  const url = new URL(dsn);
  const projectId = url.pathname.replace(/^\//, "");
  const sentryUrl = `${url.protocol}//${url.host}/api/${projectId}/store/`;
  const body = JSON.stringify({
    event_id: crypto.randomUUID().replace(/-/g, ""),
    message: scrubSecrets(errorMessage(err)),
    level: "error",
    platform: "node",
    tags: { component: "bootstrap-cli" },
  });
  await fetchImpl(sentryUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${url.username}`,
    },
    body,
    signal: AbortSignal.timeout(3000),
  });
}

/**
 * @param {{ dsn?: string, capture?: (dsn: string, err: unknown) => Promise<void>, fetchImpl?: typeof fetch }} [options]
 */
export function createBootstrapErrorReporter(options = {}) {
  const dsn = options.dsn ?? process.env.SENTRY_DSN ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;
  const capture =
    options.capture ??
    (async (activeDsn, err) => {
      await defaultCapture(activeDsn, err, fetchImpl);
    });

  return {
    /**
     * @param {unknown} err
     */
    async report(err) {
      if (!dsn) {
        return;
      }
      try {
        await capture(dsn, err);
      } catch {
        // Reporting must never mask the original failure or hang the CLI.
      }
    },
  };
}

/**
 * @param {() => Promise<void>} fn
 * @param {{ dsn?: string, capture?: (dsn: string, err: unknown) => Promise<void> }} [options]
 */
export async function runBootstrapCli(fn, options = {}) {
  const reporter = createBootstrapErrorReporter(options);
  try {
    await fn();
  } catch (err) {
    await reporter.report(err);
    throw err;
  }
}
