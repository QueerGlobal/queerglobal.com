import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deployWorkerVersion,
  getLatestDeploymentVersionId,
  isWorkerScriptNotFound,
  listWorkerDeployments,
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
  it("detects HTTP 404", () => {
    assert.equal(
      isWorkerScriptNotFound({ status: 404, statusText: "Not Found" }, { success: false }),
      true,
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
        result: [{ id: "dep-1", versions: [{ version_id: "abc", percentage: 100 }] }],
      }),
    });
    const result = await listWorkerDeployments("acct", "worker", "token", { fetchImpl });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "dep-1");
  });

  it("returns an empty list when the Worker script does not exist yet", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({
        success: false,
        errors: [{ message: "Script not found" }],
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
