import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createBootstrapErrorReporter, runBootstrapCli } from "./bootstrap-error-report.mjs";

describe("bootstrap error reporting", () => {
  it("is a no-op when SENTRY_DSN is unset", async () => {
    const reporter = createBootstrapErrorReporter({ dsn: "" });
    await reporter.report(new Error("ignored"));
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
