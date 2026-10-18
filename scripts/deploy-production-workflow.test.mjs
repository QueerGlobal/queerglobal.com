import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { mkdtempTracked, rmTracked } from "./test-helpers/test-temp.mjs";
import { workflowStepRun } from "./test-helpers/workflow-step.mjs";

const workflowPath = path.join(
  process.cwd(),
  ".github/workflows/deploy-production.yml",
);

/**
 * @param {string} yaml
 * @param {string} jobId
 * @returns {string}
 */
function extractJobBlock(yaml, jobId) {
  const lines = yaml.split("\n");
  const startIdx = lines.findIndex((line) => line === `  ${jobId}:`);
  assert.notEqual(startIdx, -1, `missing job ${jobId}`);
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (/^  [A-Za-z0-9_]+:/.test(lines[i] ?? "")) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

/**
 * @param {string} jobBlock
 * @returns {number[]}
 */
function stepLineNumbers(jobBlock) {
  const lines = jobBlock.split("\n");
  /** @type {number[]} */
  const indexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]?.trim().startsWith("- name:")) {
      indexes.push(i);
    }
  }
  return indexes;
}

/**
 * @param {string} jobBlock
 * @param {string} stepName
 * @returns {number}
 */
function stepIndex(jobBlock, stepName) {
  const needle = `- name: ${stepName}`;
  const idx = jobBlock.indexOf(needle);
  assert.notEqual(idx, -1, `missing step ${stepName}`);
  const before = jobBlock.slice(0, idx);
  return before.split("\n").filter((line) => line.trim().startsWith("- name:")).length - 1;
}

describe("deploy-production redeploy_release_tag job", () => {
  const yaml = fs.readFileSync(workflowPath, "utf8");
  const job = extractJobBlock(yaml, "redeploy_release_tag");

  it("runs validate-release-tag after checkout and npm ci so the script exists on the runner", () => {
    const validateIdx = stepIndex(job, "Validate release tag prefix");
    const checkoutIdx = stepIndex(job, "Checkout");
    const npmIdx = stepIndex(job, "Install dependencies");
    assert.ok(checkoutIdx < validateIdx, "validate must run after initial checkout");
    assert.ok(npmIdx < validateIdx, "validate must run after npm ci");
  });

  it("checks out the release tag only after validation", () => {
    const validateIdx = stepIndex(job, "Validate release tag prefix");
    const verifyIdx = stepIndex(job, "Verify release tag commit is on main");
    const tagCheckoutIdx = stepIndex(job, "Checkout verified release commit");
    assert.ok(validateIdx < verifyIdx, "git verify must follow prefix validation");
    assert.ok(verifyIdx < tagCheckoutIdx, "verified commit checkout must follow git verify");
  });
});

describe("deploy-production deploy job secrets and cleanup", () => {
  const yaml = fs.readFileSync(workflowPath, "utf8");
  const deploy = extractJobBlock(yaml, "deploy");
  const tagRelease = extractJobBlock(yaml, "tag_release");

  it("never persists checkout credentials in any job", () => {
    assert.doesNotMatch(yaml, /persist-credentials: true/);
    const checkouts = yaml.match(/uses: actions\/checkout@/g) ?? [];
    const notPersisted = yaml.match(/persist-credentials: false/g) ?? [];
    assert.equal(notPersisted.length, checkouts.length, "every checkout sets persist-credentials: false");
  });

  it("gives the Doppler token only to the steps that call doppler", () => {
    const steps = yaml.split(/\n(?=      - name: )/);
    for (const stepText of steps) {
      const usesDoppler = /doppler run/.test(stepText);
      const hasToken = /DOPPLER_TOKEN: \$\{\{ secrets\.DOPPLER_TOKEN \}\}/.test(stepText);
      if (!stepText.startsWith("      - name: ")) {
        assert.equal(hasToken, false, "no job-level DOPPLER_TOKEN");
        continue;
      }
      assert.equal(hasToken, usesDoppler, stepText.split("\n")[0]);
    }
  });

  it("keeps write access out of the deploy job", () => {
    assert.match(deploy, /permissions:\n\s+contents: read\n\s+actions: read/);
    assert.doesNotMatch(deploy, /contents: write/);
    assert.doesNotMatch(deploy, /git push/);
  });

  it("pushes the release tag from a separate job that only has contents: write and no Doppler token", () => {
    assert.match(tagRelease, /needs: deploy/);
    assert.match(tagRelease, /permissions:\n\s+contents: write\n\s+steps:/);
    assert.doesNotMatch(tagRelease, /DOPPLER_TOKEN|npm ci/);
    assert.match(tagRelease, /run: bash scripts\/push-release-tag\.sh/);
    assert.doesNotMatch(tagRelease, /x-access-token/);
  });

  it("runs cleanup only for the exact first-deploy marker and passes the marker file to the script", () => {
    assert.match(deploy, /if \[ "\$PREVIOUS" = "__NO_PREVIOUS_WORKER__" \]; then/);
    assert.match(deploy, /bash scripts\/run-infra-first-deploy-cleanup\.sh \.previous-worker-version/);
    assert.doesNotMatch(deploy, /First-deploy break-glass destroy/);
    assert.doesNotMatch(deploy, /2>\/dev\/null \|\| true\)/, "a missing version file must fail the step, not trigger cleanup");
  });
});

