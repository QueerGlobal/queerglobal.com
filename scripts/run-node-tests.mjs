/**
 * Run the Node test suite in a private TMPDIR and fail if anything is left in it afterwards.
 *
 * @module run-node-tests
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_TEST_FILES = ["scripts/*.test.mjs", "scripts/lib/*.test.mjs"];

/**
 * @param {{ files?: string[], cwd?: string, parentTmp?: string, stdio?: import("node:child_process").StdioOptions }} [options]
 * @returns {{ status: number, leaked: string[] }}
 */
export function runNodeTestsWithTmpdirGuard(options = {}) {
  const files = options.files ?? DEFAULT_TEST_FILES;
  const cwd = options.cwd ?? repoRoot;
  // A nested run from inside a test must not report to the outer test runner.
  const env = { ...process.env, TMPDIR: "", NPM_TEST_TMPDIR_GUARD: "1" };
  delete env.NODE_TEST_CONTEXT;
  const privateTmp = fs.mkdtempSync(path.join(options.parentTmp ?? os.tmpdir(), "npm-test-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["--import", path.join(repoRoot, "scripts/test-setup.mjs"), "--test", ...files],
      {
        cwd,
        stdio: options.stdio ?? "inherit",
        shell: true,
        env: { ...env, TMPDIR: privateTmp },
      },
    );
    const leaked = fs.readdirSync(privateTmp).sort();
    if (leaked.length > 0) {
      return { status: 1, leaked };
    }
    return { status: result.status ?? 1, leaked };
  } finally {
    fs.rmSync(privateTmp, { recursive: true, force: true });
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  const { status, leaked } = runNodeTestsWithTmpdirGuard();
  if (leaked.length > 0) {
    console.error(`Tests leaked temp files under TMPDIR: ${leaked.join(", ")}`);
  }
  process.exit(status);
}
