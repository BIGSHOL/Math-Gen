/**
 * Browser stub for `@anthropic-ai/sdk/tools/agent-toolset/fs-util.mjs`.
 *
 * The real module is Node-only (uses `node:fs`, `node:crypto`) and is pulled
 * into the SDK bundle through the Beta sessions barrel imports — even though
 * we never touch sessions/Managed Agents from the browser.
 *
 * We alias the real path to this file in `vite.config.ts`. The exports here
 * cover everything `agent-toolset/node.mjs` (and the events resource) import
 * from `fs-util.mjs`. Calling any of them throws — that's intentional, since
 * file-system tools can't run in a browser regardless of polyfills.
 *
 * If you need real sessions in the browser, route them through a backend
 * proxy (the Phase 5 work) — don't try to "fix" this stub.
 */

export const DIR_CREATE_MODE = 0o755;
export const FILE_CREATE_MODE = 0o644;

const browserUnsupported = (name) => {
  throw new Error(
    `[anthropic-sdk browser stub] '${name}' is not available in the browser. ` +
      `Run agent-toolset / Managed Agents through a server-side proxy.`,
  );
};

export async function canonicalize() {
  browserUnsupported("canonicalize");
}

export async function confineToRoot() {
  browserUnsupported("confineToRoot");
}

export async function atomicWriteFile() {
  browserUnsupported("atomicWriteFile");
}

export function fsErrorMessage() {
  return "Filesystem operations are not supported in the browser build.";
}
