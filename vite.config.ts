import fs from "fs";
import net from "net";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * 빈 TCP port 찾기 — `start` 부터 `max` 까지 순차 검사, 첫 빈 port 반환.
 *
 * **왜 vite 의 자체 fallback 으로 부족한가** (사용자 보고로 확인된 함정 카탈로그):
 *
 *   1. **same-host 충돌 silent** — Windows 의 SO_REUSEADDR 동작상 host:"0.0.0.0"
 *      두 vite 가 같은 port 에 동시 listen 성공해버림. EADDRINUSE 가 안 떠서
 *      vite 의 strictPort 가 fallback 안 함.
 *   2. **IPv4 ↔ IPv6 별개 socket** — 다른 프로젝트가 Next.js `::` (IPv6
 *      dual-stack) 로 3000 점유 중일 때, IPv4 (`0.0.0.0`) 로만 검사하면 충돌
 *      안 잡힘. 반대도 동일.
 *
 * 해결: **IPv4 + IPv6 둘 다 listen 시도** — 둘 중 하나라도 EADDRINUSE 면 port
 * 사용 중으로 간주. attendance-project (Next.js Turbopack) 와 mathg-gen (Vite)
 * 같은 *다른 dev 도구 조합* 에도 안전.
 */
const tryListen = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(port, host);
  });

const findFreePort = async (start: number, max = 30): Promise<number> => {
  for (let p = start; p < start + max; p++) {
    // IPv4 검사. 다른 process 가 0.0.0.0 / 127.0.0.1 으로 listen 중이면 fail.
    if (!(await tryListen(p, "0.0.0.0"))) continue;
    // IPv6 검사. 다른 process 가 :: / ::1 으로 listen 중이면 fail. Next.js
    // Turbopack 가 :: 로 binding 하는 게 대표 케이스.
    if (!(await tryListen(p, "::"))) continue;
    return p;
  }
  // 끝까지 빈 port 못 찾으면 start 반환 — vite 가 자체 fallback 시도하도록.
  return start;
};

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

const SHELL_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_ENABLED",
] as const;

type ShellEnvKey = (typeof SHELL_ENV_KEYS)[number];

/**
 * Read only the keys this Vite config is allowed to consume.
 *
 * Avoid `loadEnv(mode, cwd, "")`: with an empty prefix Vite reads every env
 * var, and `vite --debug` prints the resolved object, including server-only
 * secrets such as service-role keys.
 */
