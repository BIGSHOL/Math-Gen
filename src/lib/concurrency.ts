/**
 * Async concurrency primitives — used by the Step 2 OCR orchestrator to
 * keep at most N Anthropic vision calls in flight at once and to retry
 * transient rate-limit errors with exponential backoff.
 *
 * Both helpers are tiny and self-contained — pulling in p-limit/p-retry
 * just for these would be overkill given Vite's strict bundle budget.
 *
 * Patterns adapted from D:\mathlab\src\lib\pdf-extract-engine\ai\extractor.ts
 * (the `withRetry` rule set: 429/529/overloaded only, max 2 retries, 1s→2s→4s).
 */

/**
 * Bounded-concurrency runner. Returns a function that wraps any async
 * thunk; at most `n` thunks execute concurrently — the rest queue.
 *
 *   const limit = pLimit(2);
 *   await Promise.all(items.map((it) => limit(() => fetchIt(it))));
 */
export const pLimit = (n: number) => {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(next);
      };
      if (active < n) run();
      else queue.push(run);
    });
};

/** Heuristic: error message indicates a transient rate-limit / overload? */
const isRetryable = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  return /429|529|503|502|rate|limit|quota|overloaded|temporarily|gateway|timeout/i.test(
    err.message,
  );
};

/**
 * Anthropic SDK error 가 `headers["retry-after"]` 를 노출하면 그 값 (초) 만큼
 * 대기. 없으면 null. 사용자 보고: 30 문항 시험지에 대해 pLimit(3) 가 한 번에
 * 3개씩 발사 → 429 반복 → ERR_ABORTED.
 */
const extractRetryAfterMs = (err: unknown): number | null => {
  if (!err || typeof err !== "object") return null;
  // Anthropic SDK 의 APIError 는 `.headers` 속성을 가짐.
  const headers = (err as { headers?: Record<string, string> }).headers;
  if (!headers) return null;
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (!raw) return null;
  const secs = Number.parseFloat(raw);
  if (!Number.isFinite(secs) || secs <= 0) return null;
  // 안전 cap: 60 초 이상 대기는 사용자 경험상 의미 없음 — UI 가 hang 으로 보임.
  return Math.min(60_000, Math.ceil(secs * 1000));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry an async function on transient errors only. Default: 4 retries with
 * exponential backoff (2 s → 4 s → 8 s → 16 s → 32 s = ~60 s total). Honors
 * `Retry-After` header when provider sends it.
 *
 * Non-retryable errors (e.g. 400 validation, our own throws) propagate
 * immediately so they're not masked by silent retries.
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelay?: number } = {},
): Promise<T> => {
  const maxRetries = opts.maxRetries ?? 4;
  const baseDelay = opts.baseDelay ?? 2000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) break;
      // Retry-After 헤더가 있으면 우선. 없으면 exponential backoff.
      const explicit = extractRetryAfterMs(err);
      const delay = explicit ?? baseDelay * 2 ** attempt;
      await sleep(delay);
    }
  }
  throw lastErr;
};
