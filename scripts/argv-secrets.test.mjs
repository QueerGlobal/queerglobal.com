import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { mkdtempTracked, rmTracked } from "./test-helpers/test-temp.mjs";

/**
 * Runs the real deploy, rollback, cleanup, bootstrap and release tag scripts, and the
 * deploy workflow's own step commands, with fake secrets in the environment and every
 * external command wrapped by a shim that logs its full argv. Fails if any fake secret
 * shows up on any command line.
 */

const REPO = process.cwd();
const SHIM = path.join(REPO, "scripts/test-helpers/argv-log-shim.sh");
const FETCH_PRELOAD = path.join(REPO, "scripts/test-helpers/argv-fetch-preload.mjs");
const WRAPPED = ["git", "curl", "doppler", "bash", "gh", "tofu", "jq", "wrangler", "npx", "aws", "node"];
const PREVIOUS_VERSION = "11111111-2222-3333-4444-555555555555";

const FAKES = Object.freeze({
  CLOUDFLARE_API_TOKEN: "fake-cf-token-argv-0001",
  AWS_ACCESS_KEY_ID: "fake-r2-key-id-argv-0002",
  AWS_SECRET_ACCESS_KEY: "fake-r2-secret-argv-0003",
  AWS_SESSION_TOKEN: "fake-r2-session-argv-0004",
  GITHUB_TOKEN: "ghs_fakeGithubTokenArgv0005",
  DOPPLER_TOKEN: "dp.st.fake-doppler-argv-0006",
  TF_VAR_github_token: "github_pat_fakeArgv0007",
  TF_VAR_doppler_management_token: "dp.pt.fake-mgmt-argv-0008",
});

/** Stored in the stand-in Doppler bootstrap config; loaded by bootstrap-passphrase-env.sh. */
const BOOTSTRAP_PASSPHRASE = "mock-bootstrap-passphrase-for-ci-long-enough";

const realBin = (name) => execFileSync("bash", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim();
const REAL = { bash: realBin("bash"), git: realBin("git"), node: process.execPath };

/**
 * @param {string} root
 * @returns {{ binDir: string, log: string }}
 */
function installShims(root) {
  const binDir = path.join(root, "shim-bin");
  fs.mkdirSync(binDir, { recursive: true });
  for (const name of WRAPPED) {
    fs.copyFileSync(SHIM, path.join(binDir, name));
    fs.chmodSync(path.join(binDir, name), 0o755);
  }
  return { binDir, log: path.join(root, "argv.log") };
}

/**
 * Copy of the repository's scripts and workflows, so a mutation test can edit one file.
 *
 * @param {(root: string) => void} [mutate]
 * @returns {string}
 */
function workTree(mutate) {
  const root = mkdtempTracked("argv-tree-");
  // Leave out provider caches and any local bootstrap state, so a developer's
  // real state is never copied into a temporary directory.
  const skip = (src) => !/(^|\/)(\.terraform|terraform\.tfstate(\.backup)?)$/.test(src);
  for (const dir of ["scripts", ".github", "infra"]) {
    fs.cpSync(path.join(REPO, dir), path.join(root, dir), { recursive: true, filter: skip });
  }
  fs.copyFileSync(path.join(REPO, "package.json"), path.join(root, "package.json"));
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(root, "node_modules"));
  mutate?.(root);
  return root;
}

/**
 * @param {string} yaml
 * @param {string} stepName
 * @returns {string}
 */
function workflowStepRun(yaml, stepName) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  assert.notEqual(start, -1, `missing workflow step ${stepName}`);
  for (let i = start + 1; i < lines.length && !lines[i].trim().startsWith("- name:"); i += 1) {
    const m = /^(\s*)run: ?(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (m[2] !== "|") return m[2];
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() !== "" && line.search(/\S/) <= m[1].length) break;
      body.push(line.slice(m[1].length + 2));
    }
    return body.join("\n");
  }
  throw new Error(`workflow step ${stepName} has no run block`);
}

/**
 * Run every script and workflow step in `root` through the shims.
 *
 * @param {string} root
 * @returns {{ records: Array<{ cmd: string, args: string[] }>, results: Record<string, number | null> }}
 */
