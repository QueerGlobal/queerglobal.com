import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SKIP = new Set([".git", "node_modules", ".wrangler", ".terraform"]);

/** @param {string} dir @returns {string[]} */
function docFiles(dir = REPO) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return docFiles(full);
    return /\.md$/.test(e.name) || e.name === "Makefile" ? [full] : [];
  });
}

/** @param {string} text @returns {string[]} lines inside fenced code blocks */
function codeLines(text) {
  const out = [];
  let inside = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      inside = !inside;
      continue;
    }
    if (inside) out.push(line);
  }
  return out;
}

const SECRETISH = /(TOKEN|SECRET|PASSPHRASE|PASSWORD|ACCESS_KEY|API_KEY)/i;

describe("docs never ask for a secret in the shell", () => {
  const files = docFiles();

  it("finds the docs it checks", () => {
    const rel = files.map((f) => path.relative(REPO, f));
    assert.ok(rel.includes("infra/bootstrap/README.md") && rel.includes("infra/README.md") && rel.includes("Makefile"));
  });

  for (const file of files) {
    const rel = path.relative(REPO, file);
    const lines = rel === "Makefile" ? fs.readFileSync(file, "utf8").split("\n") : codeLines(fs.readFileSync(file, "utf8"));
    it(`${rel}: no secret is read from the keyboard, exported, or written in by hand`, () => {
      const bad = lines.filter((line) => {
        if (/\bread\s+(-\w*s\w*)/.test(line)) return true;
        const exp = line.match(/^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (exp && (SECRETISH.test(exp[1]) || /^TF_VAR_/.test(exp[1]))) return true;
        const assign = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(["']?)\.\.\.\2\s*$/);
        return Boolean(assign);
      });
      assert.deepEqual(bad, []);
    });
  }

  it("every bootstrap command in the bootstrap README loads its tokens through bootstrap-run.sh", () => {
    const lines = codeLines(fs.readFileSync(path.join(REPO, "infra/bootstrap/README.md"), "utf8"));
    const needsTokens = lines.filter((l) => /preflight-bootstrap(-cloudflare)?\.mjs|bootstrap-tofu-apply\.sh|bootstrap-passphrase-rotate(-run)?\.sh/.test(l));
    assert.ok(needsTokens.length >= 4, "expected the preflight, apply and rotation commands");
    for (const line of needsTokens) {
      assert.match(line, /^(?:[A-Z_]+=\S+\s+)*bash scripts\/bootstrap-run\.sh /, line);
    }
  });
});
