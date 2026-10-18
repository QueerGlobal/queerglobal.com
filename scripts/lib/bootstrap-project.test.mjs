import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadBootstrapProjectConfig } from "./bootstrap-project.mjs";

describe("loadBootstrapProjectConfig", () => {
  it("loads Doppler slugs from the committed auto tfvars file", () => {
    const cfg = loadBootstrapProjectConfig(process.cwd());
    assert.equal(cfg.doppler_project, "queerglobal");
    assert.equal(cfg.doppler_config, "prd");
    assert.equal(cfg.doppler_bootstrap_config, "bootstrap");
  });
});
