import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cloudflareProbeAccountTokensWrite,
  cloudflareProbeR2Buckets,
  cloudflareProbeZoneOnAccount,
  cloudflareVerifyActiveToken,
  preflightBootstrapCloudflare,
} from "./preflight-bootstrap-cloudflare.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const ZONE_ID = "4f8b3c2d1e0a9b8c7d6e5f4a3b2c1d0e";

/**
 * @returns {typeof fetch}
 */
function fullTokenFetchImpl() {
  return async (url) => {
    const path = String(url);
    if (path.includes(`/accounts/${ACCOUNT_ID}/tokens/verify`)) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: { id: "token-id", status: "active" },
        }),
      };
    }
    if (path.includes(`/accounts/${ACCOUNT_ID}/r2/buckets`)) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [{ name: "existing-bucket", creation_date: "2024-01-01T00:00:00.000Z" }],
        }),
      };
    }
    if (path.includes("/zones?")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [
            {
              id: ZONE_ID,
              name: "grandkru.com",
              account: { id: ACCOUNT_ID, name: "Example account" },
            },
          ],
        }),
      };
    }
    if (path.includes(`/accounts/${ACCOUNT_ID}/tokens`) && !path.includes("/verify")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          errors: [],
          messages: [],
          result: [{ id: "listed-token", name: "example" }],
        }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };
}

describe("preflightBootstrapCloudflare capability probes", () => {
  it("passes a full account token (real response shapes)", async () => {
    const result = await preflightBootstrapCloudflare({
      token: "full-token",
      accountId: ACCOUNT_ID,
      fetchImpl: fullTokenFetchImpl(),
    });
    assert.equal(result.ok, true);
  });

  it("fails when R2 probe returns 403 (deny respected)", async () => {
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
          json: async () => ({
            success: false,
            errors: [{ code: 10000, message: "Authentication error" }],
            messages: [],
          }),
        };
      }
      throw new Error(path);
    };
    const result = await cloudflareProbeR2Buckets({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /R2 probe failed/);
  });
});

describe("cloudflareProbeZoneOnAccount", () => {
  it("rejects a zone on another account", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        errors: [],
        messages: [],
        result: [
          {
            id: ZONE_ID,
            name: "grandkru.com",
            account: { id: "fedcba9876543210fedcba9876543210" },
          },
        ],
      }),
    });
    const result = await cloudflareProbeZoneOnAccount({
      token: "t",
      accountId: ACCOUNT_ID,
      zoneName: "grandkru.com",
      fetchImpl,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /not on account/);
  });
});

describe("cloudflareVerifyActiveToken", () => {
  it("requires active status from verify", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("/tokens/verify")) {
        return {
          ok: true,
          json: async () => ({ success: true, result: { status: "expired" } }),
        };
      }
      throw new Error(url);
    };
    const result = await cloudflareVerifyActiveToken({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl,
    });
    assert.equal(result.ok, false);
  });
});

describe("cloudflareProbeAccountTokensWrite", () => {
  it("fails when account token list is forbidden", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        success: false,
        errors: [{ code: 10000, message: "Forbidden" }],
        messages: [],
      }),
    });
    const result = await cloudflareProbeAccountTokensWrite({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl,
    });
    assert.equal(result.ok, false);
  });
});
