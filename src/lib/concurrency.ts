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
  return /429|529|rate|limit|quota|overloaded|temporarily/i.test(err.message);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry an async function on transient errors only. Default: 2 retries,
 * exponential backoff starting at 1000 ms (so 1 s, 2 s before giving up).
 *
 * Non-retryable errors (e.g. 400 validation, our own throws) propagate
 * immediately so they're not masked by silent retries.
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelay?: number } = {},
): Promise<T> => {
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelay = opts.baseDelay ?? 1000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) break;
      await sleep(baseDelay * 2 ** attempt);
    }
  }
  throw lastErr;
};
