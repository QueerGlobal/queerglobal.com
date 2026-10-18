import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { dopplerStoreStub } from "./test-helpers/doppler-store-stub.mjs";
import { mkdtempTracked, stubBin } from "./test-helpers/test-temp.mjs";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CF = "fake-cf-bootstrap-token-run-0001";
const GH = "fake-gh-bootstrap-token-run-0002";
const DP = "fake-dp-management-token-run-0003";
const OLD_PASS = "old-rotate-run-passphrase-000000";
const NEW_PASS = "new-rotate-run-passphrase-111111";
const TOKENS = { CLOUDFLARE_API_TOKEN: CF, BOOTSTRAP_GITHUB_TOKEN: GH, BOOTSTRAP_DOPPLER_MANAGEMENT_TOKEN: DP };

/** The child prints what it can see; a token that reached it is reported, never echoed by the script. */
const CHILD = `printf '%s|%s|%s|%s|%s|%s' "\${CLOUDFLARE_API_TOKEN:-}" "\${TF_VAR_github_token:-}" "\${TF_VAR_doppler_management_token:-}" "\${BOOTSTRAP_GITHUB_TOKEN:-unset}" "\${BOOTSTRAP_DOPPLER_MANAGEMENT_TOKEN:-unset}" "\${BOOTSTRAP_FIRST_RUN:-unset}" > "$CHILD_OUT"`;

/**
 * @param {Record<string, string>} secrets
 * @param {{ xtrace?: boolean, env?: Record<string, string>, args?: string[] }} [opts]
 */
function runBootstrapRun(secrets, opts = {}) {
  const doppler = dopplerStoreStub(secrets);
  const work = mkdtempTracked("bootstrap-run-");
  const out = path.join(work, "child.out");
  const args = opts.args ?? ["bash", "-c", CHILD];
  const r = spawnSync("bash", [...(opts.xtrace ? ["-x"] : []), "scripts/bootstrap-run.sh", ...args], {
    cwd: REPO,
    env: {
      PATH: `${doppler.bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: os.tmpdir(),
      CHILD_OUT: out,
      ...opts.env,
    },
    encoding: "utf8",
  });
  const child = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : undefined;
  return { ...r, child, calls: doppler.calls() };
}

describe("bootstrap-run.sh (real script, stand-in doppler)", () => {
  it("loads the three tokens from the bootstrap config into the child only, under the names the scripts read", () => {
    const r = runBootstrapRun(TOKENS, { xtrace: true, env: { BOOTSTRAP_FIRST_RUN: "1" } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.child, `${CF}|${GH}|${DP}|unset|unset|1`);
    assert.equal(r.calls.length, 1);
    const [call] = r.calls;
    assert.deepEqual(call.slice(0, call.indexOf("--")), [
      "run",
      "-p",
      "queerglobal",
      "-c",
      "bootstrap",
      "--only-secrets",
      "CLOUDFLARE_API_TOKEN,BOOTSTRAP_GITHUB_TOKEN,BOOTSTRAP_DOPPLER_MANAGEMENT_TOKEN",
    ]);
    const visible = `${r.stdout}${r.stderr}${JSON.stringify(r.calls)}`;
    for (const secret of [CF, GH, DP]) {
      assert.ok(!visible.includes(secret), "a token reached argv, stdout or the trace");
    }
  });

  for (const missing of Object.keys(TOKENS)) {
    it(`refuses to start the command when ${missing} is missing`, () => {
      const secrets = { ...TOKENS };
      delete secrets[missing];
      const r = runBootstrapRun(secrets);
      assert.equal(r.status, 1);
      assert.match(r.stderr, new RegExp(`${missing} is missing or empty in the bootstrap Doppler config`));
      assert.equal(r.child, undefined, "the command ran without every token");
    });
  }

  it("refuses to start the command when a token is empty", () => {
    const r = runBootstrapRun({ ...TOKENS, BOOTSTRAP_GITHUB_TOKEN: "" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /BOOTSTRAP_GITHUB_TOKEN is missing or empty/);
    assert.equal(r.child, undefined);
  });

  for (const name of ["CLOUDFLARE_API_TOKEN", "TF_VAR_github_token", "TF_VAR_doppler_management_token"]) {
    it(`refuses a ${name} already set in the caller's shell and never calls doppler`, () => {
      const r = runBootstrapRun(TOKENS, { env: { [name]: "typed-by-hand-0000" } });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /already set in this shell/);
      assert.deepEqual(r.calls, []);
      assert.equal(r.child, undefined);
    });
  }

  it("needs a command", () => {
    const r = runBootstrapRun(TOKENS, { args: [] });
    assert.equal(r.status, 2);
    assert.deepEqual(r.calls, []);
  });
});

