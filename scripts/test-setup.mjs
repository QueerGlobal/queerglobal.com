import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "node:test";

import { cleanupAllTracked } from "./test-helpers/test-temp.mjs";

afterEach(() => {
  cleanupAllTracked();
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (/^tmp\.[A-Za-z0-9]+$/.test(name)) {
      fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
    }
  }
});
