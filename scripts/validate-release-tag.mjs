import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {string} tag
 * @returns {string}
 */
export function assertValidReleaseTag(tag) {
  if (!tag || typeof tag !== "string") {
    throw new Error("Release tag is required.");
  }
  if (!tag.startsWith("release/")) {
    throw new Error(`Release tag must start with release/: ${JSON.stringify(tag)}`);
  }
  if (/\s|\.\./.test(tag)) {
    throw new Error(`Release tag contains invalid characters: ${JSON.stringify(tag)}`);
  }
  return tag;
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
