/**
 * Read the shell body of a named step from a workflow file, for tests that run it.
 *
 * @module test-helpers/workflow-step
 */

/**
 * @param {string} yaml
 * @param {string} stepName
 * @returns {string}
 */
export function workflowStepRun(yaml, stepName) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  if (start === -1) {
    throw new Error(`missing workflow step ${stepName}`);
  }
  for (let i = start + 1; i < lines.length && !lines[i].trim().startsWith("- name:"); i += 1) {
    const m = /^(\s*)run: ?(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (m[2] !== "|") return m[2];
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() !== "" && line.search(/\S/) <= m[1].length) break;
      body.push(line.slice(m[1].length + 2));
    }
    return body.join("\n");
  }
  throw new Error(`workflow step ${stepName} has no run block`);
}
