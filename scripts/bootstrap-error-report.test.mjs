import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createBootstrapErrorReporter, runBootstrapCli, scrubSecrets } from "./bootstrap-error-report.mjs";

describe("bootstrap error reporting", () => {
  it("is a no-op when SENTRY_DSN is unset", async () => {
    const saved = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    const calls = [];
    try {
      const reporter = createBootstrapErrorReporter({ capture: async (...a) => { calls.push(a); } });
      await reporter.report(new Error("ignored"));
    } finally {
      if (saved !== undefined) process.env.SENTRY_DSN = saved;
    }
    assert.equal(calls.length, 0);
  });

  it("default capture posts a scrubbed event to the DSN host", async () => {
    const calls = [];
    const saved = process.env.TF_VAR_github_token;
    process.env.TF_VAR_github_token = "plainsecretvalue123";
    try {
      const reporter = createBootstrapErrorReporter({
        dsn: "https://publickey@o0.ingest.sentry.io/42",
        fetchImpl: async (url, init) => {
          calls.push({ url: String(url), init });
          return { ok: true };
        },
      });
      await reporter.report(new Error("boom ghp_abcDEF123 dp.pt.xyz789 plainsecretvalue123 Bearer cf-token"));
    } finally {
      if (saved === undefined) delete process.env.TF_VAR_github_token;
      else process.env.TF_VAR_github_token = saved;
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://o0.ingest.sentry.io/api/42/store/");
    assert.match(calls[0].init.headers["X-Sentry-Auth"], /sentry_key=publickey/);
    const body = JSON.parse(calls[0].init.body);
    assert.doesNotMatch(body.message, /ghp_abc|dp\.pt\.xyz|plainsecretvalue123|cf-token/);
    assert.equal(body.tags.component, "bootstrap-cli");
  });

  it("never masks the original error when Sentry is unreachable", async () => {
    await assert.rejects(
      runBootstrapCli(
        async () => {
          throw new Error("original");
        },
        { dsn: "https://k@o0.ingest.sentry.io/1", capture: async () => { throw new Error("network down"); } },
      ),
      /original/,
    );
  });

  it("scrubSecrets redacts env secret values", () => {
    assert.equal(scrubSecrets("x hunter2hunter2 y", { CLOUDFLARE_API_TOKEN: "hunter2hunter2" }), "x [redacted] y");
  });

  it("calls the injected capture when a DSN is set", async () => {
    const calls = [];
    const reporter = createBootstrapErrorReporter({
      dsn: "https://key@o0.ingest.sentry.io/1",
      capture: async (activeDsn, err) => {
        calls.push({ dsn: activeDsn, message: err instanceof Error ? err.message : String(err) });
      },
    });
    await reporter.report(new Error("bootstrap cli failure"));
    assert.equal(calls.length, 1);
    assert.match(calls[0].dsn, /sentry\.io/);
    assert.equal(calls[0].message, "bootstrap cli failure");
  });

  it("reports uncaught errors from runBootstrapCli", async () => {
    const calls = [];
    let threw = false;
    try {
      await runBootstrapCli(
        async () => {
          throw new Error("top-level");
        },
        {
          dsn: "https://key@o0.ingest.sentry.io/1",
          capture: async (_dsn, err) => {
            calls.push(err);
          },
        },
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, true);
    assert.equal(calls.length, 1);
  });
});
