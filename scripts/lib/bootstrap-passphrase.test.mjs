import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateBootstrapPassphrase, isValidBootstrapPassphrase, MIN_PASSPHRASE_LENGTH } from "./bootstrap-passphrase.mjs";

describe("bootstrap passphrase generation", () => {
  it("generates a passphrase that meets the minimum length without logging it", () => {
    const pass = generateBootstrapPassphrase();
    assert.ok(isValidBootstrapPassphrase(pass));
    assert.ok(pass.length >= MIN_PASSPHRASE_LENGTH);
  });

  it("generates distinct passphrases on each call", () => {
    const a = generateBootstrapPassphrase();
    const b = generateBootstrapPassphrase();
    assert.notEqual(a, b);
  });
});
