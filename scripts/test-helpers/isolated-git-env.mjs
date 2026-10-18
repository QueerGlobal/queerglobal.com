/**
 * Build an environment for git commands in tests that ignores the caller's own git setup.
 *
 * Global and system config, GIT_* variables (including GIT_CONFIG_COUNT overrides) and
 * signing settings from the machine running the tests are dropped, and a fixed test
 * identity is set, so the tests pass the same way on any machine and never sign.
 *
 * @module test-helpers/isolated-git-env
 */

/**
 * @param {string} home
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {NodeJS.ProcessEnv}
 */
export function isolatedGitEnv(home, base = process.env) {
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const [key, value] of Object.entries(base)) {
    if (!key.startsWith("GIT_")) {
      env[key] = value;
    }
  }
  return {
    ...env,
    HOME: home,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
}
