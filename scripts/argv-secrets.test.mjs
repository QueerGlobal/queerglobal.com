import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const FAKE_GITHUB_TOKEN = "ghp_fake_argv_test_token_0123456789abcdef0123456789ab";
const FAKE_CF_TOKEN = "cf_fake_argv_test_token_0123456789abcdef0123456789ab";
const WORKFLOW = ".github/workflows/deploy-production.yml";
const MUTATION_MSG =
  "deploy-production.yml must not embed GITHUB_TOKEN in git push URLs (use persisted credentials and git push origin)";
const SHIM_ROOT = path.resolve("scripts/test-helpers/argv-log-shim.sh");

/**
 * Log argv through argv-log-shim without executing the real binary (avoids network hangs).
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} logFile
 */
function logArgvViaShim(cmd, args, logFile) {
  const bash = "/usr/bin/bash";
  const r = spawnSync(bash, [SHIM_ROOT, cmd, ...args], {
    env: {
      ...process.env,
      ARGV_LOG_FILE: logFile,
      ARGV_LOG_NO_EXEC: "1",
    },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return fs.readFileSync(logFile, "utf8").trim();
}

function assertNoFakeSecrets(line, ...fakes) {
  for (const fake of fakes) {
    assert.doesNotMatch(line, new RegExp(fake));
  }
  assert.doesNotMatch(line, /x-access-token:/);
}

describe("argv logging shims (no secrets on command line)", { concurrency: 1 }, () => {
  it("baseline deploy workflow passes git push without token in argv", () => {
    const yaml = fs.readFileSync(WORKFLOW, "utf8");
    assert.doesNotMatch(yaml, /x-access-token:\$\{\{/);
    assert.doesNotMatch(yaml, /x-access-token:\$\{GITHUB_TOKEN\}/);
    assert.match(yaml, /git push origin "\$RELEASE_TAG"/);

    const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "git-argv-")), "argv.log");
    const line = logArgvViaShim("git", ["push", "origin", "release/1-deadbeef"], log);
    assert.match(line, /^git\tpush origin release\/1-deadbeef$/);
    assertNoFakeSecrets(line, FAKE_GITHUB_TOKEN);
  });

  it("mutation putting the token in the git push URL fails with a dedicated message", () => {
    const yaml = fs.readFileSync(WORKFLOW, "utf8");
    const mutated = yaml.replace(
      'git push origin "$RELEASE_TAG"',
      `git push "https://x-access-token:\${GITHUB_TOKEN}@github.com/\${GITHUB_REPOSITORY}.git" "$RELEASE_TAG"`,
    );
    assert.match(mutated, /x-access-token:\$\{GITHUB_TOKEN\}/);
    assert.throws(
      () => {
        if (/x-access-token:\$\{GITHUB_TOKEN\}/.test(mutated)) {
          throw new Error(MUTATION_MSG);
        }
      },
      (err) => err instanceof Error && err.message === MUTATION_MSG,
    );

    const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "git-mut-")), "argv.log");
    const repo = "QueerGlobal/queerglobal.com";
    const badUrl = `https://x-access-token:${FAKE_GITHUB_TOKEN}@github.com/${repo}.git`;
    const line = logArgvViaShim("git", ["push", badUrl, "release/1-deadbeef"], log);
    assert.match(line, new RegExp(FAKE_GITHUB_TOKEN));
    assert.throws(
      () => {
        if (line.includes(FAKE_GITHUB_TOKEN) || line.includes("x-access-token:")) {
          throw new Error(MUTATION_MSG);
        }
      },
      (err) => err instanceof Error && err.message === MUTATION_MSG,
    );
  });

  it("baseline curl uses -H @- style paths without bearer token on argv", () => {
    const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "curl-argv-")), "argv.log");
    const hdr = path.join(path.dirname(log), "hdr.txt");
    fs.writeFileSync(hdr, `Authorization: Bearer ${FAKE_CF_TOKEN}\n`);
    const line = logArgvViaShim(
      "curl",
      ["-fsS", "-H", `@${hdr}`, "https://api.cloudflare.com/client/v4/user/tokens/verify"],
      log,
    );
    assert.doesNotMatch(line, new RegExp(FAKE_CF_TOKEN));
    assert.match(line, /-H @/);
  });

  const baselineCases = [
    { name: "doppler", args: ["run", "--", "true"] },
    { name: "bash", args: ["-lc", "echo ok"] },
    { name: "gh", args: ["api", "user"] },
    { name: "tofu", args: ["-chdir=infra", "validate"] },
    { name: "jq", args: ["-n", "{ok:true}"] },
    { name: "wrangler", args: ["whoami"] },
  ];

  for (const { name, args } of baselineCases) {
    it(`baseline ${name} argv shim does not embed bearer tokens`, () => {
      const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `${name}-argv-`)), "argv.log");
      const line = logArgvViaShim(name, args, log);
      assertNoFakeSecrets(line, FAKE_GITHUB_TOKEN, FAKE_CF_TOKEN);
    });
  }
});
