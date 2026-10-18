import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertValidReleaseTag } from "./validate-release-tag.mjs";

describe("assertValidReleaseTag", () => {
  it("accepts tags under release/", () => {
    assert.equal(assertValidReleaseTag("release/42-deadbeef"), "release/42-deadbeef");
  });

  it("rejects tags without the release/ prefix", () => {
    assert.throws(() => assertValidReleaseTag("v1.0.0"), /must start with release\//);
  });
});
