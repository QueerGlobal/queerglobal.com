import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  missingCloudflareBootstrapPolicies,
  preflightBootstrapCloudflare,
  REQUIRED_CLOUDFLARE_PERMISSION_GROUPS,
} from "./preflight-bootstrap-cloudflare.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const ZONE_ID = "zone-grandkru-id";

/**
 * @param {object} options
 * @returns {typeof fetch}
 */
function makeFullAccountTokenFetch(options) {
  const tokenId = options.tokenId ?? "token-full";
  return async (url) => {
    const path = String(url);
    if (path.includes(`/accounts/${ACCOUNT_ID}/tokens/verify`)) {
      return { ok: true, json: async () => ({ success: true, result: { id: tokenId } }) };
    }
    if (path.includes(`/accounts/${ACCOUNT_ID}/tokens/${tokenId}`)) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          result: {
            policies: [
              {
                effect: "allow",
                permission_groups: [{ name: "Account API Tokens Write" }],
                resources: { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: "*" },
              },
              {
                effect: "allow",
                permission_groups: [{ name: "Workers R2 Storage Write" }],
                resources: { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: "*" },
              },
              {
                effect: "allow",
                permission_groups: [{ name: "Zone Read" }],
                resources: { [`com.cloudflare.api.account.zone.${ZONE_ID}`]: "*" },
              },
            ],
          },
        }),
      };
    }
    if (path.includes("/zones?name=grandkru.com")) {
      return {
        ok: true,
        json: async () => ({ success: true, result: [{ id: ZONE_ID, name: "grandkru.com" }] }),
      };
    }
    throw new Error(`unexpected url ${url}`);
  };
}

describe("missingCloudflareBootstrapPolicies", () => {
  it("requires all bootstrap permission groups with correct scope", () => {
    const policies = [
      {
        effect: "allow",
        permission_groups: [{ name: "Account API Tokens Write" }],
        resources: { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: "*" },
      },
      {
        effect: "allow",
        permission_groups: [{ name: "Workers R2 Storage Write" }],
        resources: { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: "*" },
      },
      {
        effect: "allow",
        permission_groups: [{ name: "Zone Read" }],
        resources: { [`com.cloudflare.api.account.zone.${ZONE_ID}`]: "*" },
      },
    ];
    assert.equal(missingCloudflareBootstrapPolicies(policies, ACCOUNT_ID, ZONE_ID), null);
    assert.equal(REQUIRED_CLOUDFLARE_PERMISSION_GROUPS.length, 3);
  });
});

describe("preflightBootstrapCloudflare", () => {
  it("passes a full account API token", async () => {
    const result = await preflightBootstrapCloudflare({
      token: "full-token",
      accountId: ACCOUNT_ID,
      fetchImpl: makeFullAccountTokenFetch({}),
    });
    assert.equal(result.ok, true);
  });

  it("fails a restricted token missing R2 write", async () => {
    const tokenId = "token-restricted";
    const fetchImpl = async (url) => {
      const path = String(url);
      if (path.includes(`/accounts/${ACCOUNT_ID}/tokens/verify`)) {
        return { ok: true, json: async () => ({ success: true, result: { id: tokenId } }) };
      }
      if (path.includes(`/accounts/${ACCOUNT_ID}/tokens/${tokenId}`)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            result: {
              policies: [
                {
                  effect: "allow",
                  permission_groups: [{ name: "Account API Tokens Write" }],
                  resources: { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: "*" },
                },
                {
                  effect: "allow",
                  permission_groups: [{ name: "Zone Read" }],
                  resources: { [`com.cloudflare.api.account.zone.${ZONE_ID}`]: "*" },
                },
              ],
            },
          }),
        };
      }
      if (path.includes("/zones?name=grandkru.com")) {
        return {
          ok: true,
          json: async () => ({ success: true, result: [{ id: ZONE_ID, name: "grandkru.com" }] }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    };

    const result = await preflightBootstrapCloudflare({
      token: "restricted",
      accountId: ACCOUNT_ID,
      fetchImpl,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /Workers R2 Storage Write/);
  });
});
