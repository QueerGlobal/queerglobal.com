import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadProductionReviewerUsernames } from "./bootstrap-reviewers.mjs";
import { mkdtempTracked } from "../test-helpers/test-temp.mjs";

describe("loadProductionReviewerUsernames", () => {
  it("loads reviewers from the committed auto tfvars file", () => {
    const list = loadProductionReviewerUsernames(process.cwd());
    assert.ok(list.includes("mnyon-grandkru"));
  });

  it("rejects an empty reviewer list", () => {
    const root = mkdtempTracked("reviewers-");
    fs.mkdirSync(path.join(root, "infra/bootstrap"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "infra/bootstrap/production-reviewers.auto.tfvars.json"),
      JSON.stringify({ production_reviewer_usernames: [] }),
    );
    assert.throws(() => loadProductionReviewerUsernames(root), /at least one reviewer/);
  });
});
