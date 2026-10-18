import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

function stubBin(name, script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stub-"));
  fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${script}\n`, { mode: 0o755 });
  return dir;
}

describe("bootstrap-passphrase-env.sh", () => {
  it("creates and loads a passphrase on first bootstrap without printing it", () => {
    const passFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pass-")), "stored");
    const setLog = path.join(path.dirname(passFile), "set.log");
    const doppler = stubBin(
      "doppler",
      `if [[ "$*" == *secrets*get*BOOTSTRAP_STATE_PASSPHRASE* ]]; then
  if [ -s "${passFile}" ]; then cat "${passFile}"; else exit 1; fi
elif [[ "$*" == *secrets*set*BOOTSTRAP_STATE_PASSPHRASE* ]]; then
  cat > "${passFile}"
  echo set >> "${setLog}"
fi
exit 0`,
    );
    const nodeBin = path.dirname(process.execPath);
    const r = spawnSync(
      "bash",
      ["-c", 'source scripts/bootstrap-passphrase-env.sh && test -n "$TF_VAR_bootstrap_state_passphrase" && printf ok'],
      {
        env: {
          PATH: `${doppler}:${nodeBin}:/usr/bin:/bin`,
          BOOTSTRAP_FIRST_RUN: "1",
          TF_VAR_doppler_project: "queerglobal",
          TF_VAR_doppler_bootstrap_config: "bootstrap",
        },
        encoding: "utf8",
      },
    );
    assert.equal(r.stdout.trim(), "ok", r.stderr);
    assert.ok(fs.existsSync(setLog), "expected generated passphrase stored in Doppler");
    const combined = `${r.stdout}${r.stderr}`;
    assert.doesNotMatch(combined, /mock-bootstrap-passphrase/);
    assert.doesNotMatch(combined, /generated-passphrase/);
  });
});
