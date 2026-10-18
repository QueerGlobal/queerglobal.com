import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RELEASE_TAG_PATTERN,
  assertValidReleaseTag,
  releaseTagGitRef,
  verifyReleaseTagIsAncestorOfMain,
  verifyReleaseTagPointsAtEmbeddedSha,
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

describe("verifyReleaseTag rollback guards", () => {
  it("refuses when the tag commit does not match the embedded sha", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const tag = `release/1-${sha}`;
    assert.throws(
      () =>
        verifyReleaseTagPointsAtEmbeddedSha({
          tag,
          execGit: () => "ffffffffffffffffffffffffffffffffffffffff",
        }),
      /points at .* embeds/,
    );
  });

  it("refuses when the tag commit is not an ancestor of main", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "release-tag-git-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: repo });
      execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "main"], {
        cwd: repo,
      });
      const mainSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
      execFileSync("git", ["branch", "-M", "main"], { cwd: repo });
      execFileSync("git", ["checkout", "-q", "-b", "side"], { cwd: repo });
      execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "side"], { cwd: repo });
      const sideSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
      const tag = `release/9-${sideSha}`;
      execFileSync("git", ["tag", tag], { cwd: repo });
      const execGit = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
      verifyReleaseTagPointsAtEmbeddedSha({ tag, execGit });
      assert.throws(
        () => verifyReleaseTagIsAncestorOfMain({ tag, execGit, mainRef: "refs/heads/main" }),
        /not an ancestor/,
      );
      execFileSync("git", ["checkout", "-q", "main"], { cwd: repo });
      const mainTag = `release/2-${mainSha}`;
      execFileSync("git", ["tag", mainTag], { cwd: repo });
      verifyReleaseTagIsAncestorOfMain({ tag: mainTag, execGit, mainRef: "refs/heads/main" });
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
