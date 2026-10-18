import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dopplerManagementTokenLooksValid } from "./preflight-bootstrap.mjs";
import { preflightBootstrapCloudflare } from "./preflight-bootstrap-cloudflare.mjs";

describe("dopplerManagementTokenLooksValid", () => {
  it("accepts personal and service account tokens", () => {
    assert.equal(dopplerManagementTokenLooksValid("dp.pt.abc"), true);
    assert.equal(dopplerManagementTokenLooksValid("dp.sa.abc"), true);
  });

  it("rejects config service tokens", () => {
    assert.equal(dopplerManagementTokenLooksValid("dp.st.abc"), false);
  });
});

describe("preflightBootstrapCloudflare", () => {
  it("requires token verify, permission groups, and zone read", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("/user/tokens/verify")) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (String(url).includes("/tokens/permission_groups")) {
        return { ok: true, json: async () => ({ success: true, result: [] }) };
      }
      if (String(url).includes("/zones")) {
        return { ok: true, json: async () => ({ success: true, result: [{ id: "zone" }] }) };
      }
      throw new Error(`unexpected url ${url}`);
    };
    const result = await preflightBootstrapCloudflare({
      token: "token",
      accountId: "0123456789abcdef0123456789abcdef",
      fetchImpl,
    });
    assert.equal(result.ok, true);
  });
});
