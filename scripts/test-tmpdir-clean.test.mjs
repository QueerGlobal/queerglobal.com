import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runNodeTestsWithTmpdirGuard } from "./run-node-tests.mjs";

describe("test temp hygiene", () => {
  it("runs npm test through the TMPDIR guard wrapper", () => {
    assert.equal(process.env.NPM_TEST_TMPDIR_GUARD, "1");
  });

  it("fails the run when a test leaves anything in TMPDIR, and removes it", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "guard-parent-"));
    try {
      const r = runNodeTestsWithTmpdirGuard({
        files: ["scripts/test-helpers/fixtures/leaks-tmpdir.fixture.mjs"],
        parentTmp: parent,
        stdio: "ignore",
      });
      assert.equal(r.status, 1);
      assert.equal(r.leaked.length, 1);
      assert.match(r.leaked[0], /^leaked-by-fixture-/);
      assert.deepEqual(fs.readdirSync(parent), [], "guard left its private TMPDIR behind");
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it("passes a run whose tests clean up", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "guard-parent-"));
    try {
      const r = runNodeTestsWithTmpdirGuard({
        files: ["scripts/test-helpers/fixtures/clean-tmpdir.fixture.mjs"],
        parentTmp: parent,
        stdio: "ignore",
      });
      assert.deepEqual(r, { status: 0, leaked: [] });
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});
