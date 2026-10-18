import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preflightBootstrapCloudflare } from "./preflight-bootstrap-cloudflare.mjs";
import {
  preflightBootstrapDopplerProject,
  preflightBootstrapGithubAdmin,
} from "./preflight-bootstrap.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";

describe("preflight mutation regressions", () => {
  it("does not treat Cloudflare deny as allow (403 on R2 probe fails preflight)", async () => {
    const fetchImpl = async (url) => {
      const path = String(url);
      if (path.includes("/tokens/verify")) {
        return {
          ok: true,
          json: async () => ({ success: true, result: { status: "active", id: "t" } }),
        };
      }
      if (path.includes("/r2/buckets")) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ success: false, errors: [{ message: "denied" }] }),
        };
      }
      if (path.includes("/zones?")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: [{ id: "z", name: "grandkru.com", account: { id: ACCOUNT_ID } }],
          }),
        };
      }
      if (path.endsWith("/tokens")) {
        return { ok: true, json: async () => ({ success: true, result: [] }) };
      }
      throw new Error(path);
    };
    const result = await preflightBootstrapCloudflare({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl,
    });
    assert.equal(result.ok, false);
  });

  it("rejects grandkru.com when the zone is on another account", async () => {
    const fetchImpl = async (url) => {
      const path = String(url);
      if (path.includes("/tokens/verify")) {
        return {
          ok: true,
          json: async () => ({ success: true, result: { status: "active", id: "t" } }),
        };
      }
      if (path.includes("/r2/buckets")) {
        return { ok: true, json: async () => ({ success: true, result: [] }) };
      }
      if (path.includes("/zones?")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: [{ id: "z", name: "grandkru.com", account: { id: "other-account-id" } }],
          }),
        };
      }
      if (path.endsWith("/tokens")) {
        return { ok: true, json: async () => ({ success: true, result: [] }) };
      }
      throw new Error(path);
    };
    const result = await preflightBootstrapCloudflare({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /not on account/);
  });

  it("requires R2 probe success on the target account (account scope)", async () => {
    const fetchImpl = async (url) => {
      const path = String(url);
      if (path.includes("/tokens/verify")) {
        return {
          ok: true,
          json: async () => ({ success: true, result: { status: "active", id: "t" } }),
        };
      }
      if (path.includes(`/accounts/${ACCOUNT_ID}/r2/buckets`)) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ success: false, errors: [{ message: "Forbidden" }] }),
        };
      }
      throw new Error(path);
    };
    const result = await preflightBootstrapCloudflare({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl,
    });
    assert.equal(result.ok, false);
  });

  it("fails when GitHub permissions.admin is false", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ permissions: { admin: false, push: true } }),
    });
    const result = await preflightBootstrapGithubAdmin({
      githubToken: "ghp_test",
      fetchImpl,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /admin/);
  });

  it("fails when Doppler project read errors", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      json: async () => ({ messages: [{ message: "Project not found" }] }),
    });
    const result = await preflightBootstrapDopplerProject({
      dopplerToken: "dp.pt.test",
      dopplerProject: "missing",
      fetchImpl,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /Doppler project read failed/);
  });
});
