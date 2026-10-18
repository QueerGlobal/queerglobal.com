// Used only by test-tmpdir-clean.test.mjs: a test that cleans up after itself.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";

it("removes its temp directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cleaned-by-fixture-"));
  fs.rmSync(dir, { recursive: true, force: true });
});
