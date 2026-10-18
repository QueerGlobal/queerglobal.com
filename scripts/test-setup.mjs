import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "node:test";

import { cleanupAllTracked } from "./test-helpers/test-temp.mjs";

afterEach(() => {
  cleanupAllTracked();
  for (const dir of new Set([process.env.TMPDIR, os.tmpdir()].filter(Boolean))) {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(".git_signing_key_")) {
        fs.rmSync(path.join(dir, name), { force: true });
      }
    }
  }
});
