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
    message: errorMessage(err),
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
      await capture(dsn, err);
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
