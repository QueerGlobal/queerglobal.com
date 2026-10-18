import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { mkdtempTracked, rmTracked } from "./test-helpers/test-temp.mjs";

const FAKE_TOKEN = "fake-cf-token-committed-env-0001";

/**
 * @param {string} work
 * @param {string} body
 * @returns {string}
 */
function fetchPreload(work, body) {
  const file = path.join(work, "fetch-preload.mjs");
  fs.writeFileSync(file, body);
  return file;
}

/**
 * @param {string} work
 * @param {string} preload
 * @param {string} args
 */
function sourceCommittedEnv(work, preload, args = "") {
  return spawnSync(
    "bash",
    ["-c", `set -euo pipefail; . scripts/bootstrap-committed-env.sh ${args}; echo "CONTINUED project=\${TF_VAR_doppler_project:-unset} account=\${TF_VAR_cloudflare_account_id:-unset}"`],
    {
      env: {
        PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
        TMPDIR: work,
        CLOUDFLARE_API_TOKEN: FAKE_TOKEN,
        NODE_OPTIONS: `--import=${preload}`,
      },
      encoding: "utf8",
    },
  );
}

describe("bootstrap-committed-env.sh", () => {
  it("stops the sourcing script when the account id cannot be derived", () => {
    const work = mkdtempTracked("committed-env-");
    try {
      const preload = fetchPreload(work, 'globalThis.fetch = async () => { throw new Error("network down"); };\n');
      const r = sourceCommittedEnv(work, preload);
      assert.notEqual(r.status, 0);
      assert.doesNotMatch(r.stdout, /CONTINUED/);
      assert.match(r.stderr, /zone lookup for grandkru\.com failed: network down/);
    } finally {
      rmTracked(work);
    }
  });

  it("exports the committed slugs and the derived account id, and never prints the token", () => {
    const work = mkdtempTracked("committed-env-");
    try {
      const preload = fetchPreload(
        work,
        `globalThis.fetch = async (url, init) => {
  if (init?.method !== "GET" || !String(url).endsWith("/zones?name=grandkru.com")) throw new Error("unexpected request " + url);
  return new Response(JSON.stringify({ success: true, result: [{ account: { id: "0123456789abcdef0123456789abcdef" } }] }));
};
`,
      );
      const r = sourceCommittedEnv(work, preload);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /CONTINUED project=queerglobal account=0123456789abcdef0123456789abcdef/);
      assert.ok(!`${r.stdout}${r.stderr}`.includes(FAKE_TOKEN), "token was printed");
    } finally {
      rmTracked(work);
    }
  });

  it("exports only the slugs with --slugs-only and makes no request", () => {
    const work = mkdtempTracked("committed-env-");
    try {
      const preload = fetchPreload(work, 'globalThis.fetch = async () => { throw new Error("no request expected"); };\n');
      const r = sourceCommittedEnv(work, preload, "--slugs-only");
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /CONTINUED project=queerglobal account=unset/);
    } finally {
      rmTracked(work);
    }
  });

  it("fails instead of exiting 0 with no output when the lookup never settles", () => {
    const work = mkdtempTracked("committed-env-");
    try {
      const preload = fetchPreload(work, "globalThis.fetch = () => new Promise(() => {});\n");
      const r = spawnSync(process.execPath, ["scripts/bootstrap-export-committed-env.mjs"], {
        env: { PATH: "/usr/bin:/bin", TMPDIR: work, CLOUDFLARE_API_TOKEN: FAKE_TOKEN, NODE_OPTIONS: `--import=${preload}` },
        encoding: "utf8",
        timeout: 30_000,
      });
      assert.notEqual(r.status, 0);
      assert.equal(r.stdout, "");
    } finally {
      rmTracked(work);
    }
  });
});
