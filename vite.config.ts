import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Reads `.env.local` directly, returning `{}` if the file is missing.
 *
 * Why this instead of Vite's `loadEnv`: when the parent shell has an env var
 * set to an empty string (e.g. some agent/CI environments export
 * `ANTHROPIC_API_KEY=` to scrub keys before spawning subprocesses), Vite's
 * `loadEnv` merges `process.env` AFTER the dotenv files, so the empty shell
 * value clobbers our `.env.local` value. Reading the file ourselves
 * sidesteps that and gives `.env.local` deterministic priority.
 */
const readEnvLocal = (): Record<string, string> => {
  const file = path.resolve(__dirname, ".env.local");
  if (!fs.existsSync(file)) return {};
  const parsed: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    parsed[k] = v;
  }
  return parsed;
};

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
  const fileEnv = readEnvLocal();
  const env = loadEnv(mode, process.cwd(), "");
  // `.env.local` wins over `loadEnv`'s shell-merged values — see `readEnvLocal`.
  const ANTHROPIC_API_KEY = fileEnv.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || "";
  const GEMINI_API_KEY = fileEnv.GEMINI_API_KEY || env.GEMINI_API_KEY || "";
  const OPENAI_API_KEY = fileEnv.OPENAI_API_KEY || env.OPENAI_API_KEY || "";
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
      "process.env.ANTHROPIC_API_KEY": JSON.stringify(ANTHROPIC_API_KEY),
      // Gemini key — optional, used as a 3rd-pass fallback for figures that
      // even Claude Opus 4.7 fails to render correctly. Leave blank to skip.
      "process.env.GEMINI_API_KEY": JSON.stringify(GEMINI_API_KEY),
      // OpenAI key — optional, enables GPT-5 / 4.1 / 4o / o3 family in the
      // OCR layer and bench. Leave blank to hide GPT options.
      "process.env.OPENAI_API_KEY": JSON.stringify(OPENAI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
        "@app": path.resolve(__dirname, "./src"),
      },
    },
  };
});