const readAllowedShellEnv = (): Partial<Record<ShellEnvKey, string>> => {
  const picked: Partial<Record<ShellEnvKey, string>> = {};
  for (const key of SHELL_ENV_KEYS) {
    const value = process.env[key];
    if (value) picked[key] = value;
  }
  return picked;
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

export default defineConfig(async ({ command }) => {
  const fileEnv = readEnvLocal();
  const env = readAllowedShellEnv();
  // 3000 부터 검사해 첫 빈 port 사용. 다른 프로젝트가 3000 점유 중이면 자동으로
  // 3001, 3002... 로. dev 명령 출력의 "Local:" URL 이 실제 listen port 와 일치.
  const devPort = await findFreePort(3000);
  // **우선순위**: `env` (loadEnv — shell + Vercel env) 가 *최우선*. `fileEnv`
  // (.env.example placeholder fallback) 는 *마지막 fallback*.
  //
  // 이전엔 fileEnv 가 우선이라 *Vercel build* 시 `.env.example` 의 placeholder
  // URL (`https://XXXXXXXX.supabase.co`) 가 Vercel env 의 진짜 URL 을 덮어쓰는
  // 버그. PLACEHOLDER_RE 가 *대문자 X 형식* 잡지 못해 fileEnv 에 그대로 남음 →
  // 클라이언트 build 에 박힘 → 로그인 시 ERR_NAME_NOT_RESOLVED.
  const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY || fileEnv.ANTHROPIC_API_KEY || "";
  const GEMINI_API_KEY = env.GEMINI_API_KEY || fileEnv.GEMINI_API_KEY || "";
  const OPENAI_API_KEY = env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY || "";
  // Supabase — VITE_ prefix 사용 (vite 컨벤션). dev 단계엔 ENABLED=false 가능
  // (기존 IndexedDB / sessionStorage 만). Phase A 이후 ENABLED=true 로 Cloud sync 활성.
  const SUPABASE_URL = env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || "";
  const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || "";
  const SUPABASE_ENABLED = env.VITE_SUPABASE_ENABLED || fileEnv.VITE_SUPABASE_ENABLED || "false";
  const stubs = {
    "fs-util.mjs": path.resolve(__dirname, "./src/services/ai/_browser-stubs/fs-util.mjs"),
    "fs-util.js": path.resolve(__dirname, "./src/services/ai/_browser-stubs/fs-util.mjs"),
    "skills.mjs": path.resolve(__dirname, "./src/services/ai/_browser-stubs/agent-toolset-skills.mjs"),
    "skills.js": path.resolve(__dirname, "./src/services/ai/_browser-stubs/agent-toolset-skills.mjs"),
  };
  return {
    server: {
      // `findFreePort` 가 사전에 0.0.0.0 binding 으로 점유 검사 → 빈 port 반환.
      // 다른 프로젝트가 (어떤 binding 이든) 3000 점유 중이면 자동으로 3001+.
      // vite 자체 strictPort fallback 은 Windows IPv6 dual-stack 에서 binding
      // 차이 (`::` vs `::1`) 를 못 잡으므로 직접 검사가 필요. 사용자 보고로
      // 확인된 함정.
      port: devPort,
      strictPort: true, // 위에서 이미 빈 port 보장했으므로 strict 로 잠금.
      // LAN 접근 필요 시 (휴대폰 / 다른 PC 에서 같은 wifi 로 확인) 다음 명령:
      //   npm run dev -- --host 0.0.0.0
      host: "localhost",
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
      // AI provider keys — Phase 5a-6: **dev (vercel dev / npm run dev) 에서만**
      // 클라이언트 번들에 inject. production 빌드에서는 *제거* — 모든 AI 호출이
      // `/api/ai-*` Vercel function 경유로 변경 (Phase 5a-5). 키가 client bundle
      // 에 박히는 보안 위험 회피.
      //
      // command === "serve" 가 *dev only* — `command === "build"` (production)
      // 에서는 이 define 자체가 제거되어 client bundle 의 process.env.X 가
      // undefined → src/services/ai/*.ts 의 USE_API=true 분기로 fetch path 사용.
      ...(command === "serve"
        ? {
            "process.env.ANTHROPIC_API_KEY": JSON.stringify(ANTHROPIC_API_KEY),
            "process.env.GEMINI_API_KEY": JSON.stringify(GEMINI_API_KEY),
            "process.env.OPENAI_API_KEY": JSON.stringify(OPENAI_API_KEY),
          }
        : {}),
      // Supabase — Phase A 인프라 마이그레이션. VITE_ prefix 로 client 에서
      // `import.meta.env` 로 접근. ENABLED 가 "true" 일 때만 client 가 활성.
      // anon key 는 *공개 OK* (RLS 가 보호) — production build 도 포함.
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(SUPABASE_ANON_KEY),
      "import.meta.env.VITE_SUPABASE_ENABLED": JSON.stringify(SUPABASE_ENABLED),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
        "@app": path.resolve(__dirname, "./src"),
      },
      // `dedupe` 가 없으면 vite optimizeDeps 가 recharts 처럼 *peerDependency*
      // 로 react 를 받는 라이브러리를 prebundle 할 때 자기 안의 react import 를
      // node_modules/recharts/node_modules/react 같은 nested path 로 resolve
      // 할 위험. 결과: 우리 앱 react 와 *별 인스턴스* → useContext 가 다른 store
      // 를 보며 "Invalid hook call" / "useContext is null" 폭주. `dedupe` 로
      // *우리 앱 root* 의 react 만 사용 강제.
      dedupe: ["react", "react-dom"],
    },
    // recharts 는 dynamic import 안 되는 다중 stats 컴포넌트들이 한꺼번에
    // mount 되므로 *처음부터 prebundle* 안 하면 detail screen 진입 시 vite 가
    // on-demand discovery 트리거 → full page reload + 짧은 invalid hook call 창
    // (CJS interop 미완성 순간). `include` 로 dev 첫 시작에 함께 prebundle.
    optimizeDeps: {
      include: ["recharts", "react", "react-dom", "react/jsx-runtime"],
    },
  };
});
