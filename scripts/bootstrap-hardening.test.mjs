import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { preflightBootstrapCloudflare } from "./preflight-bootstrap-cloudflare.mjs";
import { preflightBootstrapDopplerIsolation, runPreflightBootstrapCli } from "./preflight-bootstrap.mjs";
import { ACCOUNT_ID, bootstrapStandInFetch, fetchWith } from "./test-helpers/fetch-stub.mjs";
import { mkdtempTracked, rmTracked, stubBin } from "./test-helpers/test-temp.mjs";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/**
 * Copy the scripts and the bootstrap stack into a temporary tree, without any
 * local state or provider cache, so bootstrap apply tests never touch the real
 * infra/bootstrap directory or a developer's bootstrap state.
 * @param {(root: string) => void} [prepare]
 * @returns {string}
 */
function bootstrapTree(prepare) {
  const root = mkdtempTracked("bootstrap-tree-");
  const skip = (src) => !/(^|\/)(\.terraform|terraform\.tfstate(\.backup)?)$/.test(src);
  fs.cpSync(path.join(REPO, "scripts"), path.join(root, "scripts"), { recursive: true, filter: skip });
  fs.cpSync(path.join(REPO, "infra", "bootstrap"), path.join(root, "infra", "bootstrap"), { recursive: true, filter: skip });
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(root, "node_modules"));
  prepare?.(root);
  return root;
}

