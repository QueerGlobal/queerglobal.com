import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

describe("run-infra-tofu-apply.sh gating", () => {
  it("refuses to run without a CI plan stamp", () => {
    const r = spawnSync("bash", ["scripts/run-infra-tofu-apply.sh"], {
      env: {
        PATH: "/usr/bin:/bin",
        CLOUDFLARE_API_TOKEN: "t",
        CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
        TF_STATE_BUCKET: "b",
        TF_STATE_ENDPOINT: "https://example.invalid",
        AWS_ACCESS_KEY_ID: "k",
        AWS_SECRET_ACCESS_KEY: "s",
      },
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Refusing to apply infra outside the gated Deploy production workflow/);
  });

  it("has no break-glass switch: INFRA_BREAK_GLASS=1 still refuses and never runs tofu", () => {
    const tofu = fs.mkdtempSync(path.join(os.tmpdir(), "tofu-stub-"));
    const log = path.join(tofu, "tofu.log");
    fs.writeFileSync(path.join(tofu, "tofu"), `#!/usr/bin/env bash\necho "$*" >> "${log}"\n`, { mode: 0o755 });
    try {
      const r = spawnSync("bash", ["scripts/run-infra-tofu-apply.sh"], {
        env: {
          PATH: `${tofu}:/usr/bin:/bin`,
          INFRA_BREAK_GLASS: "1",
          CLOUDFLARE_API_TOKEN: "t",
          CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
          TF_STATE_BUCKET: "b",
          TF_STATE_ENDPOINT: "https://example.invalid",
          AWS_ACCESS_KEY_ID: "k",
          AWS_SECRET_ACCESS_KEY: "s",
        },
        encoding: "utf8",
      });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Refusing to apply infra outside the gated Deploy production workflow/);
      assert.equal(fs.existsSync(log), false, "tofu ran without a stamped plan");
    } finally {
      fs.rmSync(tofu, { recursive: true, force: true });
    }
  });

  it("refuses a plan stamped by a different workflow run", () => {
    const planDir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-plan-"));
    try {
      fs.writeFileSync(path.join(planDir, "tfplan"), "plan");
      fs.writeFileSync(path.join(planDir, "stamp"), "98\n");
      const r = spawnSync("bash", ["scripts/run-infra-tofu-apply.sh"], {
        env: {
          PATH: "/usr/bin:/bin",
          GITHUB_ACTIONS: "true",
          GITHUB_RUN_ID: "99",
          INFRA_CI_PLAN_DIR: planDir,
          CLOUDFLARE_API_TOKEN: "t",
          CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
          TF_STATE_BUCKET: "b",
          TF_STATE_ENDPOINT: "https://example.invalid",
          AWS_ACCESS_KEY_ID: "k",
          AWS_SECRET_ACCESS_KEY: "s",
        },
        encoding: "utf8",
      });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Plan stamp does not match this workflow run/);
    } finally {
      fs.rmSync(planDir, { recursive: true, force: true });
    }
  });

  it("applies only a stamped plan in CI", () => {
    const planDir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-plan-"));
    const plan = path.join(planDir, "tfplan");
    fs.writeFileSync(plan, "plan");
    fs.writeFileSync(path.join(planDir, "stamp"), "99");
    const log = path.join(planDir, "tofu.log");
    const tofu = fs.mkdtempSync(path.join(os.tmpdir(), "tofu-stub-"));
    fs.writeFileSync(
      path.join(tofu, "tofu"),
      `#!/usr/bin/env bash
echo "$*" >> "${log}"
exit 0
`,
      { mode: 0o755 },
    );
    const r = spawnSync("bash", ["scripts/run-infra-tofu-apply.sh"], {
      env: {
        PATH: `${tofu}:/usr/bin:/bin`,
        GITHUB_ACTIONS: "true",
        GITHUB_RUN_ID: "99",
        INFRA_CI_PLAN_DIR: planDir,
        CLOUDFLARE_API_TOKEN: "t",
        CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
        TF_STATE_BUCKET: "b",
        TF_STATE_ENDPOINT: "https://example.invalid",
        AWS_ACCESS_KEY_ID: "k",
        AWS_SECRET_ACCESS_KEY: "s",
      },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    const argv = fs.readFileSync(log, "utf8");
    assert.match(argv, /apply -auto-approve/);
    assert.doesNotMatch(argv, / plan /);
  });
});