describe("deploy-production manual jobs and gating", () => {
  const yaml = fs.readFileSync(workflowPath, "utf8");

  it("runs tests before manual Worker rollback", () => {
    const rollback = extractJobBlock(yaml, "rollback");
    assert.match(rollback, /needs: test_on_worker_rollback/);
  });

  it("documents why redeploy_release_tag skips the push test job", () => {
    assert.match(yaml, /Skips the push test job: release tags are created only after deploy smoke and recheck passed/);
  });

  it("verifies the release tag commit is on main before checking the tag out", () => {
    const redeploy = extractJobBlock(yaml, "redeploy_release_tag");
    const verifyIdx = stepIndex(redeploy, "Verify release tag commit is on main");
    const tagCheckoutIdx = stepIndex(redeploy, "Checkout verified release commit");
    assert.ok(verifyIdx >= 0 && verifyIdx < tagCheckoutIdx, "tag must be verified before it is checked out");
    assert.match(redeploy, /node scripts\/validate-release-tag\.mjs --verify-on-main "\$ROLLBACK_RELEASE_TAG"/);
    assert.match(redeploy, /fetch-depth: 0/);
  });

  it("checks out the verified commit sha instead of the tag ref", () => {
    const redeploy = extractJobBlock(yaml, "redeploy_release_tag");
    assert.match(redeploy, /VERIFIED_SHA="\$\(node scripts\/validate-release-tag\.mjs --verify-on-main "\$ROLLBACK_RELEASE_TAG"\)"/);
    assert.match(redeploy, /VERIFIED_RELEASE_SHA=\$VERIFIED_SHA/);
    assert.match(redeploy, /ref: \$\{\{ env\.VERIFIED_RELEASE_SHA \}\}/);
    assert.doesNotMatch(redeploy, /ref: refs\/tags\/\$\{\{ inputs\.rollback_release_tag \}\}/);
  });

  it("sets VERIFIED_RELEASE_SHA only when the tag check printed a full commit sha", () => {
    const body = workflowStepRun(yaml, "Verify release tag commit is on main");
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const cases = [
      { printed: "", exit: 0, ok: false },
      { printed: "not-a-sha", exit: 0, ok: false },
      { printed: sha.slice(0, 39), exit: 0, ok: false },
      { printed: sha, exit: 1, ok: false },
      { printed: sha, exit: 0, ok: true },
    ];
    for (const c of cases) {
      const work = mkdtempTracked("verify-step-");
      try {
        const bin = path.join(work, "bin");
        fs.mkdirSync(bin);
        fs.writeFileSync(path.join(bin, "node"), `#!/bin/sh\nprintf '%s\\n' '${c.printed}'\nexit ${c.exit}\n`, { mode: 0o755 });
        const githubEnv = path.join(work, "github_env");
        fs.writeFileSync(githubEnv, "");
        const r = spawnSync("bash", ["-e", "-c", body], {
          env: { PATH: `${bin}:/usr/bin:/bin`, GITHUB_ENV: githubEnv, ROLLBACK_RELEASE_TAG: `release/1-${sha}` },
          encoding: "utf8",
        });
        const written = fs.readFileSync(githubEnv, "utf8");
        if (c.ok) {
          assert.equal(r.status, 0, r.stderr);
          assert.equal(written, `VERIFIED_RELEASE_SHA=${sha}\n`);
        } else {
          assert.notEqual(r.status, 0, `printed ${JSON.stringify(c.printed)} exit ${c.exit} must refuse`);
          assert.equal(written, "", `printed ${JSON.stringify(c.printed)} must not set VERIFIED_RELEASE_SHA`);
        }
      } finally {
        rmTracked(work);
      }
    }
  });

  it("plans before applying infra in deploy and redeploy jobs", () => {
    const deploy = extractJobBlock(yaml, "deploy");
    const redeploy = extractJobBlock(yaml, "redeploy_release_tag");
    assert.match(deploy, /run-infra-tofu-plan\.sh/);
    assert.match(deploy, /run-infra-tofu-apply\.sh/);
    assert.match(redeploy, /run-infra-tofu-plan\.sh/);
    assert.match(redeploy, /run-infra-tofu-apply\.sh/);
  });
});

describe("deploy-production jobs that verify the environment", () => {
  const yaml = fs.readFileSync(workflowPath, "utf8");

  for (const jobId of ["deploy", "rollback", "redeploy_release_tag"]) {
    it(`${jobId} grants actions: read for verify-production-environment.mjs`, () => {
      const job = extractJobBlock(yaml, jobId);
      assert.match(job, /actions: read/);
    });

    it(`${jobId} waits for the production environment approval`, () => {
      const job = extractJobBlock(yaml, jobId);
      assert.match(job, /^    environment: production$/m);
    });
  }
});
