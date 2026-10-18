import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

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
    const tagCheckoutIdx = stepIndex(job, "Checkout release tag");
    assert.ok(validateIdx < tagCheckoutIdx, "tag checkout must follow validation");
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
  }
});
