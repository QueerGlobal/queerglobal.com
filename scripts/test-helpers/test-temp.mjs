/**
 * Track and remove temporary directories created by Node tests.
 *
 * @module test-helpers/test-temp
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** @type {Set<string>} */
const tracked = new Set();

/**
 * @param {string} prefix
 * @returns {string}
 */
export function mkdtempTracked(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.add(dir);
  return dir;
}

/**
 * @param {string} dir
 */
export function rmTracked(dir) {
  tracked.delete(dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

export function cleanupAllTracked() {
  for (const dir of [...tracked]) {
    rmTracked(dir);
  }
}

/** @type {RegExp[]} */
export const TEST_TMPDIR_ARTIFACT = [
  /^argv-tree-/,
  /^bootstrap-tree-/,
  /^bootstrap-decoy-/,
  /^bootstrap-restore-/,
  /^release-tag-git-/,
  /^stub-/,
  /^pass-/,
  /^restore-/,
  /^tofu-/,
  /^no-em-dash-/,
  /^no-em-dash-clean-/,
  /^no-em-dash-fail-/,
  /^argv-debug-/,
  /^backup-/,
  /^ci-plan-/,
  /^reviewers-/,
  /^rotate-/,
  /^promote-/,
  /^capture-worker-/,
  /^cleanup-gate-/,
  /^preflight-marker-/,
  /^tmp\./,
];

/**
 * @returns {Set<string>}
 */
export function listTestTmpdirArtifacts() {
  /** @type {Set<string>} */
  const names = new Set();
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (TEST_TMPDIR_ARTIFACT.some((re) => re.test(name))) {
      names.add(name);
    }
  }
  return names;
}
