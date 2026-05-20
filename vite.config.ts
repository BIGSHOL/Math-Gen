import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Reads a single dotenv-style file, returning `{}` if missing or empty.
 *
 * Used by `readEnvLocal` below to merge values from `.env.local` and
 * `.env.example` deterministically.
 */
const parseDotenv = (file: string): Record<string, string> => {
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
 * Read user-supplied env vars from disk with deterministic priority.
 *
 * Why this instead of Vite's `loadEnv`: when the parent shell has an env var
 * set to an empty string (e.g. some agent/CI environments export
 * `ANTHROPIC_API_KEY=` to scrub keys before spawning subprocesses), Vite's
 * `loadEnv` merges `process.env` AFTER the dotenv files, so the empty shell
 * value clobbers our file value. Reading the files ourselves sidesteps that.
 *
 * Two sources, in priority order:
 *   1. `.env.local` — canonical Vite convention.
 *   2. `.env.example` — practical fallback. The team treats it as their
 *      working key file (both files are gitignored, so neither leaks).
 *      `.env.local` still wins when both define the same key, but if a key
 *      is only in `.env.example` it gets picked up anyway.
 *
 * The merge is non-destructive: an empty/blank value in `.env.local` does
 * NOT override a real value in `.env.example`, so users can leave optional
 * keys blank in `.env.local` and they'll fall through to `.env.example`.
 */
const readEnvLocal = (): Record<string, string> => {
  const exampleValues = parseDotenv(path.resolve(__dirname, ".env.example"));
  const localValues = parseDotenv(path.resolve(__dirname, ".env.local"));
  // Strip placeholders so `.env.example` lines like
  //   `ANTHROPIC_API_KEY=sk-ant-api03-REPLACE_ME`
  // don't poison real lookups when a contributor pastes only some keys.
  // We match the placeholder *anywhere* in the value (not just the whole
  // string) because the convention is to glue it onto the real key prefix
  // (`sk-…-REPLACE_ME`, `<YOUR_KEY>`, etc.) — a strict `^…$` test misses
  // those. Real API keys have high entropy / many distinct chars, so the
  // false-positive risk for these tokens is essentially zero.
  const PLACEHOLDER_RE = /(REPLACE_ME|YOUR_[A-Z_]+|<[^>]+>|^TODO$)/i;
  for (const key of Object.keys(exampleValues)) {
    const v = exampleValues[key];
    if (!v || PLACEHOLDER_RE.test(v)) delete exampleValues[key];
  }
  for (const key of Object.keys(localValues)) {
    if (!localValues[key]) delete localValues[key];
  }
  return { ...exampleValues, ...localValues };
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
