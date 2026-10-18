/**
 * Bootstrap CLI error reporting (re-exports shared Sentry helper).
 *
 * @module bootstrap-error-report
 */

export {
  createErrorReporter as createBootstrapErrorReporter,
  reportCliFailure,
  runCliWithErrorReport as runBootstrapCli,
  scrubSecrets,
} from "./lib/sentry-report.mjs";
