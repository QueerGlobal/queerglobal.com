import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("test temp hygiene", () => {
  it("runs npm test through the TMPDIR guard wrapper", () => {
    assert.equal(process.env.NPM_TEST_TMPDIR_GUARD, "1");
  });
});
