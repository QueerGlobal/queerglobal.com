import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RELEASE_TAG_PATTERN,
  assertValidReleaseTag,
  releaseTagGitRef,
  verifyReleaseTagIsAncestorOfMain,
  verifyReleaseTagPointsAtEmbeddedSha,
} from "./validate-release-tag.mjs";
import { isolatedGitEnv } from "./test-helpers/isolated-git-env.mjs";
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
      const git = gitIn(repo);
      git(["init", "-q"]);
      git(["commit", "--allow-empty", "-q", "-m", "main"]);
      const mainSha = git(["rev-parse", "HEAD"]).trim();
      git(["branch", "-M", "main"]);
      git(["checkout", "-q", "-b", "side"]);
      git(["commit", "--allow-empty", "-q", "-m", "side"]);
      const sideSha = git(["rev-parse", "HEAD"]).trim();
      const tag = `release/1-${sideSha}`;
      git(["tag", tag]);
      verifyReleaseTagPointsAtEmbeddedSha({ tag, execGit: git });
      assert.throws(
        () =>
          verifyReleaseTagIsAncestorOfMain({
            tag,
            execGit: git,
            mainRef: "refs/heads/main",
            fetchOriginMain: false,
          }),
        /not an ancestor/,
      );
      git(["checkout", "-q", "main"]);
      const mainTag = `release/2-${mainSha}`;
      git(["tag", mainTag]);
      verifyReleaseTagIsAncestorOfMain({
        tag: mainTag,
        execGit: git,
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
      const { ci, firstSha } = runnerClone(root);
      const verified = verifyReleaseTagIsAncestorOfMain({
        tag: `release/3-${firstSha}`,
        execGit: gitIn(ci),
        mainRef: "origin/main",
        fetchOriginMain: true,
      });
      assert.equal(verified, firstSha);
    } finally {
      rmTracked(root);
    }
  });

  it("fetches main first, so a stale origin/main does not refuse a tag that is on main", () => {
    const root = mkdtempTracked("release-tag-git-");
    try {
      const { ci, newSha } = runnerClone(root, { pushAfterClone: true });
      const git = gitIn(ci);
      const tag = `release/4-${newSha}`;
      assert.throws(
        () => verifyReleaseTagIsAncestorOfMain({ tag, execGit: git, fetchOriginMain: false }),
        /not an ancestor/,
        "fixture must start with a stale origin/main",
      );
      assert.equal(verifyReleaseTagIsAncestorOfMain({ tag, execGit: git }), newSha);
    } finally {
      rmTracked(root);
    }
  });

  it("refuses when fetching main fails, even if the local origin/main would pass", () => {
    const root = mkdtempTracked("release-tag-git-");
    try {
      const { ci, firstSha } = runnerClone(root);
      const git = gitIn(ci);
      git(["remote", "set-url", "origin", path.join(root, "missing.git")]);
      assert.throws(() => verifyReleaseTagIsAncestorOfMain({ tag: `release/5-${firstSha}`, execGit: git }));
    } finally {
      rmTracked(root);
    }
  });
});

describe("validate-release-tag.mjs --verify-on-main", () => {
  const script = path.join(process.cwd(), "scripts/validate-release-tag.mjs");

  it("fetches main, checks origin/main and prints only the verified commit sha", () => {
    const root = mkdtempTracked("release-tag-cli-");
    try {
      const { ci, newSha } = runnerClone(root, { pushAfterClone: true });
      const r = spawnSync(process.execPath, [script, "--verify-on-main", `release/6-${newSha}`], {
        cwd: ci,
        env: isolatedGitEnv(root),
        encoding: "utf8",
      });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, `${newSha}\n`);
    } finally {
      rmTracked(root);
    }
  });

  it("prints nothing and exits non-zero when the tag is not on main", () => {
    const root = mkdtempTracked("release-tag-cli-");
    try {
      const { ci, sideSha } = runnerClone(root, { sideTag: true });
      const r = spawnSync(process.execPath, [script, "--verify-on-main", `release/7-${sideSha}`], {
        cwd: ci,
        env: isolatedGitEnv(root),
        encoding: "utf8",
      });
      assert.equal(r.status, 1);
      assert.equal(r.stdout, "");
      assert.match(r.stderr, /not an ancestor of origin\/main/);
    } finally {
      rmTracked(root);
    }
  });
});

/**
 * @param {string} cwd
 * @returns {(args: string[]) => string}
 */
function gitIn(cwd) {
  const env = isolatedGitEnv(cwd);
  return (args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Build an origin repo and a runner-style clone of it: release tags fetched, no local
 * main branch, detached HEAD. With pushAfterClone, main gets a new tagged commit after
 * the clone, so the clone's origin/main is stale until it fetches. With sideTag, a tag
 * points at a commit that is not on main.
 *
 * @param {string} root
 * @param {{ pushAfterClone?: boolean, sideTag?: boolean }} [opts]
 */
function runnerClone(root, opts = {}) {
  const bare = path.join(root, "origin.git");
  const dev = path.join(root, "dev");
  const ci = path.join(root, "ci");
  const git = (cwd, args) => gitIn(cwd)(args);
  git(root, ["init", "--bare", "-q", "-b", "main", bare]);
  git(root, ["init", "-q", "-b", "main", dev]);
  git(dev, ["commit", "--allow-empty", "-q", "-m", "first"]);
  const firstSha = git(dev, ["rev-parse", "HEAD"]).trim();
  git(dev, ["tag", `release/3-${firstSha}`]);
  git(dev, ["tag", `release/5-${firstSha}`]);
  let sideSha = "";
  if (opts.sideTag) {
    git(dev, ["checkout", "-q", "-b", "side"]);
    git(dev, ["commit", "--allow-empty", "-q", "-m", "side"]);
    sideSha = git(dev, ["rev-parse", "HEAD"]).trim();
    git(dev, ["tag", `release/7-${sideSha}`]);
    git(dev, ["checkout", "-q", "main"]);
  }
  git(dev, ["remote", "add", "origin", bare]);
  git(dev, ["push", "-q", "origin", "main", "--tags"]);
  git(root, ["clone", "-q", "-b", "main", bare, ci]);
  let newSha = "";
  if (opts.pushAfterClone) {
    git(dev, ["commit", "--allow-empty", "-q", "-m", "second"]);
    newSha = git(dev, ["rev-parse", "HEAD"]).trim();
    for (const n of [4, 6]) git(dev, ["tag", `release/${n}-${newSha}`]);
    git(dev, ["push", "-q", "origin", "main", "--tags"]);
    git(ci, ["fetch", "-q", "--no-tags", "origin", "refs/tags/*:refs/tags/*"]);
  }
  git(ci, ["checkout", "-q", "--detach", "HEAD"]);
  git(ci, ["branch", "-D", "main"]);
  return { ci, firstSha, newSha, sideSha };
}
