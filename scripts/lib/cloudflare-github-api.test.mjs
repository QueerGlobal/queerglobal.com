import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cloudflareBearerGet, githubBearerRequest } from "./cloudflare-github-api.mjs";

describe("cloudflare-github-api", () => {
  it("cloudflareBearerGet sends Authorization without putting the token in the URL", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true, json: async () => ({ success: true, result: [] }) };
    };
    await cloudflareBearerGet("/accounts/x/r2/buckets", "cf-token-secret", fetchImpl);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/accounts\/x\/r2\/buckets$/);
    assert.equal(calls[0].init.headers.Authorization, "Bearer cf-token-secret");
    assert.doesNotMatch(calls[0].url, /cf-token-secret/);
  });

  it("githubBearerRequest sends Bearer auth on the request, not the URL", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true, json: async () => ({ permissions: { admin: true } }) };
    };
    await githubBearerRequest("https://api.github.com/repos/o/r", "ghp_testtoken", fetchImpl);
    assert.equal(calls[0].init.headers.Authorization, "Bearer ghp_testtoken");
    assert.doesNotMatch(calls[0].url, /ghp_testtoken/);
  });
});
