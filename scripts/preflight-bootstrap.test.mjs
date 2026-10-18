import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dopplerManagementTokenLooksValid,
  preflightBootstrapDopplerProject,
  preflightBootstrapGithubAdmin,
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
