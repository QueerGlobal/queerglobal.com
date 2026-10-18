import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Matches tags created by deploy-production (release/<run>-<full sha>). */
export const RELEASE_TAG_PATTERN = /^release\/[0-9]+-[0-9a-f]{40}$/;

/**
 * @param {string} tag
 * @returns {string}
 */
export function assertValidReleaseTag(tag) {
  if (!tag || typeof tag !== "string") {
    throw new Error("Release tag is required.");
  }
  if (!RELEASE_TAG_PATTERN.test(tag)) {
    throw new Error(
      `Release tag must match ${RELEASE_TAG_PATTERN}: ${JSON.stringify(tag)}`,
    );
  }
  return tag;
}

/**
 * @param {string} tag
 * @returns {string}
 */
export function releaseTagGitRef(tag) {
  return `refs/tags/${assertValidReleaseTag(tag)}`;
}

/**
 * @param {string} tag
 * @returns {string}
 */
export function releaseTagEmbeddedSha(tag) {
  const valid = assertValidReleaseTag(tag);
  const sha = valid.slice(valid.lastIndexOf("-") + 1);
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Release tag embeds an invalid commit sha: ${JSON.stringify(tag)}`);
  }
  return sha;
}

/**
 * @param {{
 *   tag: string,
 *   mainRef?: string,
 *   execGit?: (args: string[]) => string,
 * }} input
 */
export function verifyReleaseTagPointsAtEmbeddedSha(input) {
  const tag = assertValidReleaseTag(input.tag);
  const embedded = releaseTagEmbeddedSha(tag);
  const execGit =
    input.execGit ??
    ((args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const tagCommit = execGit(["rev-parse", `${releaseTagGitRef(tag)}^{commit}`]).trim();
  if (tagCommit !== embedded) {
    throw new Error(
      `Release tag ${JSON.stringify(tag)} points at ${tagCommit} but embeds ${embedded}.`,
    );
  }
  return tagCommit;
}

/**
 * @param {{
 *   tag: string,
 *   mainRef?: string,
 *   execGit?: (args: string[]) => string,
 * }} input
 */
export function verifyReleaseTagIsAncestorOfMain(input) {
  const mainRef = input.mainRef ?? "refs/heads/main";
  const tagCommit = verifyReleaseTagPointsAtEmbeddedSha(input);
  const execGit =
    input.execGit ??
    ((args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  try {
    execGit(["merge-base", "--is-ancestor", tagCommit, mainRef]);
  } catch {
    throw new Error(
      `Release tag commit ${tagCommit} is not an ancestor of ${mainRef}; refusing redeploy.`,
    );
  }
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
export function runValidateReleaseTagCli(argv = process.argv.slice(2)) {
  try {
    const verifyOnMain = argv[0] === "--verify-on-main";
    const tag = verifyOnMain ? (argv[1] ?? "") : (argv[0] ?? "");
    assertValidReleaseTag(tag);
    if (verifyOnMain) {
      verifyReleaseTagIsAncestorOfMain({ tag });
    }
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(thisFile)
) {
  process.exitCode = runValidateReleaseTagCli();
}
