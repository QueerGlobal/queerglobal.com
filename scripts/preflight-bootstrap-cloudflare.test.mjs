import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cloudflareProbeAccountApiTokensWrite,
  cloudflareProbeR2Buckets,
  cloudflareProbeZoneOnAccount,
  cloudflareVerifyActiveToken,
  preflightBootstrapCloudflare,
} from "./preflight-bootstrap-cloudflare.mjs";
import {
  ACCOUNT_ID,
  bootstrapStandInFetch,
  fetchWith,
  ZONE_ID,
} from "./test-helpers/fetch-stub.mjs";

describe("preflightBootstrapCloudflare capability probes", () => {
  it("passes a full account token (real response shapes)", async () => {
    const result = await preflightBootstrapCloudflare({
      token: "full-token",
      accountId: ACCOUNT_ID,
      fetchImpl: bootstrapStandInFetch(),
    });
    assert.equal(result.ok, true);
  });

  it("fails when R2 probe returns 403 (deny respected)", async () => {
    const fetchImpl = fetchWith((path) =>
      path.includes("/r2/buckets")
        ? {
            ok: false,
            status: 403,
            json: async () => ({
              success: false,
              errors: [{ code: 10000, message: "Authentication error" }],
              messages: [],
            }),
          }
        : undefined,
    );
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
    const fetchImpl = fetchWith(() => ({
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
    }));
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

describe("cloudflareProbeAccountApiTokensWrite", () => {
  it("fails when Account API Tokens Write is missing from token policies", async () => {
    const fetchImpl = fetchWith((path) => {
      if (path.includes("/tokens/cf-token-id")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: { policies: [{ permission_groups: [{ name: "Workers R2 Storage Read" }] }] },
          }),
        };
      }
      return undefined;
    });
    const result = await cloudflareProbeAccountApiTokensWrite({
      token: "t",
      accountId: ACCOUNT_ID,
      tokenId: "cf-token-id",
      tokenKind: "account",
      fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /Account API Tokens Write/);
  });
});

describe("cloudflareVerifyActiveToken", () => {
  it("requires active status from verify", async () => {
    const fetchImpl = fetchWith((url) =>
      url.includes("/tokens/verify")
        ? {
            ok: true,
            json: async () => ({ success: true, result: { status: "expired" } }),
          }
        : undefined,
    );
    const result = await cloudflareVerifyActiveToken({
      token: "t",
      accountId: ACCOUNT_ID,
      fetchImpl,
    });
    assert.equal(result.ok, false);
  });
});
