import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { isolatedGitEnv } from "./test-helpers/isolated-git-env.mjs";
import { mkdtempTracked, rmTracked } from "./test-helpers/test-temp.mjs";

describe("isolatedGitEnv", () => {
  it("commits unsigned with the test identity even when the caller's git config would sign or has no identity", () => {
    const root = mkdtempTracked("isolated-git-");
    try {
      const hostileHome = path.join(root, "home");
      const tmp = path.join(root, "tmp");
      fs.mkdirSync(hostileHome);
      fs.mkdirSync(tmp);
      const hostile = path.join(hostileHome, ".gitconfig");
      fs.writeFileSync(
        hostile,
        "[user]\n\tuseConfigOnly = true\n\tsigningkey = /nonexistent/key\n[gpg]\n\tformat = ssh\n[commit]\n\tgpgsign = true\n[tag]\n\tgpgsign = true\n",
      );
      const base = {
        ...process.env,
        HOME: hostileHome,
        TMPDIR: tmp,
        XDG_CONFIG_HOME: hostileHome,
        GIT_CONFIG_GLOBAL: hostile,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "commit.gpgsign",
        GIT_CONFIG_VALUE_0: "true",
        GIT_AUTHOR_EMAIL: "",
      };
      const repo = path.join(root, "repo");
      const env = isolatedGitEnv(hostileHome, base);
      execFileSync("git", ["init", "-q", repo], { env });
      execFileSync("git", ["-C", repo, "commit", "-q", "--allow-empty", "-m", "c"], { env });
      execFileSync("git", ["-C", repo, "tag", "release/1-test"], { env });
      const commit = execFileSync("git", ["-C", repo, "cat-file", "-p", "HEAD"], { env, encoding: "utf8" });
      assert.doesNotMatch(commit, /^gpgsig/m);
      assert.match(commit, /^author Test <test@example\.invalid>/m);
      assert.deepEqual(fs.readdirSync(tmp), []);
      assert.throws(() =>
        execFileSync("git", ["-C", repo, "commit", "-q", "--allow-empty", "-m", "d"], { env: base, stdio: "pipe" }),
      );
    } finally {
      rmTracked(root);
    }
  });
});
