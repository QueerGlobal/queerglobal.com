import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EXPECTED_COMING_SOON_TITLE,
  EXPECTED_HTTP_STATUS,
  checkComingSoonProduction,
  checkComingSoonProductionWithRetries,
  htmlContainsTitle,
  parseRetryConfigFromEnv,
} from "./check-production-site.mjs";

describe("htmlContainsTitle", () => {
  it("matches the coming-soon document title", () => {
    const html = "<html><head><title>Queer Global: coming soon</title></head></html>";
    assert.equal(htmlContainsTitle(html), true);
  });
});

describe("checkComingSoonProduction", () => {
  it("passes on HTTP 200 with expected title", async () => {
    const fetchImpl = async () => ({
      status: 200,
      text: async () => `<title>${EXPECTED_COMING_SOON_TITLE}</title>`,
    });
    const result = await checkComingSoonProduction("https://example.test", { fetchImpl });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, EXPECTED_HTTP_STATUS);
    }
  });

  it("fails when status is not 200", async () => {
    const fetchImpl = async () => ({
      status: 503,
      text: async () => "<title>down</title>",
    });
    const result = await checkComingSoonProduction("https://example.test", { fetchImpl });
    assert.equal(result.ok, false);
  });

  it("fails when title is missing", async () => {
    const fetchImpl = async () => ({
      status: 200,
      text: async () => "<title>Other</title>",
    });
    const result = await checkComingSoonProduction("https://example.test", { fetchImpl });
    assert.equal(result.ok, false);
  });
});

describe("parseRetryConfigFromEnv", () => {
  it("uses defaults when env vars are unset", () => {
    const config = parseRetryConfigFromEnv({});
    assert.equal(config.maxTotalMs, 300_000);
    assert.equal(config.initialDelayMs, 5_000);
  });
});

describe("checkComingSoonProductionWithRetries", () => {
  it("retries until the site responds successfully", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3) {
        return {
          status: 525,
          text: async () => "<title>SSL handshake failed</title>",
        };
      }
      return {
        status: 200,
        text: async () => `<title>${EXPECTED_COMING_SOON_TITLE}</title>`,
      };
    };

    const logEntries = [];
    const sleeps = [];
    let now = 0;
    const result = await checkComingSoonProductionWithRetries("https://example.test", {
      fetchImpl,
      maxTotalMs: 60_000,
      initialDelayMs: 1_000,
      maxDelayMs: 5_000,
      backoffMultiplier: 2,
      sleepFn: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
      nowFn: () => now,
      logFn: (entry) => logEntries.push(entry),
    });

    assert.equal(result.ok, true);
    assert.equal(calls, 3);
    assert.equal(sleeps.length, 2);
    assert.ok(logEntries.some((e) => e.event === "production_smoke_check_attempt"));
    assert.ok(logEntries.some((e) => e.event === "production_smoke_check_backoff"));
  });

  it("stops after the retry budget is exhausted", async () => {
    const fetchImpl = async () => ({
      status: 503,
      text: async () => "<title>down</title>",
    });
    const logEntries = [];
    let now = 0;

    const result = await checkComingSoonProductionWithRetries("https://example.test", {
      fetchImpl,
      maxTotalMs: 2_500,
      initialDelayMs: 1_000,
      maxDelayMs: 1_000,
      backoffMultiplier: 1,
      sleepFn: async (ms) => {
        now += ms;
      },
      nowFn: () => now,
      logFn: (entry) => logEntries.push(entry),
    });

    assert.equal(result.ok, false);
    assert.ok(logEntries.some((e) => e.event === "production_smoke_check_exhausted"));
  });
});
