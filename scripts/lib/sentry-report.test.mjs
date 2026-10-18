import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import { createErrorReporter } from "./sentry-report.mjs";

describe("sentry-report", () => {
  it("emits structured JSON log lines when reporting", async () => {
    const lines = [];
    const orig = process.stderr.write;
    process.stderr.write = (chunk) => {
      lines.push(String(chunk));
      return true;
    };
    try {
      const reporter = createErrorReporter({
        dsn: "http://127.0.0.1:9/1",
        component: "test-component",
        capture: async () => {},
      });
      await reporter.report(new Error("structured test"));
    } finally {
      process.stderr.write = orig;
    }
    const parsed = lines
      .join("")
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l));
    assert.ok(parsed.some((p) => p.event === "sentry_report" && p.component === "test-component"));
    assert.ok(parsed.some((p) => p.reported === true && p.ok === true));
  });

  it("logs a structured line with reported false when SENTRY_DSN is unset", async () => {
    const lines = [];
    const orig = process.stderr.write;
    process.stderr.write = (chunk) => {
      lines.push(String(chunk));
      return true;
    };
    const saved = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    try {
      const reporter = createErrorReporter({ dsn: "", component: "no-dsn" });
      await reporter.report(new Error("offline failure"));
    } finally {
      process.stderr.write = orig;
      if (saved !== undefined) {
        process.env.SENTRY_DSN = saved;
      } else {
        delete process.env.SENTRY_DSN;
      }
    }
    const parsed = lines
      .join("")
      .trim()
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l));
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0], {
      event: "sentry_report",
      component: "no-dsn",
      ok: false,
      message: "offline failure",
      reported: false,
      reason: "SENTRY_DSN unset",
    });
  });

  it("finishes promptly when the Sentry host refuses connections", () => {
    const started = Date.now();
    const r = spawnSync(process.execPath, ["scripts/report-cli-failure.mjs", "unreachable-sentry", "1"], {
      env: { PATH: process.env.PATH ?? "", SENTRY_DSN: "http://publickey@127.0.0.1:9/1" },
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(r.error, undefined, "report-cli-failure hung until the test timeout");
    assert.equal(r.status, 0, r.stderr);
    assert.ok(Date.now() - started < 15_000, "reporting must not block a failing step");
  });
});
