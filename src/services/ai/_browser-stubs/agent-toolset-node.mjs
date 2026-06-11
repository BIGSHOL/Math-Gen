/**
 * Browser stub for `@anthropic-ai/sdk/tools/agent-toolset/node.mjs`.
 *
 * The real entry point is explicitly Node-only and imports `node:fs`,
 * `node:child_process`, `node:readline`, and other built-ins. The app never
 * runs Anthropic Managed Agent tools in the browser, so the browser bundle
 * should not drag that implementation in.
 */

const browserUnsupported = (name) => {
  throw new Error(
    `[anthropic-sdk browser stub] '${name}' is not available in the browser. ` +
      `Run agent-toolset / Managed Agents through a server-side proxy.`,
  );
};

export function betaAgentToolset20260401() {
  browserUnsupported("betaAgentToolset20260401");
}

export function resolvePath() {
  browserUnsupported("resolvePath");
}

export class BashSession {
  constructor() {
    browserUnsupported("BashSession");
  }
}

export function betaBashTool() {
  browserUnsupported("betaBashTool");
}

export function betaReadTool() {
  browserUnsupported("betaReadTool");
}

export function betaWriteTool() {
  browserUnsupported("betaWriteTool");
}

export function betaEditTool() {
  browserUnsupported("betaEditTool");
}

export function betaGlobTool() {
  browserUnsupported("betaGlobTool");
}

export function betaGrepTool() {
  browserUnsupported("betaGrepTool");
}

export async function setupSkills() {
  browserUnsupported("setupSkills");
}

export async function resolveSkillVersion() {
  browserUnsupported("resolveSkillVersion");
}

export async function extractSkillArchive() {
  browserUnsupported("extractSkillArchive");
}
