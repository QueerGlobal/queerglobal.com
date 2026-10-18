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
