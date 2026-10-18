/**
 * Run the Node test suite and fail if tests leak temp directories under TMPDIR.
 *
 * @module run-node-tests
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listTestTmpdirArtifacts } from "./test-helpers/test-temp.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const before = listTestTmpdirArtifacts();
const result = spawnSync(
  process.execPath,
  ["--import", "./scripts/test-setup.mjs", "--test", "scripts/*.test.mjs", "scripts/lib/*.test.mjs"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, NPM_TEST_TMPDIR_GUARD: "1" },
  },
);
const after = listTestTmpdirArtifacts();
const leaked = [...after].filter((name) => !before.has(name));
for (const name of leaked) {
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
if (leaked.length > 0) {
  console.error(`Tests leaked temp directories under TMPDIR: ${leaked.join(", ")}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
