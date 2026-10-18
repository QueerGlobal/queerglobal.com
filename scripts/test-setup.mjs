import { afterEach } from "node:test";

import { cleanupAllTracked } from "./test-helpers/test-temp.mjs";

afterEach(() => {
  cleanupAllTracked();
});
