import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyProductionEnvironmentProtected } from "./verify-production-environment.mjs";

describe("verifyProductionEnvironmentProtected", () => {
  it("passes when reviewers are configured", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        reviewers: [{ type: "User", id: 1 }],
        deployment_branch_policy: { protected_branches: true },
      }),
    });
    const result = await verifyProductionEnvironmentProtected({
      owner: "QueerGlobal",
      repo: "queerglobal.com",
      token: "token",
      fetchImpl,
    });
    assert.equal(result.reviewers, 1);
  });

  it("throws when no reviewers are configured", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ reviewers: [] }),
    });
    await assert.rejects(
      () =>
        verifyProductionEnvironmentProtected({
          owner: "QueerGlobal",
          repo: "queerglobal.com",
          token: "token",
          fetchImpl,
        }),
      /no required reviewers/,
    );
  });
});
