import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  EM_DASH,
  findEmDashLocations,
  formatEmDashReport,
  runNoEmDashCheck,
  scanForEmDash,
} from "./no-em-dash.mjs";

describe("findEmDashLocations", () => {
  it("finds em dash with line and column", () => {
    const text = "Hello\nworld" + EM_DASH + "ok";
    const hits = findEmDashLocations(text);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 2);
    assert.equal(hits[0].column, 6);
  });

  it("returns empty when no em dash", () => {
    assert.deepEqual(findEmDashLocations("plain text"), []);
  });
});

describe("scanForEmDash", () => {
  it("scans allowed extensions and skips archive/", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "no-em-dash-"));
    try {
      fs.writeFileSync(path.join(tmp, "ok.html"), "<p>fine</p>");
      fs.writeFileSync(path.join(tmp, "bad.md"), "nope" + EM_DASH);
      fs.mkdirSync(path.join(tmp, "archive"));
      fs.writeFileSync(path.join(tmp, "archive", "old.html"), "old" + EM_DASH);
      fs.writeFileSync(path.join(tmp, "skip.txt"), EM_DASH);

      const hits = scanForEmDash(tmp);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].file, "bad.md");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("runNoEmDashCheck", () => {
  it("returns 0 when clean", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "no-em-dash-clean-"));
    try {
      fs.writeFileSync(path.join(tmp, "page.html"), "<title>ok</title>");
      assert.equal(runNoEmDashCheck(tmp), 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 1 and formats report when em dash present", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "no-em-dash-fail-"));
    try {
      fs.writeFileSync(path.join(tmp, "x.css"), "/* " + EM_DASH + " */");
      assert.equal(runNoEmDashCheck(tmp), 1);
      const report = formatEmDashReport(scanForEmDash(tmp));
      assert.match(report, /x\.css:1:4/);
      assert.match(report, /U\+2014/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("repo guard", () => {
  it("passes on this repository root", () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    assert.equal(runNoEmDashCheck(repoRoot), 0);
  });
});
