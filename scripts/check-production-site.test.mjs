import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EXPECTED_COMING_SOON_TITLE,
  EXPECTED_HTTP_STATUS,
  checkComingSoonProduction,
  htmlContainsTitle,
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
