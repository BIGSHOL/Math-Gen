/**
 * Browser stub for `@anthropic-ai/sdk/tools/agent-toolset/skills.mjs`.
 *
 * The real module uses `node:child_process`, `node:util`, `node:stream` —
 * none of which work in a browser. Bundled because of the SDK barrel
 * imports, never actually executed at runtime in our app. See the README
 * note on `fs-util.mjs` for context.
 */

const browserUnsupported = (name) => {
  throw new Error(
    `[anthropic-sdk browser stub] '${name}' is not available in the browser. ` +
      `Skills setup requires a Node runtime.`,
  );
};

export async function setupSkills() {
  browserUnsupported("setupSkills");
}

export async function resolveSkillVersion() {
  browserUnsupported("resolveSkillVersion");
}

export async function extractSkillArchive() {
  browserUnsupported("extractSkillArchive");
}
