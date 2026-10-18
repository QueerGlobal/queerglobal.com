import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

describe("run-infra-tofu-apply.sh gating", () => {
  it("refuses to run without a CI plan stamp or break-glass approval", () => {
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
    assert.match(r.stderr, /Refusing to plan\/apply infra outside CI/);
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
