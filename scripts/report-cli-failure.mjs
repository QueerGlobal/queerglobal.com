/**
 * Report a CLI failure to Sentry (optional DSN).
 *
 * @module report-cli-failure
 */

import { reportCliFailure } from "./lib/sentry-report.mjs";

const component = process.argv[2] ?? "cli";
const detail = process.argv[3] ?? "unknown";
await reportCliFailure(new Error(`${component} failed at line ${detail}`), { component });
process.exitCode = 0;
