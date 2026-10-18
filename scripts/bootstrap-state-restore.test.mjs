import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { mkdtempTracked } from "./test-helpers/test-temp.mjs";

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
function runRestore(args, env) {
  const result = spawnSync("bash", ["scripts/bootstrap-state-restore.sh", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    stderr: result.stderr ?? "",
  };
}

describe("bootstrap-state-restore.sh", () => {
  it("fails closed when Doppler project is missing and not first run", () => {
    const dir = mkdtempTracked("bootstrap-restore-");
    const result = runRestore([dir], {
      TF_VAR_doppler_project: "",
      BOOTSTRAP_FIRST_RUN: "",
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /TF_VAR_doppler_project is required/);
  });

  it("allows missing project when BOOTSTRAP_FIRST_RUN=1", () => {
    const dir = mkdtempTracked("bootstrap-restore-");
    const result = runRestore([dir], {
      TF_VAR_doppler_project: "",
      BOOTSTRAP_FIRST_RUN: "1",
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /BOOTSTRAP_FIRST_RUN=1/);
  });

  it("fails closed when doppler CLI is missing and not first run", () => {
    const dir = mkdtempTracked("bootstrap-restore-");
    const result = runRestore([dir], {
      TF_VAR_doppler_project: "queerglobal",
      BOOTSTRAP_FIRST_RUN: "",
      PATH: "/usr/bin:/bin",
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /doppler CLI is required/);
  });

  it("skips when local state already exists", () => {
    const dir = mkdtempTracked("bootstrap-restore-");
    fs.writeFileSync(path.join(dir, "terraform.tfstate"), "{}");
    const result = runRestore([dir], { TF_VAR_doppler_project: "" });
    assert.equal(result.status, 0);
  });
});
