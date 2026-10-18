/**
 * Load committed production reviewer usernames for bootstrap.
 *
 * @module lib/bootstrap-reviewers
 */

import fs from "node:fs";
import path from "node:path";

/**
 * @param {string} [repoRoot]
 * @returns {string[]}
 */
export function loadProductionReviewerUsernames(repoRoot = process.cwd()) {
  const file = path.join(repoRoot, "infra/bootstrap/production-reviewers.auto.tfvars.json");
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  const list = parsed.production_reviewer_usernames;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("production-reviewers.auto.tfvars.json must list at least one reviewer.");
  }
  for (const username of list) {
    if (typeof username !== "string" || username.trim().length === 0) {
      throw new Error("production-reviewers.auto.tfvars.json usernames must be non-empty strings.");
    }
  }
  return list;
}
