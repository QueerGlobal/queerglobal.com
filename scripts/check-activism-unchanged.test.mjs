import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activismHtmlLooksUnchanged,
  checkActivismUnchanged,
} from "./check-activism-unchanged.mjs";
import { EXPECTED_COMING_SOON_TITLE } from "./check-production-site.mjs";

describe("activismHtmlLooksUnchanged", () => {
  it("passes when the coming-soon title is absent", () => {
    assert.equal(activismHtmlLooksUnchanged("<title>Activism hub</title>"), true);
  });

  it("fails when the queerglobal coming-soon title appears", () => {
    assert.equal(
      activismHtmlLooksUnchanged(`<title>${EXPECTED_COMING_SOON_TITLE}</title>`),
      false,
    );
  });
});

describe("checkActivismUnchanged", () => {
  it("returns ok when fetch succeeds without the forbidden title", async () => {
    const fetchImpl = async () => ({
      status: 200,
      text: async () => "<title>Activism hub</title>",
    });
    const result = await checkActivismUnchanged("https://activism.example", { fetchImpl });
    assert.equal(result.ok, true);
  });

  it("fails when HTTP status is not 200", async () => {
    const fetchImpl = async () => ({
      status: 500,
      text: async () => "<title>Activism hub</title>",
    });
    const result = await checkActivismUnchanged("https://activism.example", { fetchImpl });
    assert.equal(result.ok, false);
  });
});