function runAll(root) {
  const { binDir, log } = installShims(root);
  const yaml = fs.readFileSync(path.join(root, ".github/workflows/deploy-production.yml"), "utf8");
  const remoteDir = path.join(root, "remote");
  fs.mkdirSync(remoteDir);
  execFileSync(REAL.git, ["init", "-q", "--bare", path.join(remoteDir, "QueerGlobal/queerglobal.com.git")]);
  const checkout = path.join(root, "checkout");
  execFileSync(REAL.git, ["init", "-q", checkout]);
  execFileSync(REAL.git, ["-C", checkout, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "c"]);
  fs.writeFileSync(path.join(root, "infra", "bootstrap", "terraform.tfstate"), '{"encrypted":true}');
  fs.writeFileSync(path.join(root, "bootstrap-passphrase.txt"), BOOTSTRAP_PASSPHRASE);
  fs.mkdirSync(path.join(root, "ci-plan"), { recursive: true });
  fs.writeFileSync(path.join(root, "first-deploy"), "__NO_PREVIOUS_WORKER__\n");
  fs.writeFileSync(path.join(root, "existing"), `${PREVIOUS_VERSION}\n`);

  const env = {
    PATH: `${binDir}:/usr/bin:/bin`,
    HOME: root,
    TMPDIR: os.tmpdir(),
    ARGV_LOG_FILE: log,
    REAL_BASH: REAL.bash,
    REAL_NODE: REAL.node,
    REAL_GIT: REAL.git,
    NODE_OPTIONS: `--import=${FETCH_PRELOAD}`,
    GIT_CONFIG_NOSYSTEM: "1",
    ...FAKES,
    CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    TF_STATE_BUCKET: "argv-test-bucket",
    TF_STATE_KEY: "queerglobal-grandkru/terraform.tfstate",
    TF_STATE_REGION: "auto",
    TF_STATE_ENDPOINT: "https://example.invalid",
    TF_VAR_cloudflare_account_id: "0123456789abcdef0123456789abcdef",
    TF_VAR_doppler_project: "queerglobal",
    ARGV_DOPPLER_PASSPHRASE_FILE: path.join(root, "bootstrap-passphrase.txt"),
    TF_VAR_doppler_bootstrap_config: "bootstrap",
    BOOTSTRAP_FIRST_RUN: "1",
    WORKER_NAME: "queerglobal-grandkru",
  };
  const step = (name) => workflowStepRun(yaml, name);
  const runs = {
    "workflow capture": [root, ["-ec", step("Capture current Worker version")], {}],
    "workflow plan and apply": [
      root,
      [
        "-ec",
        `export GITHUB_ACTIONS=true GITHUB_RUN_ID=1 INFRA_CI_PLAN_DIR=${JSON.stringify(path.join(root, "ci-plan"))}
${step("OpenTofu plan for production")}
${step("OpenTofu apply production plan")}`,
      ],
      {},
    ],
    "apply with failing tofu": [
      root,
      ["scripts/run-infra-tofu-apply.sh"],
      {
        ARGV_TOFU_FAIL_APPLY: "1",
        GITHUB_ACTIONS: "true",
        GITHUB_RUN_ID: "1",
        INFRA_CI_PLAN_DIR: path.join(root, "ci-plan"),
      },
    ],
    "workflow first-deploy cleanup": [root, ["-ec", step("Roll back Worker on smoke or recheck failure").replaceAll(".previous-worker-version", "first-deploy")], {}],
    "workflow Worker rollback": [root, ["-ec", step("Roll back Worker on smoke or recheck failure").replaceAll(".previous-worker-version", "existing")], {}],
    "manual rollback": [root, ["-ec", step("Roll back Worker")], { ROLLBACK_VERSION_ID: PREVIOUS_VERSION }],
    "bootstrap apply": [root, ["scripts/bootstrap-tofu-apply.sh"], {}],
    "workflow tag release": [checkout, ["-ec", step("Tag release").replace("scripts/", `${root}/scripts/`)], {
      RELEASE_TAG: "release/1-0123456789abcdef0123456789abcdef01234567",
      GITHUB_SERVER_URL: `file://${remoteDir}`,
      GITHUB_REPOSITORY: "QueerGlobal/queerglobal.com",
    }],
  };
  /** @type {Record<string, number | null>} */
  const results = {};
  for (const [label, [cwd, args, extra]] of Object.entries(runs)) {
    // Start through the bash shim so the entry command is logged too.
    const r = spawnSync(path.join(binDir, "bash"), args, { cwd, env: { ...env, ...extra }, encoding: "utf8", timeout: 60_000 });
    results[label] = r.status;
  }
  const records = fs
    .readFileSync(log, "utf8")
    .split("\x1e")
    .filter(Boolean)
    .map((rec) => {
      const [cmd, ...args] = rec.split("\x1f");
      return { cmd, args };
    });
  return { records, results };
}

