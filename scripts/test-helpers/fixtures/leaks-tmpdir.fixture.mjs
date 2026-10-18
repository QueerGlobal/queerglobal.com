// Used only by test-tmpdir-clean.test.mjs: a test that leaves a directory in TMPDIR.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";

it("leaves a temp directory behind", () => {
  fs.mkdtempSync(path.join(os.tmpdir(), "leaked-by-fixture-"));
});
