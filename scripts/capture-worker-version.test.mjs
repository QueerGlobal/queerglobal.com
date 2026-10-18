import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { captureWorkerVersionId } from "./capture-worker-version.mjs";
import { NO_PREVIOUS_WORKER_VERSION } from "./worker-rollback.mjs";
import { mkdtempTracked } from "./test-helpers/test-temp.mjs";

describe("captureWorkerVersionId", () => {
  it("writes the no-previous marker when the Worker does not exist", async () => {
    const dir = mkdtempTracked("capture-worker-");
    const outputPath = path.join(dir, "previous-version");
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({
        success: false,
        errors: [{ message: "Script not found", code: 10007 }],
      }),
    });

    const versionId = await captureWorkerVersionId({
      accountId: "acct",
      apiToken: "token",
      scriptName: "queerglobal-grandkru",
      outputPath,
      fetchImpl,
    });

    assert.equal(versionId, null);
    assert.equal(
      fs.readFileSync(outputPath, "utf8").trim(),
      NO_PREVIOUS_WORKER_VERSION,
    );
  });
});
