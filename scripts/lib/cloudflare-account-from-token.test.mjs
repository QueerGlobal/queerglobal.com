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

  it("makes one read-only GET with a timeout signal", async () => {
    const calls = [];
    await cloudflareAccountIdFromToken({
      token: "t",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), method: init?.method, signal: init?.signal });
        return bootstrapStandInFetch()(url, init);
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.match(calls[0].url, /\/zones\?name=grandkru\.com$/);
    assert.ok(calls[0].signal instanceof AbortSignal, "expected a timeout signal");
  });

  it("returns an error instead of hanging when the lookup times out", async () => {
    // A real request keeps the event loop alive; this stand-in holds a timer so the abort can fire.
    const hang = (_url, init) =>
      new Promise((_resolve, reject) => {
        const keepAlive = setTimeout(() => {}, 10_000);
        init.signal.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          reject(init.signal.reason);
        });
      });
    const r = await cloudflareAccountIdFromToken({ token: "t", fetchImpl: hang, timeoutMs: 50 });
    assert.equal(r.ok, false);
    assert.match(r.error, /zone lookup for grandkru\.com failed/);
  });

  it("returns an error when the request throws", async () => {
    const r = await cloudflareAccountIdFromToken({
      token: "t",
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    assert.deepEqual(r, { ok: false, error: "Cloudflare zone lookup for grandkru.com failed: network down" });
  });

  it("rejects a response with more than one zone", async () => {
    const r = await cloudflareAccountIdFromToken({
      token: "t",
      fetchImpl: async () => new Response(JSON.stringify({ success: true, result: [{ account: { id: ACCOUNT_ID } }, { account: { id: ACCOUNT_ID } }] })),
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /exactly one zone/);
  });
});
