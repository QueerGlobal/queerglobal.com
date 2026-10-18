/**
 * Write a new bootstrap state passphrase to stdout (for piping into Doppler stdin).
 * Never logs the value.
 *
 * @module bootstrap-generate-passphrase
 */

import { generateBootstrapPassphrase } from "./lib/bootstrap-passphrase.mjs";

process.stdout.write(generateBootstrapPassphrase());