/**
 * Run the real rotate-run script against a stand-in Doppler store and a stub tofu that accepts the
 * new passphrase and rejects the old one.
 * @param {Record<string, string>} secrets
 * @param {{ xtrace?: boolean, env?: Record<string, string>, stdin?: string }} [opts]
 */
function runRotateRun(secrets, opts = {}) {
  const doppler = dopplerStoreStub(secrets);
  const work = mkdtempTracked("rotate-run-");
  const state = path.join(work, "state");
  fs.mkdirSync(state);
  fs.writeFileSync(path.join(state, "terraform.tfstate"), '{"encrypted":"stand-in"}');
  const tofuLog = path.join(work, "tofu.log");
  const tofu = stubBin(
    "tofu",
    `printf '%s\\n' "$*" >> '${tofuLog}'
case "$*" in
  *" show "*|*" show") printf '%s\\n' "Error: decryption failed for all provided methods" >&2; exit 1 ;;
  *) exit 0 ;;
esac`,
  );
  const r = spawnSync("bash", [...(opts.xtrace ? ["-x"] : []), "scripts/bootstrap-passphrase-rotate-run.sh", state], {
    cwd: REPO,
    input: opts.stdin ?? "rotate\npromote\n",
    env: {
      PATH: `${doppler.bin}:${tofu}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: os.tmpdir(),
      BOOTSTRAP_ROTATE_PROMOTE_DOPPLER: "1",
      ...opts.env,
    },
    encoding: "utf8",
  });
  const tofuCalls = fs.existsSync(tofuLog) ? fs.readFileSync(tofuLog, "utf8").trim().split("\n") : [];
  return { ...r, doppler, tofuCalls };
}

/** @param {string[][]} calls */
const writes = (calls) => calls.filter((c) => c[0] === "secrets" && c[1] !== "get").map((c) => `${c[1]} ${c[2]}`);

describe("bootstrap-passphrase-rotate-run.sh (real script, stand-in doppler and tofu)", () => {
  it("rotates and promotes from the Doppler copy after the backup, with tracing on and nothing printed", () => {
    const r = runRotateRun({ BOOTSTRAP_STATE_PASSPHRASE: OLD_PASS, BOOTSTRAP_STATE_PASSPHRASE_NEXT: NEW_PASS }, { xtrace: true });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.tofuCalls.some((c) => /apply/.test(c)), "rotation never re-encrypted the state");
    assert.deepEqual(writes(r.doppler.calls()), [
      "set BOOTSTRAP_STATE_ENCRYPTED",
      "set BOOTSTRAP_STATE_PASSPHRASE",
      "delete BOOTSTRAP_STATE_PASSPHRASE_NEXT",
    ]);
    assert.equal(r.doppler.read("BOOTSTRAP_STATE_PASSPHRASE"), NEW_PASS);
    assert.equal(r.doppler.read("BOOTSTRAP_STATE_PASSPHRASE_NEXT"), undefined);
    assert.equal(r.doppler.read("BOOTSTRAP_STATE_ENCRYPTED"), '{"encrypted":"stand-in"}');
    const visible = `${r.stdout}${r.stderr}${JSON.stringify(r.doppler.calls())}${r.tofuCalls.join("\n")}`;
    assert.ok(!visible.includes(OLD_PASS), "old passphrase printed, traced or on argv");
    assert.ok(!visible.includes(NEW_PASS), "new passphrase printed, traced or on argv");
  });

  it("promotes the Doppler copy, not a NEXT value set in the caller's shell", () => {
    const r = runRotateRun(
      { BOOTSTRAP_STATE_PASSPHRASE: OLD_PASS, BOOTSTRAP_STATE_PASSPHRASE_NEXT: NEW_PASS },
      { env: { TF_VAR_bootstrap_state_passphrase_next: "shell-typed-passphrase-9999" } },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.doppler.read("BOOTSTRAP_STATE_PASSPHRASE"), NEW_PASS);
  });

  for (const [label, secrets, message] of [
    ["NEXT is missing", { BOOTSTRAP_STATE_PASSPHRASE: OLD_PASS }, /BOOTSTRAP_STATE_PASSPHRASE_NEXT must be set in Doppler/],
    ["NEXT is empty", { BOOTSTRAP_STATE_PASSPHRASE: OLD_PASS, BOOTSTRAP_STATE_PASSPHRASE_NEXT: "" }, /BOOTSTRAP_STATE_PASSPHRASE_NEXT in Doppler is empty/],
    ["NEXT equals the current passphrase", { BOOTSTRAP_STATE_PASSPHRASE: OLD_PASS, BOOTSTRAP_STATE_PASSPHRASE_NEXT: OLD_PASS }, /equals the current passphrase/],
    ["the current passphrase is missing", { BOOTSTRAP_STATE_PASSPHRASE_NEXT: NEW_PASS }, /BOOTSTRAP_STATE_PASSPHRASE is missing in Doppler/],
  ]) {
    it(`fails closed before any tofu call or Doppler write when ${label}`, () => {
      const r = runRotateRun(secrets);
      assert.equal(r.status, 1);
      assert.match(r.stderr, message);
      assert.deepEqual(r.tofuCalls, []);
      assert.deepEqual(writes(r.doppler.calls()), []);
    });
  }

  it("bootstrap-passphrase-rotate.sh keeps tracing off when started with bash -x", () => {
    const work = mkdtempTracked("rotate-trace-");
    fs.writeFileSync(path.join(work, "terraform.tfstate"), '{"encrypted":"stand-in"}');
    const tofu = stubBin(
      "tofu",
      `case "$*" in
  *" show "*|*" show") printf '%s\\n' "Error: decryption failed for all provided methods" >&2; exit 1 ;;
  *) exit 0 ;;
esac`,
    );
    const r = spawnSync("bash", ["-x", "scripts/bootstrap-passphrase-rotate.sh", work], {
      cwd: REPO,
      input: "rotate\n",
      env: {
        PATH: `${tofu}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: os.tmpdir(),
        TF_VAR_bootstrap_state_passphrase: OLD_PASS,
        TF_VAR_bootstrap_state_passphrase_next: NEW_PASS,
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!`${r.stdout}${r.stderr}`.includes(OLD_PASS) && !`${r.stdout}${r.stderr}`.includes(NEW_PASS), "a passphrase was traced");
  });

  it("refuses BOOTSTRAP_FIRST_RUN so a rotation can never generate a new current passphrase", () => {
    const r = runRotateRun({ BOOTSTRAP_STATE_PASSPHRASE_NEXT: NEW_PASS }, { env: { BOOTSTRAP_FIRST_RUN: "1" } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unset BOOTSTRAP_FIRST_RUN/);
    assert.deepEqual(r.doppler.calls(), []);
    assert.deepEqual(r.tofuCalls, []);
    assert.equal(r.doppler.read("BOOTSTRAP_STATE_PASSPHRASE"), undefined);
  });
});

