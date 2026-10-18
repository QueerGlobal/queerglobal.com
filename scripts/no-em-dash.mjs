#!/usr/bin/env node
/**
 * Em-dash guard for repo docs, infra, scripts, and shipped front-end.
 *
 * Reusable in other repos: import the functions below or run this file as a CLI.
 *
 * @module no-em-dash
 * @exports {string} EM_DASH - Unicode em dash character (U+2014).
 * @exports {Set<string>} DEFAULT_EXTENSIONS - File extensions scanned by default.
 * @exports {Set<string>} DEFAULT_SKIP_DIR_NAMES - Directory names skipped by default.
 * @exports {findEmDashLocations} findEmDashLocations - Locate em dashes in a string.
 * @exports {scanForEmDash} scanForEmDash - Walk a tree and collect em-dash hits.
 * @exports {formatEmDashReport} formatEmDashReport - Human-readable failure report.
 * @exports {runNoEmDashCheck} runNoEmDashCheck - Scan rootDir; return 0 (ok) or 1 (fail).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ file: string, line: number, column: number, snippet: string }} EmDashHit */

export const EM_DASH = "\u2014";

export const DEFAULT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".md",
  ".markdown",
]);

export const DEFAULT_SKIP_DIR_NAMES = new Set(["archive", "node_modules", ".git"]);

/** Relative paths under the repo root scanned by the default repo guard. */
export const DEFAULT_SCAN_RELATIVE_PATHS = [
  "README.md",
  "infra",
  "scripts",
  "docs",
  "public",
  ".github/workflows",
];

export const DEFAULT_EXTENSIONS_WITH_INFRA = new Set([
  ...DEFAULT_EXTENSIONS,
  ".hcl",
  ".example",
  ".yml",
  ".yaml",
  ".toml",
]);

/**
 * @param {string} text
 * @returns {Array<{ line: number, column: number, snippet: string }>}
 */
export function findEmDashLocations(text) {
  const hits = [];
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") {
      line += 1;
      lineStart = i + 1;
      continue;
    }
    if (ch === EM_DASH) {
      const column = i - lineStart + 1;
      const sliceStart = Math.max(lineStart, i - 24);
      const sliceEnd = Math.min(text.length, i + 24);
      const snippet = text.slice(sliceStart, sliceEnd).replace(/\n/g, " ");
      hits.push({ line, column, snippet });
    }
  }
  return hits;
}

/**
 * @param {string} dir
 * @param {string} relativePrefix
 * @param {Set<string>} extensions
 * @param {Set<string>} skipDirNames
 * @returns {string[]}
 */
function collectFiles(dir, relativePrefix, extensions, skipDirNames) {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (skipDirNames.has(entry.name)) {
        continue;
      }
      files.push(
        ...collectFiles(path.join(dir, entry.name), rel, extensions, skipDirNames),
      );
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (extensions.has(ext)) {
      files.push(rel);
    }
  }
  return files.sort();
}

/**
 * @param {string} rootDir
 * @param {{
 *   extensions?: Set<string>,
 *   skipDirNames?: Set<string>,
 *   scanRelativePaths?: string[],
 *   fullTree?: boolean,
 * }} [options]
 * @returns {EmDashHit[]}
 */
export function scanForEmDash(rootDir, options = {}) {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS_WITH_INFRA;
  const skipDirNames = options.skipDirNames ?? DEFAULT_SKIP_DIR_NAMES;
  const absRoot = path.resolve(rootDir);

  /** @type {string[]} */
  let relFiles = [];
  if (options.fullTree) {
    relFiles = collectFiles(absRoot, "", extensions, skipDirNames);
  } else {
    const scanRelativePaths = options.scanRelativePaths ?? DEFAULT_SCAN_RELATIVE_PATHS;
    const seen = new Set();
    for (const relPath of scanRelativePaths) {
      const abs = path.join(absRoot, relPath);
      if (!fs.existsSync(abs)) {
        continue;
      }
      const stat = fs.statSync(abs);
      if (stat.isFile()) {
        const ext = path.extname(relPath).toLowerCase();
        if (extensions.has(ext)) {
          seen.add(relPath);
        }
        continue;
      }
      if (stat.isDirectory()) {
        for (const rel of collectFiles(abs, relPath, extensions, skipDirNames)) {
          seen.add(rel);
        }
      }
    }
    relFiles = [...seen].sort();
  }

  /** @type {EmDashHit[]} */
  const allHits = [];

  for (const rel of relFiles) {
    const abs = path.join(absRoot, rel);
    const text = fs.readFileSync(abs, "utf8");
    for (const loc of findEmDashLocations(text)) {
      allHits.push({ file: rel, ...loc });
    }
  }
  return allHits;
}

/**
 * @param {EmDashHit[]} hits
 * @returns {string}
 */
export function formatEmDashReport(hits) {
  if (hits.length === 0) {
    return "";
  }
  const lines = hits.map(
    (h) => `${h.file}:${h.line}:${h.column}: em dash (U+2014) in …${h.snippet}…`,
  );
  return [
    "Em dash (U+2014) is not allowed in README, infra/, scripts/, docs/, public/, or workflow files (archive/ excluded).",
    "Use plain punctuation (comma, period, colon, or parentheses) instead.",
    "",
    ...lines,
  ].join("\n");
}

/**
 * @param {string} rootDir
 * @param {{ extensions?: Set<string>, skipDirNames?: Set<string> }} [options]
 * @returns {number} exit code
 */
export function runNoEmDashCheck(rootDir, options = {}) {
  const hits = scanForEmDash(rootDir, options);
  if (hits.length === 0) {
    return 0;
  }
  console.error(formatEmDashReport(hits));
  return 1;
}

const thisFile = fileURLToPath(import.meta.url);
const invokedAsCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile);

if (invokedAsCli) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  process.exitCode = runNoEmDashCheck(root);
}
