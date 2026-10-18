import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ensureTfStateBucket,
  isR2BucketAlreadyExistsMessage,
} from "./ensure-tf-state-bucket.mjs";

describe("isR2BucketAlreadyExistsMessage", () => {
  it("matches wrangler bucket-already-exists output for the named bucket", () => {
    const output =
      "✘ A bucket with that name already exists. Try a different name. (my-tf-state-bucket)";
    assert.equal(isR2BucketAlreadyExistsMessage(output, "my-tf-state-bucket"), true);
  });

  it("does not treat unrelated 409 errors as bucket exists", () => {
    const output = "HTTP 409: conflict on unrelated resource";
    assert.equal(isR2BucketAlreadyExistsMessage(output, "my-tf-state-bucket"), false);
  });
});

describe("ensureTfStateBucket", () => {
  it("returns created when wrangler succeeds", () => {
    const spawnImpl = () => ({
      status: 0,
      stdout: "Created bucket my-tf-state-bucket",
      stderr: "",
    });
    const outcome = ensureTfStateBucket({
      bucketName: "my-tf-state-bucket",
      accountId: "acct",
      apiToken: "token",
      wranglerBin: "/bin/wrangler",
      spawnImpl,
    });
    assert.equal(outcome.created, true);
    assert.equal(outcome.skipped, false);
  });

  it("returns skipped when the bucket already exists", () => {
    const spawnImpl = () => ({
      status: 1,
      stdout: "",
      stderr:
        "✘ A bucket with that name already exists. Try a different name. (my-tf-state-bucket)",
    });
    const outcome = ensureTfStateBucket({
      bucketName: "my-tf-state-bucket",
      accountId: "acct",
      apiToken: "token",
      wranglerBin: "/bin/wrangler",
      spawnImpl,
    });
    assert.equal(outcome.created, false);
    assert.equal(outcome.skipped, true);
  });

  it("throws on unexpected wrangler failure", () => {
    const spawnImpl = () => ({
      status: 1,
      stdout: "",
      stderr: "Authentication error [code: 10000]",
    });
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
