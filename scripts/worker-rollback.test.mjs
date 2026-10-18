import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deployWorkerVersion,
  getLatestDeploymentVersionId,
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
