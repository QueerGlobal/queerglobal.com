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
 * @param {string[]} argv
 * @returns {number}
 */
export function runValidateReleaseTagCli(argv = process.argv.slice(2)) {
  try {
    assertValidReleaseTag(argv[0] ?? "");
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
