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
import { mkdtempTracked, rmTracked } from "./test-helpers/test-temp.mjs";

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
    const repo = mkdtempTracked("release-tag-git-");
    try {
      execFileSync("git", ["init", "-q"], { cwd: repo, env: { ...process.env, HOME: repo, GIT_CONFIG_NOSYSTEM: "1" } });
      execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo, env: { HOME: repo, GIT_CONFIG_NOSYSTEM: "1" } });
      execFileSync("git", ["config", "user.name", "t"], { cwd: repo, env: { HOME: repo, GIT_CONFIG_NOSYSTEM: "1" } });
      const gitEnv = { ...process.env, HOME: repo, TMPDIR: repo, GIT_CONFIG_NOSYSTEM: "1" };
      execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "main"], {
        cwd: repo,
        env: gitEnv,
      });
      const mainSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", env: gitEnv }).trim();
      execFileSync("git", ["branch", "-M", "main"], { cwd: repo, env: gitEnv });
      execFileSync("git", ["checkout", "-q", "-b", "side"], { cwd: repo, env: gitEnv });
      execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "side"], { cwd: repo, env: gitEnv });
      const sideSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", env: gitEnv }).trim();
      const tag = `release/9-${sideSha}`;
      execFileSync("git", ["tag", tag], { cwd: repo, env: gitEnv });
      const execGit = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", env: gitEnv });
      verifyReleaseTagPointsAtEmbeddedSha({ tag, execGit });
      assert.throws(
        () =>
          verifyReleaseTagIsAncestorOfMain({
            tag,
            execGit,
            mainRef: "refs/heads/main",
            fetchOriginMain: false,
          }),
        /not an ancestor/,
      );
      execFileSync("git", ["checkout", "-q", "main"], { cwd: repo, env: gitEnv });
      const mainTag = `release/2-${mainSha}`;
      execFileSync("git", ["tag", mainTag], { cwd: repo, env: gitEnv });
      verifyReleaseTagIsAncestorOfMain({
        tag: mainTag,
        execGit,
        mainRef: "refs/heads/main",
        fetchOriginMain: false,
      });
    } finally {
      rmTracked(repo);
    }
  });

  it("uses origin/main after fetch when no local main branch exists", () => {
    const root = mkdtempTracked("release-tag-git-");
    try {
      const bare = path.join(root, "origin.git");
      const clone = path.join(root, "clone");
      const gitEnv = {
        ...process.env,
        HOME: root,
        TMPDIR: root,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
      };
      execFileSync("git", ["init", "--bare", "-q", bare], { env: gitEnv });
      execFileSync("git", ["init", "-q", clone], { env: gitEnv });
      execFileSync("git", ["-C", clone, "config", "user.email", "t@t"], { env: gitEnv });
      execFileSync("git", ["-C", clone, "config", "user.name", "t"], { env: gitEnv });
      execFileSync("git", ["-C", clone, "commit", "--allow-empty", "-q", "-m", "first"], { env: gitEnv });
      const firstSha = execFileSync("git", ["-C", clone, "rev-parse", "HEAD"], { encoding: "utf8", env: gitEnv }).trim();
      execFileSync("git", ["-C", clone, "commit", "--allow-empty", "-q", "-m", "second"], { env: gitEnv });
      execFileSync("git", ["-C", clone, "branch", "-M", "main"], { env: gitEnv });
      execFileSync("git", ["-C", clone, "remote", "add", "origin", bare], { env: gitEnv });
      execFileSync("git", ["-C", clone, "push", "-u", "origin", "main"], { env: gitEnv });
      const tag = `release/3-${firstSha}`;
      execFileSync("git", ["-C", clone, "tag", tag, firstSha], { env: gitEnv });
      execFileSync("git", ["-C", clone, "push", "origin", tag], { env: gitEnv });
      execFileSync("git", ["-C", clone, "checkout", "--detach", "HEAD"], { env: gitEnv });
      execFileSync("git", ["-C", clone, "branch", "-D", "main"], { env: gitEnv });
      assert.throws(() => execFileSync("git", ["-C", clone, "rev-parse", "main"], { env: gitEnv }), /unknown revision|not a valid object name/);
      const execGit = (args) => execFileSync("git", args, { cwd: clone, encoding: "utf8", env: gitEnv });
      const verified = verifyReleaseTagIsAncestorOfMain({
        tag,
        execGit,
        mainRef: "origin/main",
        fetchOriginMain: true,
      });
      assert.equal(verified, firstSha);
    } finally {
      rmTracked(root);
    }
  });
});
