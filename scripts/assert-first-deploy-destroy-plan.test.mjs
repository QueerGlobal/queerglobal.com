import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { checkFirstDeployDestroyPlan } from "./assert-first-deploy-destroy-plan.mjs";

const del = (address) => ({ address, change: { actions: ["delete"] } });

describe("checkFirstDeployDestroyPlan", () => {
  it("accepts deleting only the Worker and its custom domain", () => {
    const r = checkFirstDeployDestroyPlan({
      resource_changes: [del("cloudflare_workers_custom_domain.coming_soon"), del("cloudflare_workers_script.coming_soon")],
    });
    assert.deepEqual(r, {
      ok: true,
      deleted: ["cloudflare_workers_custom_domain.coming_soon", "cloudflare_workers_script.coming_soon"],
    });
  });

  it("rejects any other resource", () => {
    const r = checkFirstDeployDestroyPlan({ resource_changes: [del("cloudflare_dns_record.other")] });
    assert.equal(r.ok, false);
    assert.match(r.error, /touches cloudflare_dns_record\.other/);
  });

  it("rejects anything but delete on an allowed resource", () => {
    const r = checkFirstDeployDestroyPlan({
      resource_changes: [{ address: "cloudflare_workers_script.coming_soon", change: { actions: ["delete", "create"] } }],
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /only delete is allowed/);
  });
});

describe("run-infra-first-deploy-cleanup.sh gate", () => {
  /**
   * @param {string} marker
   * @param {string} planChanges
   */
  function runCleanup(marker, planChanges) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-gate-"));
    const bin = path.join(work, "bin");
    fs.mkdirSync(bin);
    const log = path.join(work, "tofu.log");
    fs.writeFileSync(
      path.join(bin, "tofu"),
      `#!/bin/bash\necho "$*" >> "${log}"\ncase "$*" in *" show -json "*) echo '{"resource_changes":[${planChanges}]}' ;; esac\n`,
      { mode: 0o755 },
    );
    const markerFile = path.join(work, "previous");
    fs.writeFileSync(markerFile, `${marker}\n`);
    const r = spawnSync("bash", ["scripts/run-infra-first-deploy-cleanup.sh", markerFile], {
      env: {
        PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: work,
        CLOUDFLARE_API_TOKEN: "t",
        CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
        TF_STATE_BUCKET: "b",
        TF_STATE_ENDPOINT: "https://example.invalid",
        AWS_ACCESS_KEY_ID: "k",
        AWS_SECRET_ACCESS_KEY: "s",
      },
      encoding: "utf8",
    });
    return { r, calls: fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "" };
  }

  it("does not apply a destroy plan that touches another resource", () => {
    const { r, calls } = runCleanup(
      "__NO_PREVIOUS_WORKER__",
      '{"address":"cloudflare_dns_record.other","change":{"actions":["delete"]}}',
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /first_deploy_destroy_plan_rejected/);
    assert.match(calls, /plan -destroy/);
    assert.doesNotMatch(calls, / apply /);
  });

  it("refuses before any OpenTofu call when a previous Worker version exists", () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-gate-"));
    const bin = path.join(work, "bin");
    fs.mkdirSync(bin);
    const log = path.join(work, "tofu.log");
    fs.writeFileSync(path.join(bin, "tofu"), `#!/bin/bash\necho "$*" >> "${log}"\n`, { mode: 0o755 });
    const marker = path.join(work, "previous");
    fs.writeFileSync(marker, "11111111-2222-3333-4444-555555555555\n");
    const r = spawnSync("bash", ["scripts/run-infra-first-deploy-cleanup.sh", marker], {
      env: { PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: work },
      encoding: "utf8",
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Refusing first-deploy cleanup/);
    assert.equal(fs.existsSync(log), false, "tofu must not run");
  });
});
