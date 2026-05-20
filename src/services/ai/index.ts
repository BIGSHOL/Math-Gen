/**
 * Public surface of the AI service.
 *
 * App code should import from `@app/services/ai`, not from the individual
 * files — keeps the internal layout swappable when Phase 5 introduces the
 * backend proxy.
 */

export { generateMathProblem } from "./generate";
export { anthropic, DEFAULT_MODEL, OPUS_MODEL } from "./client";
export type { ModelId } from "./client";
