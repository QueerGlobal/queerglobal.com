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

describe("bootstrap-passphrase-env.sh", () => {
  it("creates and loads a passphrase on first bootstrap without printing it", () => {
    const passFile = path.join(mkdtempTracked("pass-"), "stored");
    const setLog = path.join(path.dirname(passFile), "set.log");
    const doppler = stubBin(
      "doppler",
      `if [[ "$*" == *secrets*get*BOOTSTRAP_STATE_PASSPHRASE* ]]; then
  if [ -s "${passFile}" ]; then cat "${passFile}"; else echo "Secret not found" >&2; exit 1; fi
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
    assert.ok(!combined.includes(fs.readFileSync(passFile, "utf8")), "generated passphrase was printed");
  });

  it("stores a fresh random passphrase on each first bootstrap", () => {
    const stored = [];
    for (let i = 0; i < 2; i += 1) {
      const work = mkdtempTracked("pass-gen-");
      try {
        const passFile = path.join(work, "stored");
        fs.writeFileSync(
          path.join(work, "doppler"),
          `#!/usr/bin/env bash
if [[ "$*" == *secrets*get*BOOTSTRAP_STATE_PASSPHRASE* ]]; then
  if [ -s "${passFile}" ]; then cat "${passFile}"; exit 0; fi
  echo "Secret not found" >&2
  exit 1
elif [[ "$*" == *secrets*set*BOOTSTRAP_STATE_PASSPHRASE* ]]; then
  cat > "${passFile}"
fi
exit 0
`,
          { mode: 0o755 },
        );
        const r = spawnSync("bash", ["-c", "source scripts/bootstrap-passphrase-env.sh"], {
          env: {
            PATH: `${work}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
            BOOTSTRAP_FIRST_RUN: "1",
            TF_VAR_doppler_project: "queerglobal",
            TMPDIR: work,
          },
          encoding: "utf8",
        });
        assert.equal(r.status, 0, r.stderr);
        stored.push(fs.readFileSync(passFile, "utf8"));
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
      }
    }
    for (const value of stored) {
      assert.match(value, /^[A-Za-z0-9+/]{43}=$/, "expected 32 random bytes in base64");
    }
    assert.notEqual(stored[0], stored[1], "two first bootstraps stored the same passphrase");
  });

  it("does not overwrite the passphrase when Doppler get fails for a non-missing reason on first run", () => {
    const work = mkdtempTracked("pass-refuse-");
    try {
      const setLog = path.join(work, "set.log");
      fs.writeFileSync(
        path.join(work, "doppler"),
        `#!/usr/bin/env bash
if [[ "$*" == *secrets*get*BOOTSTRAP_STATE_PASSPHRASE* ]]; then
  echo "Doppler Error: invalid token" >&2
  exit 1
elif [[ "$*" == *secrets*set*BOOTSTRAP_STATE_PASSPHRASE* ]]; then
  echo set >> "${setLog}"
  cat >/dev/null
fi
exit 0
`,
        { mode: 0o755 },
      );
      const r = spawnSync("bash", ["-c", "source scripts/bootstrap-passphrase-env.sh"], {
        env: {
          PATH: `${work}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
          BOOTSTRAP_FIRST_RUN: "1",
          TF_VAR_doppler_project: "queerglobal",
          TMPDIR: work,
        },
        encoding: "utf8",
      });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Refusing to generate/);
      assert.equal(fs.existsSync(setLog), false, "must not call doppler secrets set");
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  it("keeps the passphrase out of xtrace output and restores xtrace for the caller", () => {
    const work = mkdtempTracked("pass-xtrace-");
    try {
      const stored = "xtrace-check-passphrase-0123456789";
      fs.writeFileSync(path.join(work, "stored"), stored);
      fs.writeFileSync(
        path.join(work, "doppler"),
        `#!/usr/bin/env bash\nif [[ "$*" == *secrets*get*BOOTSTRAP_STATE_PASSPHRASE* ]]; then cat "${path.join(work, "stored")}"; exit 0; fi\nexit 1\n`,
        { mode: 0o755 },
      );
      const r = spawnSync(
        "bash",
        ["-xc", 'source scripts/bootstrap-passphrase-env.sh && : after-source && test "${#TF_VAR_bootstrap_state_passphrase}" -gt 16'],
        {
          env: {
            PATH: `${work}:/usr/bin:/bin`,
            TF_VAR_doppler_project: "queerglobal",
            TF_VAR_doppler_bootstrap_config: "bootstrap",
            TMPDIR: work,
          },
          encoding: "utf8",
        },
      );
      assert.equal(r.status, 0, r.stderr);
      assert.ok(!`${r.stdout}${r.stderr}`.includes(stored), "passphrase reached xtrace output");
      assert.match(r.stderr, /\+ : after-source/, "xtrace was not restored for the caller");
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
});
