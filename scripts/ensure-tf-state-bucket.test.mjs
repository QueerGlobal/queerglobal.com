import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WRANGLER_R2_BUCKET_ALREADY_OWNED_CODE,
  WRANGLER_R2_BUCKET_NAME_CONFLICT_CODE,
  WRANGLER_R2_BUCKET_NOT_FOUND_CODE,
  ensureTfStateBucket,
  parseWranglerErrorCode,
} from "./ensure-tf-state-bucket.mjs";

const REAL_ALREADY_OWNED_OUTPUT =
  "The bucket you tried to create already exists, and you own it. [code: 10004]";

describe("parseWranglerErrorCode", () => {
  it("reads Cloudflare API error codes from wrangler output", () => {
    assert.equal(parseWranglerErrorCode(REAL_ALREADY_OWNED_OUTPUT), 10004);
    assert.equal(
      parseWranglerErrorCode("The specified bucket does not exist. [code: 10006]"),
      10006,
    );
  });
});

describe("ensureTfStateBucket", () => {
  it("skips when bucket info succeeds", () => {
    /** @type {string[][]} */
    const calls = [];
    const spawnImpl = (_bin, args) => {
      calls.push(args);
      if (args[2] === "info") {
        return { status: 0, stdout: "my-tf-state-bucket", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "unexpected create" };
    };

    const outcome = ensureTfStateBucket({
      bucketName: "my-tf-state-bucket",
      accountId: "acct",
      apiToken: "token",
      wranglerBin: "/bin/wrangler",
      spawnImpl,
    });

    assert.equal(outcome.skipped, true);
    assert.equal(outcome.created, false);
    assert.deepEqual(calls, [["r2", "bucket", "info", "my-tf-state-bucket"]]);
  });

  it("creates when info reports code 10006 then create succeeds", () => {
    /** @type {string[][]} */
    const calls = [];
    const spawnImpl = (_bin, args) => {
      calls.push(args);
      if (args[2] === "info") {
        return {
          status: 1,
          stdout: "",
          stderr: "The specified bucket does not exist. [code: 10006]",
        };
      }
      return { status: 0, stdout: "Created bucket my-tf-state-bucket", stderr: "" };
    };

    const outcome = ensureTfStateBucket({
      bucketName: "my-tf-state-bucket",
      accountId: "acct",
      apiToken: "token",
      wranglerBin: "/bin/wrangler",
      spawnImpl,
    });

    assert.equal(outcome.skipped, false);
    assert.equal(outcome.created, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1][2], "create");
  });

  it("skips when create returns the real code 10004 already-owned output", () => {
    const spawnImpl = (_bin, args) => {
      if (args[2] === "info") {
        return {
          status: 1,
          stdout: "",
          stderr: `The specified bucket does not exist. [code: ${WRANGLER_R2_BUCKET_NOT_FOUND_CODE}]`,
        };
      }
      return { status: 1, stdout: "", stderr: REAL_ALREADY_OWNED_OUTPUT };
    };

    const outcome = ensureTfStateBucket({
      bucketName: "my-tf-state-bucket",
      accountId: "acct",
      apiToken: "token",
      wranglerBin: "/bin/wrangler",
      spawnImpl,
    });

    assert.equal(outcome.skipped, true);
    assert.equal(outcome.created, false);
  });

  it("throws when create returns code 10073 name conflict", () => {
    const spawnImpl = (_bin, args) => {
      if (args[2] === "info") {
        return {
          status: 1,
          stdout: "",
          stderr: `The specified bucket does not exist. [code: ${WRANGLER_R2_BUCKET_NOT_FOUND_CODE}]`,
        };
      }
      return {
        status: 1,
        stdout: "",
        stderr: `The bucket name is unavailable. [code: ${WRANGLER_R2_BUCKET_NAME_CONFLICT_CODE}]`,
      };
    };

    assert.throws(
      () =>
        ensureTfStateBucket({
          bucketName: "my-tf-state-bucket",
          accountId: "acct",
          apiToken: "token",
          wranglerBin: "/bin/wrangler",
          spawnImpl,
        }),
      /already used by another account \[code: 10073\]/,
    );
  });

  it("throws on unknown wrangler errors", () => {
    const spawnImpl = (_bin, args) => {
      if (args[2] === "info") {
        return {
          status: 1,
          stdout: "",
          stderr: `The specified bucket does not exist. [code: ${WRANGLER_R2_BUCKET_NOT_FOUND_CODE}]`,
        };
      }
      return { status: 1, stdout: "", stderr: "Authentication error [code: 10000]" };
    };

    assert.throws(
      () =>
        ensureTfStateBucket({
          bucketName: "my-tf-state-bucket",
          accountId: "acct",
          apiToken: "token",
          wranglerBin: "/bin/wrangler",
          spawnImpl,
        }),
      /Failed to create R2 bucket/,
    );
  });
});
