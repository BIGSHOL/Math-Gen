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
 * Three sources, in priority order (later wins for the same key):
 *   1. `.env.example` — last-resort fallback. Has placeholder strip applied
 *      so doc lines like `=sk-ant-api03-REPLACE_ME` don't poison lookups.
 *   2. `.env`         — committed/shared baseline values.
 *   3. `.env.local`   — canonical Vite convention; highest priority.
 *
 * All three files are gitignored as of the env-unification commit, so the
 * "which one do I put my keys in?" question is purely ergonomic. Empty
 * values (`KEY=`) are stripped before the merge so a blank line in
 * `.env.local` doesn't accidentally erase a real value sitting in `.env`.
 */
const readEnvLocal = (): Record<string, string> => {
  const exampleValues = parseDotenv(path.resolve(__dirname, ".env.example"));
  const envValues = parseDotenv(path.resolve(__dirname, ".env"));
  const localValues = parseDotenv(path.resolve(__dirname, ".env.local"));

  // Strip placeholders from `.env.example` only — `.env` / `.env.local` are
  // user-authored and any value there is treated as intentional. The match
  // is *substring* (not anchored) because the convention is to glue the
  // placeholder onto a real prefix: `sk-ant-api03-REPLACE_ME`, `<YOUR_KEY>`.
  // Real API keys have enough entropy that false-positive risk is zero.
  const PLACEHOLDER_RE = /(REPLACE_ME|YOUR_[A-Z_]+|<[^>]+>|^TODO$)/i;
  for (const key of Object.keys(exampleValues)) {
    const v = exampleValues[key];
    if (!v || PLACEHOLDER_RE.test(v)) delete exampleValues[key];
  }
  for (const key of Object.keys(envValues)) {
    if (!envValues[key]) delete envValues[key];
  }
  for (const key of Object.keys(localValues)) {
    if (!localValues[key]) delete localValues[key];
  }

  // Object spread merge order = priority order. Later spreads win.
  return { ...exampleValues, ...envValues, ...localValues };
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
      // 3000 이 이미 사용 중이면 자동으로 3001, 3002... 로 fallback.
      // strictPort: true 면 충돌 시 그냥 종료되는데, 우리는 두 번째 인스턴스가
      // 무리 없이 다음 port 로 옮겨가야 한다 (멀티 세션 / 다른 vite 앱과 공존).
      strictPort: false,
      host: "0.0.0.0",
      // HMR (Hot Module Replacement) 는 컴포넌트 변경을 라이브 reload 하지만,
      // 무거운 async 모듈 (usePageOcr 의 worker, IndexedDB 트랜잭션, AbortController)
      // 을 갖고 있는 hook 의 경우 HMR swap 이 좀비 worker 누적 → 메인 스레드 점유 →
      // setTimeout/IndexedDB callback starvation 의 cascade 를 만든다.
      //
      // 사용자 보고: stamp 가 5~6초 간격으로 새로 찍히고 OCR 가 영원히 hang.
      //
      // dev 동안 코드 변경 시 수동 새로고침이 필요하지만, OCR pipeline 안정성을
      // 확보하는 가장 robust 한 선택. Phase 5 에서 worker dispose + hmr lifecycle
      // 정리하면 다시 켤 수 있음.
      hmr: false,
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
