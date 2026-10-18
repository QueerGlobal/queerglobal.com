import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dopplerSecretGetMeansMissing } from "./doppler-secret-missing.mjs";

const NAME = "BOOTSTRAP_STATE_PASSPHRASE";

describe("dopplerSecretGetMeansMissing", () => {
  it("treats Doppler's missing secret message for the named secret as missing", () => {
    assert.equal(dopplerSecretGetMeansMissing(`Doppler Error: Could not find requested secret: ${NAME}\n`, 1, NAME), true);
  });

  for (const [label, stderr] of [
    ["an auth error phrased as token not found", "Doppler Error: Invalid Auth token: token not found"],
    ["a missing project", "Doppler Error: Could not find requested project"],
    ["a network error mentioning 404", "Doppler Error: Get \"https://api.doppler.com/v3/configs/config/secret\": 404 page from proxy"],
    ["a different secret", "Doppler Error: Could not find requested secret: OTHER_SECRET"],
    ["a longer secret name with the same prefix", `Doppler Error: Could not find requested secret: ${NAME}_NEXT`],
  ]) {
    it(`does not treat ${label} as missing`, () => {
      assert.equal(dopplerSecretGetMeansMissing(stderr, 1, NAME), false);
    });
  }

  it("never treats a successful get as missing", () => {
    assert.equal(dopplerSecretGetMeansMissing(`Could not find requested secret: ${NAME}`, 0, NAME), false);
  });
});
