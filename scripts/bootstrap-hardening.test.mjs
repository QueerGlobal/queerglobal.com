import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { preflightBootstrapCloudflare } from "./preflight-bootstrap-cloudflare.mjs";
import { runPreflightBootstrapCli } from "./preflight-bootstrap.mjs";
import { ACCOUNT_ID, bootstrapStandInFetch, fetchWith } from "./test-helpers/fetch-stub.mjs";

function stubBin(name, script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stub-"));
  fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${script}\n`, { mode: 0o755 });
  return dir;
}

describe("cloudflare preflight reasons", () => {
  it("baseline passes with all probes allowed", async () => {
    const r = await preflightBootstrapCloudflare({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl: bootstrapStandInFetch(),
    });
    assert.deepEqual(r, { ok: true });
  });

  it("R2 403 fails with the R2 reason", async () => {
    const r = await preflightBootstrapCloudflare({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl: fetchWith((u) =>
        u.endsWith("/r2/buckets")
          ? {
              ok: false,
              status: 403,
              json: async () => ({
                success: false,
                errors: [{ code: 10000, message: "denied" }],
              }),
            }
          : undefined,
      ),
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /Cloudflare R2 probe failed/);
  });

  it("two zones with the same name fail", async () => {
    const z = { id: "z", name: "grandkru.com", account: { id: ACCOUNT_ID } };
    const r = await preflightBootstrapCloudflare({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl: fetchWith((u) =>
        u.includes("/zones?")
          ? { ok: true, json: async () => ({ success: true, result: [z, { ...z, id: "z2" }] }) }
          : undefined,
      ),
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /Expected exactly one zone/);
  });
});

describe("bootstrap preflight CLI", () => {
  it("rejects an empty reviewer list", async () => {
    const saved = { ...process.env };
    try {
      Object.assign(process.env, {
        CLOUDFLARE_API_TOKEN: "t",
        TF_VAR_cloudflare_account_id: ACCOUNT_ID,
        TF_VAR_github_token: "ghp_x",
        TF_VAR_doppler_management_token: "dp.pt.x",
        TF_VAR_doppler_project: "queerglobal",
        TF_VAR_production_reviewer_usernames: "[]",
      });
      const errors = [];
      const orig = console.error;
      console.error = (m) => errors.push(String(m));
      const code = await runPreflightBootstrapCli({ fetchImpl: bootstrapStandInFetch() });
      console.error = orig;
      assert.equal(code, 1);
      assert.match(errors.join("\n"), /reviewer/i);
    } finally {
      process.env = saved;
    }
  });
});

describe("bootstrap-state-restore.sh fail closed", () => {
  it("exits 1 and leaves no state file when doppler secrets get fails", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-"));
    const bin = stubBin("doppler", 'echo "Doppler Error: unauthorized" >&2; exit 1');
    const r = spawnSync("bash", ["scripts/bootstrap-state-restore.sh", dir], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TF_VAR_doppler_project: "queerglobal",
        BOOTSTRAP_FIRST_RUN: "",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Failed to restore BOOTSTRAP_STATE_ENCRYPTED/);
    assert.equal(fs.existsSync(path.join(dir, "terraform.tfstate")), false);
  });
});

describe("bootstrap-tofu-apply.sh", () => {
  it("never calls tofu when preflight fails", () => {
    const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tofu-")), "argv");
    const bin = stubBin("tofu", `echo "$*" >> "${log}"`);
    const nodeBin = path.dirname(process.execPath);
    const env = {
      PATH: `${bin}:${nodeBin}:/usr/local/bin:/usr/bin:/bin`,
      HOME: os.tmpdir(),
      BOOTSTRAP_FIRST_RUN: "1",
      TF_VAR_doppler_project: "queerglobal",
    };
    const r = spawnSync("bash", ["scripts/bootstrap-tofu-apply.sh"], { env, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /TF_VAR_production_reviewer_usernames must be valid JSON array/);
    assert.equal(fs.existsSync(log), false, "tofu ran before preflight passed");
  });

  it("does not auto-approve the bootstrap apply", () => {
    const src = fs.readFileSync("scripts/bootstrap-tofu-apply.sh", "utf8");
    assert.doesNotMatch(src, /auto-approve/);
    assert.match(src, /^tofu -chdir=infra\/bootstrap apply "\$@"$/m);
  });
});

describe("bootstrap-passphrase-rotate.sh Doppler promote order", () => {
  it("pipes NEXT from doppler get into PASSPHRASE set before deleting NEXT", () => {
    const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "promote-")), "order.log");
    const bin = stubBin(
      "doppler",
      `echo "$*" >> "${log}"
if [[ "$*" == *" secrets get "* ]]; then echo "next-passphrase-value"; fi
exit 0`,
    );
    const promoteFragment = `
      set -euo pipefail
      export TF_VAR_doppler_project=queerglobal
      export TF_VAR_doppler_bootstrap_config=bootstrap
      echo backup >> "${log}"
      doppler secrets get BOOTSTRAP_STATE_PASSPHRASE_NEXT --plain \\
        -p "$TF_VAR_doppler_project" -c "$TF_VAR_doppler_bootstrap_config" \\
        | doppler secrets set BOOTSTRAP_STATE_PASSPHRASE \\
          -p "$TF_VAR_doppler_project" -c "$TF_VAR_doppler_bootstrap_config"
      doppler secrets delete BOOTSTRAP_STATE_PASSPHRASE_NEXT \\
        -p "$TF_VAR_doppler_project" -c "$TF_VAR_doppler_bootstrap_config" --yes
    `;
    const r = spawnSync("bash", ["-c", promoteFragment], {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: os.tmpdir(),
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    const lines = fs.readFileSync(log, "utf8").trim().split("\n");
    const backupIdx = lines.findIndex((l) => l === "backup");
    const setIdx = lines.findIndex((l) => l.includes("secrets set") && l.includes("BOOTSTRAP_STATE_PASSPHRASE"));
    const getIdx = lines.findIndex((l) => l.includes("secrets get") && l.includes("BOOTSTRAP_STATE_PASSPHRASE_NEXT"));
    const deleteIdx = lines.findIndex((l) => l.includes("secrets delete") && l.includes("BOOTSTRAP_STATE_PASSPHRASE_NEXT"));
    assert.ok(backupIdx >= 0);
    assert.ok(getIdx >= 0);
    assert.ok(setIdx >= 0);
    assert.ok(deleteIdx >= 0);
    assert.ok(backupIdx < getIdx);
    assert.ok(getIdx < setIdx);
    assert.ok(setIdx < deleteIdx);
  });

  it("embeds the same promote order in bootstrap-passphrase-rotate.sh", () => {
    const src = fs.readFileSync("scripts/bootstrap-passphrase-rotate.sh", "utf8");
    const backupPos = src.indexOf("bootstrap-state-backup.sh");
    const getPos = src.indexOf("secrets get BOOTSTRAP_STATE_PASSPHRASE_NEXT");
    const setPos = src.indexOf("secrets set BOOTSTRAP_STATE_PASSPHRASE");
    const deletePos = src.indexOf("secrets delete BOOTSTRAP_STATE_PASSPHRASE_NEXT");
    assert.ok(backupPos >= 0 && getPos > backupPos && setPos > getPos && deletePos > setPos);
  });
});
