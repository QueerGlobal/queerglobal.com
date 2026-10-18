import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { mkdtempTracked } from "./test-helpers/test-temp.mjs";

function stubBin(name, script) {
  const dir = mkdtempTracked("stub-");
  fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${script}\n`, { mode: 0o755 });
  return dir;
}

describe("bootstrap-state-backup.sh", () => {
  it("fails when backup to Doppler fails and keeps the local state path in the message", () => {
    const work = mkdtempTracked("backup-fail-");
    const stateDir = path.join(work, "bootstrap");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "terraform.tfstate"), '{"encrypted":true}');
    const doppler = stubBin("doppler", 'echo "doppler failed" >&2; exit 1');
    const nodeBin = path.dirname(process.execPath);
    const r = spawnSync("bash", ["scripts/bootstrap-state-backup.sh", stateDir], {
      env: {
        PATH: `${doppler}:${nodeBin}:/usr/bin:/bin`,
        TF_VAR_doppler_project: "queerglobal",
        TF_VAR_doppler_bootstrap_config: "bootstrap",
      },
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /backup to Doppler failed/);
    assert.match(r.stderr, new RegExp(stateDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(fs.existsSync(path.join(stateDir, "terraform.tfstate")));
  });

  it("treats a missing state file as an error", () => {
    const work = mkdtempTracked("backup-missing-");
    const stateDir = path.join(work, "bootstrap");
    fs.mkdirSync(stateDir, { recursive: true });
    const doppler = stubBin("doppler", "exit 0");
    const nodeBin = path.dirname(process.execPath);
    const r = spawnSync("bash", ["scripts/bootstrap-state-backup.sh", stateDir], {
      env: {
        PATH: `${doppler}:${nodeBin}:/usr/bin:/bin`,
        TF_VAR_doppler_project: "queerglobal",
      },
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /state file missing; backup refused/);
  });
});
