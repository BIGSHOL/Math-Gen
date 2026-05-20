import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Rewrites resolved paths for Anthropic SDK files that depend on Node
 * built-ins (`node:fs`, `node:child_process`, etc.). The SDK bundles
 * server-only modules like `agent-toolset/fs-util.mjs` through its Beta
 * sessions barrel, and Rollup picks them up even though we never touch
 * Managed Agents from the browser.
 *
 * Why a custom plugin instead of `resolve.alias`?
 * The SDK's internal files import these helpers via *relative* paths
 * (`./fs-util.mjs`, `./skills.mjs`). `resolve.alias` matches the import
 * *string*, not the resolved absolute path — so it never fires for those
 * internal relative imports. `resolveId` runs after Rollup resolves the
 * path, which is where we need to intercept.
 */
/**
 * `stubs` maps from a *filename* (e.g. `fs-util.mjs`) to the stub path.
 * We only redirect when:
 *   1. The importer lives in `@anthropic-ai/sdk/tools/agent-toolset/`, AND
 *   2. The source import ends with the stubbed filename.
 *
 * Matching the importer's *directory* is what disambiguates the
 * agent-toolset's `skills.mjs` from the unrelated `resources/beta/skills/
 * skills.mjs` (the Skills API resource).
 *
 * `source` is the import string as written (often relative like
 * `./fs-util.mjs`), not the resolved absolute path — so we match on it
 * directly without trying to resolve.
 */
const stubBrowserUnsafeAnthropicSdk = (stubs: Record<string, string>) => ({
  name: "stub-anthropic-browser-unsafe-modules",
  enforce: "pre" as const,
  resolveId(source: string, importer: string | undefined) {
    if (!importer) return null;
    const normalized = importer.replace(/\\/g, "/");
    if (!normalized.includes("/@anthropic-ai/sdk/tools/agent-toolset/")) return null;
    for (const [filename, stubPath] of Object.entries(stubs)) {
      if (source.endsWith(filename)) return stubPath;
    }
    return null;
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const stubs = {
    "fs-util.mjs": path.resolve(__dirname, "./src/services/ai/_browser-stubs/fs-util.mjs"),
    "fs-util.js": path.resolve(__dirname, "./src/services/ai/_browser-stubs/fs-util.mjs"),
    "skills.mjs": path.resolve(__dirname, "./src/services/ai/_browser-stubs/agent-toolset-skills.mjs"),
    "skills.js": path.resolve(__dirname, "./src/services/ai/_browser-stubs/agent-toolset-skills.mjs"),
  };
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [stubBrowserUnsafeAnthropicSdk(stubs), react()],
    define: {
      // Anthropic key for client-side SDK (Phase 0.5 migration).
      // NOTE: Exposing this in the client bundle is a *temporary* arrangement
      // — Phase 5 will move all model calls behind a backend proxy. Do not
      // ship a production build with this in place.
      "process.env.ANTHROPIC_API_KEY": JSON.stringify(env.ANTHROPIC_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
        "@app": path.resolve(__dirname, "./src"),
      },
    },
  };
});
