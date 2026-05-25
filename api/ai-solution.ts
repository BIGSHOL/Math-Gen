import type { VercelRequest, VercelResponse } from "./_types.js";
import { generateSolution, type SolutionGenInput } from "../src/services/ai/solutions.js";

/**
 * POST /api/ai-solution
 *
 * Phase 5a — 클라이언트의 AI key 노출 제거를 위해 Sonnet 4.6 / Gemini / OpenAI
 * 해설 호출을 *Vercel Function* 으로 옮긴다. 기존 `generateSolution` 본문은
 * `src/services/ai/solutions.ts` 그대로 — Node SDK 인스턴스 (`anthropic`,
 * `getGeminiClient`, `getOpenAIClient`) 가 *서버/브라우저 둘 다* 작동.
 *
 * **Prompt caching 보존**: `cache_control: ephemeral` 마커가 요청 body 에 박혀
 * 보내지므로 *서버에서 호출* 해도 1st write + 2nd-30th read 가 자동.
 *
 * **AbortSignal**: 클라이언트 fetch 의 signal → 서버에서 `req.on("close")` 로
 * 감지 가능. 단 Anthropic SDK 가 *외부 AbortController* 받아야 처리. Vercel
 * function 은 *요청 종료 시* 자동 process termination — abort 자연 발생.
 *
 * **인증**: 현재 phase 는 *anon* 허용 (개발 단계). 사용자 인증 활성화 후
 * Supabase JWT 검증 추가 — `req.headers.authorization` Bearer token → supabase
 * .auth.getUser() 검증.
 *
 * **body**: SolutionGenInput JSON. signal 은 fetch wrapper 가 자동 처리.
 * **response**: SolutionGenResult JSON 또는 { error: string } (4xx/5xx).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  try {
    const input = (req.body ?? {}) as SolutionGenInput;
    if (!input.problem) {
      return res.status(400).json({ error: "problem field required" });
    }
    // signal 은 body 전달 X — fetch 의 자동 처리. 추후 abort 신호는 socket 종료로.
    const result = await generateSolution(input);
    return res.status(200).json(result);
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    // eslint-disable-next-line no-console
    console.error("[api/ai-solution] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
