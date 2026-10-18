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

  it("does not embed GITHUB_TOKEN in git push URLs", () => {
    assert.doesNotMatch(deploy, /x-access-token:\$\{\{/);
    assert.match(deploy, /git push origin "\$RELEASE_TAG"/);
  });

  it("runs automated first-deploy cleanup instead of README-only instructions", () => {
    assert.match(deploy, /run-infra-first-deploy-cleanup\.sh/);
    assert.doesNotMatch(deploy, /First-deploy break-glass destroy/);
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
