/**
 * Bootstrap state encryption passphrase (generate on first run, store in Doppler bootstrap config).
 *
 * @module lib/bootstrap-passphrase
 */

import { randomBytes } from "node:crypto";

/** Minimum length matches infra/bootstrap/variables.tf */
export const MIN_PASSPHRASE_LENGTH = 16;

/**
 * @param {number} [bytes]
 * @returns {string}
 */
export function generateBootstrapPassphrase(bytes = 32) {
  return randomBytes(bytes).toString("base64");
}

/**
 * @param {string} passphrase
 * @returns {boolean}
 */
export function isValidBootstrapPassphrase(passphrase) {
  return typeof passphrase === "string" && passphrase.length >= MIN_PASSPHRASE_LENGTH;
}