/** @param {{ backupLog?: string }} [opts] */
function dopplerBootstrapStub(opts = {}) {
  const backupLog = opts.backupLog ?? "";
  const backupLine = backupLog ? `if [ "$2" = "set" ] || [ "$3" = "set" ]; then cat >> "${backupLog}"; fi` : "";
  return stubBin(
    "doppler",
    `case "$*" in
  *get*BOOTSTRAP_STATE_PASSPHRASE*) printf '%s' 'mock-bootstrap-passphrase-for-ci' ;;
  *set*BOOTSTRAP_STATE_ENCRYPTED*) ${backupLog ? `cat >> "${backupLog}"` : "cat >/dev/null"} ;;
  *set*) exit 0 ;;
esac
${backupLine}
exit 0`,
  );
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
      });
      const errors = [];
      const orig = console.error;
      console.error = (m) => errors.push(String(m));
      const code = await runPreflightBootstrapCli({
        fetchImpl: bootstrapStandInFetch(),
        reviewers: [],
      });
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
    const dir = mkdtempTracked("restore-");
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
    const log = path.join(mkdtempTracked("tofu-"), "argv");
    const bin = stubBin("tofu", `echo "$*" >> "${log}"`);
    const nodeBin = path.dirname(process.execPath);
    const doppler = dopplerBootstrapStub();
    const work = bootstrapTree((root) => {
      fs.unlinkSync(path.join(root, "infra", "bootstrap", "production-reviewers.auto.tfvars.json"));
    });
    const env = {
      PATH: `${bin}:${doppler}:${nodeBin}:/usr/local/bin:/usr/bin:/bin`,
      HOME: os.tmpdir(),
      BOOTSTRAP_FIRST_RUN: "1",
      TF_VAR_doppler_project: "queerglobal",
    };
    const r = spawnSync("bash", ["scripts/bootstrap-tofu-apply.sh"], { cwd: work, env, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /production-reviewers\.auto\.tfvars\.json/);
    assert.equal(fs.existsSync(log), false, "tofu ran before preflight passed");
  });

  it("does not auto-approve the bootstrap apply", () => {
    const src = fs.readFileSync("scripts/bootstrap-tofu-apply.sh", "utf8");
    assert.doesNotMatch(src, /auto-approve/);
    assert.match(src, /tofu -chdir="\$bootstrap_dir" apply "\$@"/);
    assert.match(src, /bootstrap-state-backup\.sh/);
    assert.doesNotMatch(src, /bootstrap-state-backup\.sh.*\|\| true/);
  });

  it("fails the bootstrap apply when state backup to Doppler fails after a successful apply", () => {
    const work = bootstrapTree((root) =>
      fs.writeFileSync(path.join(root, "infra", "bootstrap", "terraform.tfstate"), '{"encrypted":true}'),
    );
    const node = stubBin("node", `case "$*" in *preflight-bootstrap.mjs*) exit 0 ;; *bootstrap-export-committed-env.mjs*) exec "${process.execPath}" "$@" ;; *) exit 1 ;; esac`);
    const tofu = stubBin("tofu", "exit 0");
    const doppler = stubBin(
      "doppler",
      `case "$*" in
  *get*BOOTSTRAP_STATE_PASSPHRASE*) printf '%s' 'mock-bootstrap-passphrase-for-ci' ;;
  *set*BOOTSTRAP_STATE_ENCRYPTED*) echo failed >&2; exit 1 ;;
esac
exit 0`,
    );
    const nodeBin = path.dirname(process.execPath);
    const r = spawnSync("bash", ["scripts/bootstrap-tofu-apply.sh"], {
      cwd: work,
      env: {
        PATH: `${node}:${tofu}:${doppler}:${nodeBin}:/usr/bin:/bin`,
        HOME: os.tmpdir(),
        BOOTSTRAP_FIRST_RUN: "1",
        TF_VAR_doppler_project: "queerglobal",
        TF_VAR_doppler_bootstrap_config: "bootstrap",
      },
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /backup to Doppler failed/);
  });

  it("backs up state on EXIT when apply fails after it starts", () => {
    const work = bootstrapTree((root) =>
      fs.writeFileSync(path.join(root, "infra", "bootstrap", "terraform.tfstate"), '{"partial":true}'),
    );
    const backupLog = path.join(work, "backup.log");
    const node = stubBin("node", `case "$*" in *preflight-bootstrap.mjs*) exit 0 ;; *bootstrap-export-committed-env.mjs*) exec "${process.execPath}" "$@" ;; *) exit 1 ;; esac`);
    const tofu = stubBin(
      "tofu",
      `case "$*" in
  *" apply"|*" apply "*) exit 42 ;;
  *) exit 0 ;;
esac`,
    );
    const doppler = dopplerBootstrapStub({ backupLog });
    const nodeBin = path.dirname(process.execPath);
    const r = spawnSync("bash", ["scripts/bootstrap-tofu-apply.sh"], {
      cwd: work,
      env: {
        PATH: `${node}:${tofu}:${doppler}:${nodeBin}:/usr/bin:/bin`,
        HOME: os.tmpdir(),
        BOOTSTRAP_FIRST_RUN: "1",
        TF_VAR_doppler_project: "queerglobal",
        TF_VAR_doppler_bootstrap_config: "bootstrap",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 42);
    assert.ok(fs.existsSync(backupLog), "expected backup on failed apply");
  });

  it("runs the caller's EXIT trap after its own backup, with the caller's quoting intact", () => {
    const work = bootstrapTree((root) =>
      fs.writeFileSync(path.join(root, "infra", "bootstrap", "terraform.tfstate"), '{"partial":true}'),
    );
    const events = path.join(work, "events.log");
    const node = stubBin("node", `case "$*" in *preflight-bootstrap.mjs*) exit 0 ;; *bootstrap-export-committed-env.mjs*) exec "${process.execPath}" "$@" ;; *) exit 1 ;; esac`);
    const tofu = stubBin("tofu", "exit 0");
    const doppler = stubBin(
      "doppler",
      `case "$*" in
  *get*BOOTSTRAP_STATE_PASSPHRASE*) printf '%s' 'mock-bootstrap-passphrase-for-ci' ;;
  *set*BOOTSTRAP_STATE_ENCRYPTED*) echo backup >> "${events}" ;;
esac
cat >/dev/null
exit 0`,
    );
    const nodeBin = path.dirname(process.execPath);
    const r = spawnSync(
      "bash",
      ["-c", `trap 'echo "caller trap ran" >> "${events}"' EXIT; source scripts/bootstrap-tofu-apply.sh`],
      {
        cwd: work,
        env: {
          PATH: `${node}:${tofu}:${doppler}:${nodeBin}:/usr/bin:/bin`,
          HOME: os.tmpdir(),
          BOOTSTRAP_FIRST_RUN: "1",
          TF_VAR_doppler_project: "queerglobal",
          TF_VAR_doppler_bootstrap_config: "bootstrap",
        },
        encoding: "utf8",
      },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /command not found/);
    assert.equal(fs.readFileSync(events, "utf8"), "backup\ncaller trap ran\n");
  });

  it("passes -replace through to tofu apply after preflight", () => {
    const log = path.join(mkdtempTracked("tofu-apply-"), "argv.log");
    const tofu = stubBin("tofu", `echo "$*" >> "${log}"; exit 0`);
    const node = stubBin(
      "node",
      `case "$*" in *preflight-bootstrap.mjs*) exit 0 ;; *bootstrap-export-committed-env.mjs*) exec "${process.execPath}" "$@" ;; *) exit 1 ;; esac`,
    );
    const nodeBin = path.dirname(process.execPath);
    const env = {
      PATH: `${tofu}:${node}:${nodeBin}:/usr/local/bin:/usr/bin:/bin`,
      HOME: os.tmpdir(),
      BOOTSTRAP_FIRST_RUN: "1",
      TF_VAR_doppler_project: "queerglobal",
    };
    const r = spawnSync(
      "bash",
      [
        "scripts/bootstrap-tofu-apply.sh",
        "-replace=doppler_service_token.github_actions_production",
      ],
      {
        cwd: bootstrapTree(),
        env: { ...env, PATH: `${tofu}:${node}:${dopplerBootstrapStub()}:${env.PATH}` },
        encoding: "utf8",
      },
    );
    assert.equal(r.status, 0, r.stderr);
    const argv = fs.readFileSync(log, "utf8");
    assert.match(
      argv,
      /-chdir=(?:infra\/bootstrap|.*\/infra\/bootstrap) apply -replace=doppler_service_token\.github_actions_production/,
    );
  });

  it("always applies and backs up the bootstrap stack next to the script, with no directory override", () => {
    const work = bootstrapTree((root) =>
      fs.writeFileSync(path.join(root, "infra", "bootstrap", "terraform.tfstate"), '{"real":true}'),
    );
    const decoy = mkdtempTracked("bootstrap-decoy-");
    fs.writeFileSync(path.join(decoy, "terraform.tfstate"), '{"decoy":true}');
    const log = path.join(work, "tofu.log");
    const backup = path.join(work, "backup.log");
    const tofu = stubBin("tofu", `echo "$*" >> "${log}"; exit 0`);
    const node = stubBin("node", `case "$*" in *preflight-bootstrap.mjs*) exit 0 ;; *bootstrap-export-committed-env.mjs*) exec "${process.execPath}" "$@" ;; *) exit 1 ;; esac`);
    const doppler = dopplerBootstrapStub({ backupLog: backup });
    const nodeBin = path.dirname(process.execPath);
    const r = spawnSync("bash", ["scripts/bootstrap-tofu-apply.sh"], {
      cwd: work,
      env: {
        PATH: `${tofu}:${node}:${doppler}:${nodeBin}:/usr/bin:/bin`,
        HOME: os.tmpdir(),
        BOOTSTRAP_FIRST_RUN: "1",
        BOOTSTRAP_APPLY_DIR: decoy,
        TF_VAR_doppler_project: "queerglobal",
        TF_VAR_doppler_bootstrap_config: "bootstrap",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    const expected = path.join(fs.realpathSync(work), "infra", "bootstrap");
    for (const line of fs.readFileSync(log, "utf8").trim().split("\n")) {
      assert.ok(line.startsWith(`-chdir=${expected} `), `tofu ran outside the bootstrap stack: ${line}`);
    }
    assert.equal(fs.readFileSync(backup, "utf8"), '{"real":true}', "backed up state from another directory");
  });
});

const OLD_PASS = "old-passphrase-0000000000";
const NEW_PASS = "new-passphrase-1111111111";

/**
 * Run the real rotate script with stub tofu and doppler on PATH.
 * @param {{ stdin: string, showOutput?: string, dopplerNext?: string }} opts
 */
function runRotate(opts) {
  const work = mkdtempTracked("rotate-");
  const state = path.join(work, "state");
  fs.mkdirSync(state);
  fs.writeFileSync(path.join(state, "terraform.tfstate"), '{"encrypted":"stand-in"}');
  const log = path.join(work, "doppler.log");
  const tofu = stubBin(
    "tofu",
    `case "$*" in
  *" show "*|*" show") printf '%s\\n' "${opts.showOutput ?? "Error: decryption failed for all provided methods"}" >&2; exit 1 ;;
  *) exit 0 ;;
esac`,
  );
  const doppler = stubBin(
    "doppler",
    `stdin=""
if [ "$2" = "set" ]; then stdin="$(cat)"; fi
printf '%s\\t%s\\n' "$*" "$stdin" >> "${log}"
if [ "$2" = "get" ]; then printf '%s' "${opts.dopplerNext ?? NEW_PASS}"; fi
exit 0`,
  );
  const r = spawnSync("bash", ["scripts/bootstrap-passphrase-rotate.sh", state], {
    input: opts.stdin,
    env: {
      PATH: `${tofu}:${doppler}:${process.env.PATH}`,
      HOME: os.tmpdir(),
      TF_VAR_bootstrap_state_passphrase: OLD_PASS,
      TF_VAR_bootstrap_state_passphrase_next: NEW_PASS,
      TF_VAR_doppler_project: "queerglobal",
      TF_VAR_doppler_bootstrap_config: "bootstrap",
      BOOTSTRAP_ROTATE_PROMOTE_DOPPLER: "1",
    },
    encoding: "utf8",
  });
  const calls = fs.existsSync(log)
    ? fs.readFileSync(log, "utf8").trim().split("\n").map((l) => {
        const [argv, stdin] = l.split("\t");
        return { argv, stdin };
      })
    : [];
  return { ...r, calls };
}

describe("bootstrap-passphrase-rotate.sh promote (real script, stub tofu and doppler)", () => {
  it("reads NEXT, backs up, sets PASSPHRASE from stdin, then deletes NEXT; no secret on argv", () => {
    const r = runRotate({ stdin: "rotate\npromote\n" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      r.calls.map((c) => c.argv.split(" ").slice(0, 3).join(" ")),
      [
        "secrets get BOOTSTRAP_STATE_PASSPHRASE_NEXT",
        "secrets set BOOTSTRAP_STATE_ENCRYPTED",
        "secrets set BOOTSTRAP_STATE_PASSPHRASE",
        "secrets delete BOOTSTRAP_STATE_PASSPHRASE_NEXT",
      ],
    );
    assert.equal(r.calls[1].stdin, '{"encrypted":"stand-in"}');
    assert.equal(r.calls[2].stdin, NEW_PASS);
    for (const c of r.calls) {
      assert.doesNotMatch(c.argv, new RegExp(`${OLD_PASS}|${NEW_PASS}`));
    }
  });

  it("touches Doppler not at all unless promote is typed", () => {
    const r = runRotate({ stdin: "rotate\nno\n" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Promotion skipped/);
    assert.deepEqual(r.calls, []);
  });

  it("refuses to promote when Doppler NEXT differs from the re-encryption passphrase", () => {
    const r = runRotate({ stdin: "rotate\npromote\n", dopplerNext: "some-other-passphrase-22" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /does not match/);
    assert.deepEqual(
      r.calls.map((c) => c.argv.split(" ").slice(0, 3).join(" ")),
      ["secrets get BOOTSTRAP_STATE_PASSPHRASE_NEXT"],
      "no Doppler write (including the state backup) before NEXT matches",
    );
  });

  it("README promote snippet checks NEXT before any Doppler write", () => {
    const readme = fs.readFileSync("infra/bootstrap/README.md", "utf8");
    const snippet = readme.split("Promote the new passphrase in Doppler")[1].split("```bash\n")[1].split("\n```")[0];
    const work = mkdtempTracked("promote-");
    try {
      fs.mkdirSync(path.join(work, "infra", "bootstrap"), { recursive: true });
      fs.mkdirSync(path.join(work, "scripts"));
      fs.copyFileSync("scripts/bootstrap-state-backup.sh", path.join(work, "scripts", "bootstrap-state-backup.sh"));
      fs.writeFileSync(path.join(work, "infra", "bootstrap", "terraform.tfstate"), '{"encrypted":"stand-in"}');
      const log = path.join(work, "doppler.log");
      const doppler = stubBin(
        "doppler",
        `printf '%s\\n' "$*" >> "${log}"
if [ "$2" = "set" ]; then cat >/dev/null; fi
if [ "$2" = "get" ]; then printf '%s' "some-other-passphrase-22"; fi
exit 0`,
      );
      const r = spawnSync("bash", ["-c", snippet], {
        cwd: work,
        env: {
          PATH: `${doppler}:${process.env.PATH}`,
          HOME: os.tmpdir(),
          TF_VAR_bootstrap_state_passphrase_next: NEW_PASS,
          TF_VAR_doppler_project: "queerglobal",
          TF_VAR_doppler_bootstrap_config: "bootstrap",
        },
        encoding: "utf8",
      });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /does not match/);
      const calls = fs.readFileSync(log, "utf8").trim().split("\n");
      assert.deepEqual(calls.map((c) => c.split(" ").slice(0, 3).join(" ")), ["secrets get BOOTSTRAP_STATE_PASSPHRASE_NEXT"]);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  it("fails when the old passphrase is rejected for a reason other than decryption", () => {
    const r = runRotate({ stdin: "rotate\npromote\n", showOutput: "Error: No value for required variable" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unexpected reason/);
    assert.deepEqual(r.calls, []);
  });
});

describe("Doppler deploy and bootstrap isolation", () => {
  const base = { dopplerToken: "dp.pt.x", dopplerProject: "queerglobal", deployConfig: "prd", bootstrapConfig: "bootstrap" };
  const configAt = (environment) =>
    fetchWith((u) =>
      u.includes("/v3/configs/config?") && new URL(u).searchParams.get("config") === "prd"
        ? { ok: true, status: 200, json: async () => ({ config: { name: "prd", environment } }) }
        : undefined,
    );

  it("baseline passes with separate environments", async () => {
    assert.deepEqual(await preflightBootstrapDopplerIsolation({ ...base, fetchImpl: bootstrapStandInFetch() }), { ok: true });
  });

  it("rejects a deploy config inside the bootstrap environment", async () => {
    const r = await preflightBootstrapDopplerIsolation({ ...base, fetchImpl: configAt("bootstrap") });
    assert.equal(r.ok, false);
    assert.match(r.error, /CI would inherit bootstrap secrets/);
  });

  it("rejects deploy and bootstrap configs that share an environment", async () => {
    const fetchImpl = fetchWith((u) =>
      u.includes("/v3/configs/config?") && new URL(u).searchParams.get("config") === "bootstrap"
        ? { ok: true, status: 200, json: async () => ({ config: { name: "bootstrap", environment: "prd" } }) }
        : undefined,
    );
    const r = await preflightBootstrapDopplerIsolation({ ...base, fetchImpl });
    assert.equal(r.ok, false);
    assert.match(r.error, /share environment prd/);
  });

  it("passes when the bootstrap config does not exist yet (404)", async () => {
    const fetchImpl = fetchWith((u) =>
      u.includes("/v3/configs/config?") && new URL(u).searchParams.get("config") === "bootstrap"
        ? { ok: false, status: 404, json: async () => ({}) }
        : undefined,
    );
    assert.deepEqual(await preflightBootstrapDopplerIsolation({ ...base, fetchImpl }), { ok: true });
  });

  it("fails closed when the bootstrap config check errors", async () => {
    const fetchImpl = fetchWith((u) =>
      u.includes("/v3/configs/config?") && new URL(u).searchParams.get("config") === "bootstrap"
        ? { ok: false, status: 500, json: async () => ({}) }
        : undefined,
    );
    const r = await preflightBootstrapDopplerIsolation({ ...base, fetchImpl });
    assert.equal(r.ok, false);
    assert.match(r.error, /check failed \(HTTP 500\)/);
  });
});

describe("bootstrap preflight CLI runs the Doppler isolation check", () => {
  it("exits 1 when the deploy config is in the bootstrap environment", async () => {
    const saved = { ...process.env };
    const errors = [];
    const orig = console.error;
    try {
      Object.assign(process.env, {
        CLOUDFLARE_API_TOKEN: "t",
        TF_VAR_cloudflare_account_id: ACCOUNT_ID,
        TF_VAR_github_token: "ghp_x",
        TF_VAR_doppler_management_token: "dp.pt.x",
        TF_VAR_doppler_project: "queerglobal",
        TF_VAR_doppler_config: "prd",
        TF_VAR_doppler_bootstrap_config: "bootstrap",
      });
      console.error = (m) => errors.push(String(m));
      const fetchImpl = fetchWith((u) =>
        u.includes("/v3/configs/config?") && new URL(u).searchParams.get("config") === "prd"
          ? { ok: true, status: 200, json: async () => ({ config: { name: "prd", environment: "bootstrap" } }) }
          : undefined,
      );
      const code = await runPreflightBootstrapCli({ fetchImpl });
      assert.equal(code, 1);
      assert.match(errors.join("\n"), /CI would inherit bootstrap secrets/);
    } finally {
      console.error = orig;
      process.env = saved;
    }
  });
});

describe("bootstrap writes always go through bootstrap-tofu-apply.sh", () => {
  it("make rotate-doppler-github-token uses the apply script", () => {
    const make = fs.readFileSync("Makefile", "utf8");
    assert.match(make, /^\tbash scripts\/bootstrap-tofu-apply\.sh -replace=doppler_service_token\.github_actions_production$/m);
    assert.doesNotMatch(make, /^\t[^@]*tofu -chdir=infra\/bootstrap apply/m);
  });

  it("no script other than bootstrap-tofu-apply.sh applies the bootstrap stack directly", () => {
    const offenders = fs
      .readdirSync("scripts")
      .filter((f) => f.endsWith(".sh") && f !== "bootstrap-tofu-apply.sh")
      .filter((f) => /tofu -chdir=infra\/bootstrap apply/.test(fs.readFileSync(path.join("scripts", f), "utf8")));
    assert.deepEqual(offenders, []);
  });
});