describe("bootstrap README rotation commands (run as written, stand-in doppler and tofu)", () => {
  it("generates NEXT in code, rotates through bootstrap-run.sh and promotes it, printing no passphrase", () => {
    const readme = fs.readFileSync(path.join(REPO, "infra/bootstrap/README.md"), "utf8");
    const rotation = readme.split("## Passphrase rotation")[1].split("\n## ")[0];
    const snippet = rotation.split("```bash\n")[1].split("\n```")[0];
    const work = mkdtempTracked("readme-rotate-");
    fs.cpSync(path.join(REPO, "scripts"), path.join(work, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(work, "infra", "bootstrap"), { recursive: true });
    fs.copyFileSync(
      path.join(REPO, "infra/bootstrap/bootstrap-project.auto.tfvars.json"),
      path.join(work, "infra/bootstrap/bootstrap-project.auto.tfvars.json"),
    );
    fs.writeFileSync(path.join(work, "infra/bootstrap/terraform.tfstate"), '{"encrypted":"stand-in"}');
    const doppler = dopplerStoreStub({ ...TOKENS, BOOTSTRAP_STATE_PASSPHRASE: OLD_PASS });
    const tofu = stubBin(
      "tofu",
      `case "$*" in
  *" show "*|*" show") printf '%s\\n' "Error: decryption failed for all provided methods" >&2; exit 1 ;;
  *) exit 0 ;;
esac`,
    );
    const r = spawnSync("bash", ["-c", snippet], {
      cwd: work,
      input: "rotate\npromote\n",
      env: {
        PATH: `${doppler.bin}:${tofu}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: os.tmpdir(),
        // Rotation derives the account id from the Cloudflare token; answer that lookup without network.
        NODE_OPTIONS: `--import=${path.join(REPO, "scripts/test-helpers/argv-fetch-preload.mjs")}`,
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Rotation complete/);
    const promoted = doppler.read("BOOTSTRAP_STATE_PASSPHRASE");
    assert.ok(promoted && promoted !== OLD_PASS && promoted.length >= 32, "the generated passphrase was not promoted");
    assert.equal(doppler.read("BOOTSTRAP_STATE_PASSPHRASE_NEXT"), undefined);
    assert.equal(doppler.read("BOOTSTRAP_STATE_ENCRYPTED"), '{"encrypted":"stand-in"}');
    const visible = `${r.stdout}${r.stderr}${JSON.stringify(doppler.calls())}`;
    for (const secret of [OLD_PASS, promoted, CF, GH, DP]) {
      assert.ok(!visible.includes(secret), "a secret was printed or put on argv");
    }
  });
});
