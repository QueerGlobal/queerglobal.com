/**
 * Committed bootstrap project slugs (Doppler configs).
 *
 * @module lib/bootstrap-project
 */

import fs from "node:fs";
import path from "node:path";

/**
 * @param {string} [repoRoot]
 * @returns {{ doppler_project: string, doppler_config: string, doppler_bootstrap_config: string }}
 */
export function loadBootstrapProjectConfig(repoRoot = process.cwd()) {
  const file = path.join(repoRoot, "infra/bootstrap/bootstrap-project.auto.tfvars.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const { doppler_project, doppler_config, doppler_bootstrap_config } = parsed;
  for (const [key, value] of Object.entries({
    doppler_project,
    doppler_config,
    doppler_bootstrap_config,
  })) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`bootstrap-project.auto.tfvars.json must set a non-empty ${key}.`);
    }
  }
  return {
    doppler_project,
    doppler_config,
    doppler_bootstrap_config,
  };
}

/**
 * @param {string} [repoRoot]
 * @returns {Record<string, string>}
 */
export function bootstrapProjectTfVarEnv(repoRoot = process.cwd()) {
  const cfg = loadBootstrapProjectConfig(repoRoot);
  return {
    TF_VAR_doppler_project: cfg.doppler_project,
    TF_VAR_doppler_config: cfg.doppler_config,
    TF_VAR_doppler_bootstrap_config: cfg.doppler_bootstrap_config,
  };
}
