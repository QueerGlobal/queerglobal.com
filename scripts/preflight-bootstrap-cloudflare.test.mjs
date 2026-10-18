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

describe("preflightBootstrapCloudflare account id lookup", () => {
  it("derives the account id when TF_VAR_cloudflare_account_id is unset", async () => {
    const saved = process.env.TF_VAR_cloudflare_account_id;
    delete process.env.TF_VAR_cloudflare_account_id;
    try {
      const result = await preflightBootstrapCloudflare({
        token: "full-token",
        fetchImpl: bootstrapStandInFetch(),
      });
      assert.equal(result.ok, true);
    } finally {
      if (saved === undefined) {
        delete process.env.TF_VAR_cloudflare_account_id;
      } else {
        process.env.TF_VAR_cloudflare_account_id = saved;
      }
    }
  });

  it("fails closed when the zone lookup fails and no account id was passed", async () => {
    const result = await preflightBootstrapCloudflare({
      token: "full-token",
      fetchImpl: fetchWith(() => ({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          errors: [{ message: "zone lookup denied" }],
        }),
      })),
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /zone lookup failed/);
  });

  it("rejects a hand-set TF_VAR_cloudflare_account_id that does not match the token lookup", async () => {
    const saved = process.env.TF_VAR_cloudflare_account_id;
    process.env.TF_VAR_cloudflare_account_id = "ffffffffffffffffffffffffffffffff";
    try {
      const result = await preflightBootstrapCloudflare({
        token: "full-token",
        fetchImpl: bootstrapStandInFetch(),
      });
      assert.equal(result.ok, false);
      if (result.ok) {
        throw new Error("expected failure");
      }
      assert.match(result.error, /does not match the account/);
    } finally {
      if (saved === undefined) {
        delete process.env.TF_VAR_cloudflare_account_id;
      } else {
        process.env.TF_VAR_cloudflare_account_id = saved;
      }
    }
  });
});

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

describe("cloudflareProbeAccountApiTokensWrite policy scope", () => {
  const writeGroup = [{ name: "Account API Tokens Write" }];
  const thisAccount = { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: "*" };
  const cases = [
    {
      name: "passes with an allow policy on this account",
      policies: [{ effect: "allow", resources: thisAccount, permission_groups: writeGroup }],
      ok: true,
    },
    {
      name: "fails when the only matching policy is a deny",
      policies: [{ effect: "deny", resources: thisAccount, permission_groups: writeGroup }],
      ok: false,
    },
    {
      name: "fails when the matching policy does not say allow",
      policies: [{ resources: thisAccount, permission_groups: writeGroup }],
      ok: false,
    },
    {
      name: "fails when a deny policy overrides the allow",
      policies: [
        { effect: "allow", resources: thisAccount, permission_groups: writeGroup },
        { effect: "deny", resources: thisAccount, permission_groups: writeGroup },
      ],
      ok: false,
    },
    {
      name: "fails when the allow policy covers a different account",
      policies: [
        {
          effect: "allow",
          resources: { "com.cloudflare.api.account.ffffffffffffffffffffffffffffffff": "*" },
          permission_groups: writeGroup,
        },
      ],
      ok: false,
    },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const fetchImpl = fetchWith((path) =>
        path.includes("/tokens/cf-token-id")
          ? { ok: true, json: async () => ({ success: true, result: { policies: c.policies } }) }
          : undefined,
      );
      const result = await cloudflareProbeAccountApiTokensWrite({
        token: "t",
        accountId: ACCOUNT_ID,
        tokenId: "cf-token-id",
        tokenKind: "account",
        fetchImpl,
      });
      assert.equal(result.ok, c.ok, JSON.stringify(result));
      if (!c.ok) {
        assert.match(result.error, /allow policy for Account API Tokens Write on account/);
      }
    });
  }
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
