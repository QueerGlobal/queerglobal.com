import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { bootstrapE2eFetchImpl } from "./bootstrap-e2e-preflight.mjs";
import {
  dopplerManagementTokenLooksValid,
  preflightBootstrapDopplerProject,
  preflightBootstrapGithubAdmin,
  runPreflightBootstrapCli,
} from "./preflight-bootstrap.mjs";

describe("dopplerManagementTokenLooksValid", () => {
  it("accepts personal and service account tokens", () => {
    assert.equal(dopplerManagementTokenLooksValid("dp.pt.abc"), true);
    assert.equal(dopplerManagementTokenLooksValid("dp.sa.abc"), true);
  });

  it("rejects config service tokens", () => {
    assert.equal(dopplerManagementTokenLooksValid("dp.st.abc"), false);
  });
});

describe("preflightBootstrapGithubAdmin", () => {
  it("requires permissions.admin on the repository", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ permissions: { admin: true } }),
    });
    const result = await preflightBootstrapGithubAdmin({
      githubToken: "ghp_test",
      fetchImpl,
    });
    assert.equal(result.ok, true);
  });
});

describe("preflightBootstrapDopplerProject", () => {
  it("reads the Doppler project with a management token", async () => {
    const fetchImpl = async (url) => {
      assert.match(String(url), /\/v3\/projects\/queerglobal$/);
      return { ok: true, json: async () => ({ id: "proj" }) };
    };
    const result = await preflightBootstrapDopplerProject({
      dopplerToken: "dp.pt.test",
      dopplerProject: "queerglobal",
      fetchImpl,
    });
    assert.equal(result.ok, true);
  });
});

describe("runPreflightBootstrapCli marker", () => {
  it("writes a marker file after successful checks", async () => {
    const marker = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "preflight-marker-")),
      "ok",
    );
    process.env.CLOUDFLARE_API_TOKEN = "cf-test-token";
    process.env.TF_VAR_cloudflare_account_id = "0123456789abcdef0123456789abcdef";
    process.env.TF_VAR_github_token = "ghp_test";
    process.env.TF_VAR_doppler_management_token = "dp.pt.test";
    process.env.TF_VAR_doppler_project = "queerglobal";
    process.env.TF_VAR_production_reviewer_usernames = '["octocat"]';

    const code = await runPreflightBootstrapCli({
      fetchImpl: bootstrapE2eFetchImpl(),
      markerPath: marker,
    });
    assert.equal(code, 0);
    const contents = await fs.readFile(marker, "utf8");
    assert.ok(contents.length > 0);
  });
});