/**
 * @param {Array<{ cmd: string, args: string[] }>} records
 */
function assertNoSecretOnArgv(records) {
  for (const { cmd, args } of records) {
    const line = args.join(" ");
    for (const [name, value] of Object.entries(FAKES)) {
      if (line.includes(value)) {
        throw new Error(`secret on argv: ${name} via ${cmd}`);
      }
    }
    if (line.includes(BOOTSTRAP_PASSPHRASE)) {
      throw new Error(`secret on argv: bootstrap state passphrase via ${cmd}`);
    }
    if (/x-access-token:[^@\s]+@/.test(line)) {
      throw new Error(`secret on argv: credentials in a URL via ${cmd}`);
    }
  }
}

const called = (records, cmd, pattern) =>
  records.some((r) => r.cmd === cmd && pattern.test(r.args.join(" ")));

describe("no secrets on any command line (real scripts through argv shims)", { concurrency: 1 }, () => {
  it("baseline: every script and workflow step runs and no fake secret reaches argv", () => {
    const root = workTree();
    try {
    const { records, results } = runAll(root);
    assert.deepEqual(results, {
      "workflow capture": 0,
      "workflow plan and apply": 0,
      "apply with failing tofu": 1,
      "workflow first-deploy cleanup": 0,
      "workflow Worker rollback": 0,
      "manual rollback": 0,
      "bootstrap apply": 0,
      "workflow tag release": 0,
    });
    assert.ok(called(records, "tofu", /plan -input=false -out=/), "main apply plan ran");
    assert.ok(called(records, "tofu", /plan -destroy .*-target=cloudflare_workers_script\.coming_soon/), "cleanup plan ran");
    assert.ok(
      records.some((r) => r.cmd === "node" && r.args.some((a) => /report-cli-failure\.mjs/.test(a))),
      "failure was reported",
    );
    assert.ok(called(records, "node", /worker-rollback\.mjs 11111111-/), "Worker rollback ran");
    assert.ok(called(records, "doppler", /^secrets set BOOTSTRAP_STATE_ENCRYPTED/), "bootstrap state backup ran");
    assert.ok(called(records, "git", /^-c credential\.helper= .* push file:\/\/.*refs\/tags\/release\//), "release tag push ran");
    const tags = execFileSync(REAL.git, ["--git-dir", path.join(root, "remote/QueerGlobal/queerglobal.com.git"), "tag"], { encoding: "utf8" });
    assert.match(tags, /^release\/1-0123456789abcdef0123456789abcdef01234567$/m);
    assertNoSecretOnArgv(records);
    } finally {
      rmTracked(root);
    }
  });

  it("mutation: GitHub token in the tag push URL is caught", () => {
    const root = workTree((r) => {
      const p = path.join(r, "scripts/push-release-tag.sh");
      const src = fs.readFileSync(p, "utf8");
      const mutated = src.replace(
        'remote="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY.git"',
        'remote="${GITHUB_SERVER_URL/:\\/\\//://x-access-token:$GITHUB_TOKEN@}/$GITHUB_REPOSITORY.git"',
      );
      assert.notEqual(mutated, src, "mutation did not apply");
      fs.writeFileSync(p, mutated);
    });
    try {
      const { records } = runAll(root);
      assert.throws(() => assertNoSecretOnArgv(records), /^Error: secret on argv: GITHUB_TOKEN via git$/);
    } finally {
      rmTracked(root);
    }
  });

  it("mutation: Cloudflare token passed to curl as a header argument is caught", () => {
    const root = workTree((r) => {
      const p = path.join(r, "scripts/run-infra-tofu-plan.sh");
      const src = fs.readFileSync(p, "utf8");
      const mutated = src.replace(
        'tofu -chdir="$ROOT/infra" validate -no-color',
        'curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify\ntofu -chdir="$ROOT/infra" validate -no-color',
      );
      assert.notEqual(mutated, src, "mutation did not apply");
      fs.writeFileSync(p, mutated);
    });
    try {
      const { records } = runAll(root);
      assert.throws(() => assertNoSecretOnArgv(records), /^Error: secret on argv: CLOUDFLARE_API_TOKEN via curl$/);
    } finally {
      rmTracked(root);
    }
  });
});
