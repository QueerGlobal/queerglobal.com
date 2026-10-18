/**
 * Reads `tofu show -json <plan>` on stdin and fails unless the plan only deletes
 * the coming-soon Worker and its custom domain. Failures are reported to Sentry by
 * the calling script's error trap.
 *
 * @module assert-first-deploy-destroy-plan
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIRST_DEPLOY_DESTROY_ALLOWLIST = Object.freeze([
  "cloudflare_workers_custom_domain.coming_soon",
  "cloudflare_workers_script.coming_soon",
]);

/**
 * @param {{ resource_changes?: Array<{ address: string, change?: { actions?: string[] } }> }} plan
 * @returns {{ ok: true, deleted: string[] } | { ok: false, error: string }}
 */
export function checkFirstDeployDestroyPlan(plan) {
  /** @type {string[]} */
  const deleted = [];
  for (const rc of plan.resource_changes ?? []) {
    const actions = rc.change?.actions ?? [];
    if (actions.length === 1 && actions[0] === "no-op") {
      continue;
    }
    if (!FIRST_DEPLOY_DESTROY_ALLOWLIST.includes(rc.address)) {
      return { ok: false, error: `Destroy plan touches ${rc.address}, which this cleanup may not change.` };
    }
    if (actions.length !== 1 || actions[0] !== "delete") {
      return { ok: false, error: `Destroy plan would ${actions.join("+")} ${rc.address}; only delete is allowed.` };
    }
    deleted.push(rc.address);
  }
  return { ok: true, deleted };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  const result = checkFirstDeployDestroyPlan(JSON.parse(fs.readFileSync(0, "utf8")));
  if (result.ok) {
    console.log(JSON.stringify({ event: "first_deploy_destroy_plan_ok", deleted: result.deleted }));
  } else {
    console.error(JSON.stringify({ event: "first_deploy_destroy_plan_rejected", error: result.error }));
    process.exitCode = 1;
  }
}
