/**
 * JSON Schema for the variant-generation call.
 *
 * Variant = 원본 문제의 *숫자·변수만 변경한 유사 문제* (목표 / 난이도 옵션
 * 에 따라 변형 깊이 조절). 답 구조 (객관식 vs 주관식) 는 *반드시 원본과
 * 동일*.
 *
 * **필드 규약**:
 *   - `question`  — 변형된 문제 본문 (Markdown + LaTeX, 보기 *제외*)
 *   - `choices`   — *항상 array*. 객관식이면 정확히 5 개 (원본과 같은 개수),
 *     주관식이면 빈 `[]`. caller 가 `choicesCount` 검증해 mismatch 시 재시도.
 *   - `answer`    — 변형 정답. 객관식이면 `"③ 5"` 형태, 주관식이면 값만.
 *   - `solution`  — 변형 문제의 단계별 풀이 (SOLUTION_SCHEMA 와 동일 규약).
 *   - `topic`     — 단원 (원본 그대로 유지 권장).
 *   - `difficulty`— "하" / "중" / "상" / "최상" 중 하나.
 *   - `diagramSVG`— 도형 변형은 *이번 phase 범위 외*. 항상 null 반환. caller
 *     가 원본 도형 (OCRProblem.images) 을 그대로 사용. VARIANT_PROMPT 에
 *     명시.
 *
 * Anthropic / OpenAI 는 그대로, Gemini 는 `toGeminiSchema()` 변환.
 */
export const VARIANT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    question: {
      type: "string",
      description:
        "Variant problem body in Markdown + LaTeX. Same structure as original (e.g. 발문 + 식). Multiple-choice markers (①②③④⑤) must NOT appear here — put them in `choices` array.",
    },
    choices: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description:
        'Always an array. Empty `[]` for 주관식 problems. For 객관식 problems, MUST contain exactly 5 strings (same count as original; never collapse 5 → 4 or expand 5 → 6).',
    },
    answer: {
      type: "string",
      description:
        'Final answer only. Multiple choice: start with the Korean marker (e.g. "③ 5"). Subjective: bare value only ("5", "$\\frac{4\\pi}{3}$"). Never include "정답은 …" prose.',
    },
    solution: {
      type: "string",
      description:
        "Step-by-step solution for the *variant* problem in Markdown + LaTeX. Same regulations as SOLUTION_SCHEMA — wrap math in $...$ / $$...$$, no trial-and-error traces, HARD CAP per difficulty.",
    },
    topic: {
      type: "string",
      description:
        "Curriculum unit name (e.g. '최대공약수와 최소공배수'). Preserve original topic — variants stay in the SAME unit.",
    },
    difficulty: {
      type: "string",
      enum: ["하", "중", "상", "최상"],
      description:
        "Variant difficulty band. Apply the user-selected DifficultyShift relative to original.",
    },
    diagramSVG: {
      type: ["string", "null"],
      description:
        "DEPRECATED — always null. Diagram regeneration moved to `diagramParams` (vector spec). Keep null for backward-compat.",
    },
    diagramParams: {
      type: ["array", "null"],
      description:
        "Vector diagram specs (Phase E). Each item is an object with `type` discriminator ('triangle'|'circle'|'quadrilateral'|'polygon'|'coordinatePlane'|'solid'|'composite') plus shape-specific fields. See DIAGRAM_PARAMS_GUIDE in prompt for examples. Order matches `[그림1]`, `[그림2]` markers in `question`. Null if original has no diagrams.",
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
  },
  required: ["question", "choices", "answer", "solution", "topic", "difficulty", "diagramSVG"],
} as const;
