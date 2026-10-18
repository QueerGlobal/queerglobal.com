import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RELEASE_TAG_PATTERN,
  assertValidReleaseTag,
  releaseTagGitRef,
} from "./validate-release-tag.mjs";

describe("assertValidReleaseTag", () => {
  it("accepts deploy workflow release tags", () => {
    const tag = "release/42-0123456789abcdef0123456789abcdef01234567";
    assert.equal(RELEASE_TAG_PATTERN.test(tag), true);
    assert.equal(assertValidReleaseTag(tag), tag);
  });

  it("rejects branch-like names that only share the release/ prefix", () => {
    assert.throws(
      () => assertValidReleaseTag("release/not-a-valid-tag"),
      /must match/,
    );
  });
});

describe("releaseTagGitRef", () => {
  it("returns an explicit refs/tags ref", () => {
    const tag = "release/1-0123456789abcdef0123456789abcdef01234567";
    assert.equal(releaseTagGitRef(tag), `refs/tags/${tag}`);
  });
});
