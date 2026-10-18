import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countRequiredReviewersFromProtectionRules,
  deploymentBranchPoliciesAllowMainOnly,
  environmentAllowsAdminBypass,
  environmentUsesCustomBranchPolicies,
  verifyProductionEnvironmentProtected,
} from "./verify-production-environment.mjs";

const githubProductionEnvironment = {
  id: 12345678,
  name: "production",
  can_admins_bypass: false,
  protection_rules: [
    {
      id: 990,
      type: "required_reviewers",
      prevent_self_review: false,
      reviewers: [
        {
          type: "User",
          reviewer: { login: "octocat", id: 1 },
        },
      ],
    },
  ],
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
};

const githubDeploymentBranchPolicies = {
  total_count: 1,
  branch_policies: [
    {
      id: 664093354,
      node_id: "DEPLOYMENT_BRANCH_POLICY_kwDOI1E",
      name: "main",
      type: "branch",
    },
  ],
};

describe("environmentUsesCustomBranchPolicies", () => {
  it("requires custom branch policies with protected_branches disabled", () => {
    assert.equal(environmentUsesCustomBranchPolicies(githubProductionEnvironment), true);
  });
});

describe("environmentAllowsAdminBypass", () => {
  it("detects when admins can bypass environment protection", () => {
    assert.equal(environmentAllowsAdminBypass({ can_admins_bypass: true }), true);
    assert.equal(environmentAllowsAdminBypass({ can_admins_bypass: false }), false);
  });
});

describe("deploymentBranchPoliciesAllowMainOnly", () => {
  it("accepts a single branch policy named main", () => {
    assert.equal(deploymentBranchPoliciesAllowMainOnly(githubDeploymentBranchPolicies), true);
  });
});

describe("verifyProductionEnvironmentProtected", () => {
  it("passes with GitHub environment and deployment-branch-policies API shapes", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("deployment-branch-policies")) {
        return {
          ok: true,
          json: async () => githubDeploymentBranchPolicies,
        };
      }
      return {
        ok: true,
        json: async () => githubProductionEnvironment,
      };
    };
    const result = await verifyProductionEnvironmentProtected({
      owner: "QueerGlobal",
      repo: "queerglobal.com",
      token: "token",
      fetchImpl,
    });
    assert.equal(result.reviewers, 1);
    assert.equal(result.mainOnlyDeploy, true);
  });

  it("throws when repository admins can bypass the environment", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("deployment-branch-policies")) {
        return {
          ok: true,
          json: async () => githubDeploymentBranchPolicies,
        };
      }
      return {
        ok: true,
        json: async () => ({ ...githubProductionEnvironment, can_admins_bypass: true }),
      };
    };
    await assert.rejects(
      () =>
        verifyProductionEnvironmentProtected({
          owner: "QueerGlobal",
          repo: "queerglobal.com",
          token: "token",
          fetchImpl,
        }),
      /admins to bypass protection/,
    );
  });

  it("throws when deployment branch policies are not main-only", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("deployment-branch-policies")) {
        return {
          ok: true,
          json: async () => ({
            total_count: 1,
            branch_policies: [{ name: "develop", type: "branch" }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => githubProductionEnvironment,
      };
    };
    await assert.rejects(
      () =>
        verifyProductionEnvironmentProtected({
          owner: "QueerGlobal",
          repo: "queerglobal.com",
          token: "token",
          fetchImpl,
        }),
      /exactly one branch deployment policy named main/,
    );
  });
});

describe("countRequiredReviewersFromProtectionRules", () => {
  it("counts reviewers on required_reviewers protection rules", () => {
    assert.equal(countRequiredReviewersFromProtectionRules(githubProductionEnvironment), 1);
  });
});
