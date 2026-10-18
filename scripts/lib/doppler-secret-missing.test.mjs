import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dopplerSecretGetMeansMissing } from "./doppler-secret-missing.mjs";

describe("dopplerSecretGetMeansMissing", () => {
  it("treats typical not-found stderr as missing", () => {
    assert.equal(dopplerSecretGetMeansMissing("Secret not found in config", 1), true);
  });

  it("does not treat auth errors as missing", () => {
    assert.equal(dopplerSecretGetMeansMissing("Doppler Error: invalid token", 1), false);
  });
});
