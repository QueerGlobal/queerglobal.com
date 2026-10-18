import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cloudflareAccountIdFromToken } from "./cloudflare-account-from-token.mjs";
import { ACCOUNT_ID, bootstrapStandInFetch } from "../test-helpers/fetch-stub.mjs";

describe("cloudflareAccountIdFromToken", () => {
  it("derives the account id from a zone visible to the token", async () => {
    const r = await cloudflareAccountIdFromToken({
      token: "t",
      fetchImpl: bootstrapStandInFetch(),
    });
    assert.deepEqual(r, { ok: true, accountId: ACCOUNT_ID });
  });
});
