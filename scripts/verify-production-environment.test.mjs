import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countRequiredReviewersFromProtectionRules,
  environmentDeploysFromMainOnly,
  verifyProductionEnvironmentProtected,
} from "./verify-production-environment.mjs";

/** Shape returned by GET /repos/{owner}/{repo}/environments/{environment_name} */
const githubProductionEnvironment = {
  id: 12345678,
  node_id: "ENVR_kwDOABC1234",
  name: "production",
  url: "https://api.github.com/repos/QueerGlobal/queerglobal.com/environments/production",
  html_url: "https://github.com/QueerGlobal/queerglobal.com/settings/environments",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  can_admins_bypass: true,
  protection_rules: [
    {
      id: 990,
      node_id: "ENVRPROTECTION_kwDOABC1234",
      type: "required_reviewers",
      prevent_self_review: false,
      reviewers: [
        {
          type: "User",
          reviewer: {
            login: "octocat",
            id: 1,
            node_id: "MDQ6VXNlcjE=",
            avatar_url: "https://github.com/images/error/octocat_happy.gif",
            html_url: "https://github.com/octocat",
            gravatar_id: "",
            type: "User",
            site_admin: false,
          },
        },
      ],
    },
  ],
  deployment_branch_policy: {
    protected_branches: true,
    custom_branch_policies: false,
  },
};

describe("countRequiredReviewersFromProtectionRules", () => {
  it("counts reviewers on required_reviewers protection rules", () => {
    assert.equal(countRequiredReviewersFromProtectionRules(githubProductionEnvironment), 1);
  });
});

describe("environmentDeploysFromMainOnly", () => {
  it("accepts protected default branch policy", () => {
    assert.equal(environmentDeploysFromMainOnly(githubProductionEnvironment), true);
  });

  it("accepts explicit custom main branch policy", () => {
    assert.equal(
      environmentDeploysFromMainOnly({
        deployment_branch_policy: {
          protected_branches: false,
          custom_branch_policies: true,
          custom_branch_policy_names: ["main"],
        },
      }),
      true,
    );
  });
});

describe("verifyProductionEnvironmentProtected", () => {
  it("passes with GitHub environment API shape", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => githubProductionEnvironment,
    });
    const result = await verifyProductionEnvironmentProtected({
      owner: "QueerGlobal",
      repo: "queerglobal.com",
      token: "token",
      fetchImpl,
    });
    assert.equal(result.reviewers, 1);
    assert.equal(result.mainOnlyDeploy, true);
  });

  it("throws when protection_rules has no required reviewers", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        ...githubProductionEnvironment,
        protection_rules: [],
      }),
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
