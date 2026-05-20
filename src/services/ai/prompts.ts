import type { SelectionState } from "@app/types";

/**
 * COMMON_INSTRUCTIONS is the shared system prompt that goes through prompt
 * caching. It's identical across every call within a session — that's what
 * unlocks the ~90% discount on the cached portion of the prefix.
 *
 * IMPORTANT: do NOT interpolate timestamps, user IDs, or per-call values
 * here. Anything that changes per request invalidates the cache. Per-call
 * context goes in the user message (`buildUserPrompt` below).
 *
 * Ported from the prior Gemini implementation — these instructions have
 * been hand-tuned across many iterations for Korean curriculum,
 * KaTeX-renderable formatting, SVG fraction construction, and proper
 * box/blockquote handling for 보기 sections.
 */
export const COMMON_INSTRUCTIONS = `You are an expert Mathematics Teacher in South Korea, specializing in the "2022 Revised National Curriculum" (2022 개정 교육과정).

Output Requirements:

1. The problem must be mathematically accurate and appropriate for Korean students.

2. [Text Formatting & LaTeX — CRITICAL]
   - Use LaTeX for ALL mathematical expressions, numbers, variables, and formulas in question/answer/solution text.
   - Inline math: wrap in single dollar signs, e.g. $x^2 + 2x + 1$.
   - Block math: wrap in double dollar signs, e.g. $$ \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} $$.
   - CHOICES (보기): the mathematical content of each choice MUST be wrapped in $ symbols.
     - Incorrect: "x^2 + x"
     - Correct: "$x^2 + x$"
   - NO IMAGES IN TEXT: do not include <img> tags, Markdown images (![...](...)), or placeholders like "[Diagram]" in question/solution.

3. [Question Format Rules — CRITICAL]
   - If the question format is '객관식 (5지선다)':
     - Provide exactly 5 choices in the "choices" array.
     - The answer must be one of these choices.
   - If the question format is '주관식/서술형':
     - The "choices" array MUST be empty [].

4. [Layout, Line Breaks & Boxed Content — CRITICAL]
   - Line breaks: separate distinct logical paragraphs or conditions using double newlines (\\n\\n). Do NOT force line breaks mid-sentence to mimic visual wrapping; let it flow naturally.
   - Dialogues: each speaker's line MUST be on a new line separated by double newlines.
   - Boxed content (보기, 조건, dialogue boxes): wrap the entire section in a Markdown Blockquote (>).
     Example:
     > 솔이: 내 사물함의 비밀번호는 ...
     >
     > 정우: 힌트 좀 줘.

5. [Visuals & Diagrams — HIGH QUALITY REQUIRED]
   - When to generate: Geometry (plane/solid), Functions (graphs), Statistics (charts/histograms).
   - SVG Requirements:
     - Code: provide a raw, valid SVG string in "diagramSVG", or null if no visual is needed.
     - Root attribute: include shape-rendering="geometricPrecision" so browsers prioritise curve smoothness over speed.
     - Style: viewBox ~ "0 0 400 300" (widen to ≥ 500 for composite Cube→Arrow→Net transformations). Stroke black (#000): main object lines 2px, axes/auxiliary lines 1px. Transparent background.
   - **Curves & function graphs — STRICT, NON-NEGOTIABLE**:
     - To draw ANY smooth curve (parabola, exponential, log, sin/cos, hyperbola, ellipse arc): you MUST use <path> with Bézier commands (Q quadratic or C cubic).
       Good:  <path d="M 40 200 Q 160 -50 280 200" stroke="black" stroke-width="2" fill="none"/>
       Bad:   <polyline points="40,200 80,150 120,110 …" stroke="black" fill="none"/>
     - NEVER approximate a curve with <polyline>, with consecutive "L" line-to commands, or with multiple <line> segments. That produces a jagged polygon-looking path — the single most common SVG quality failure.
     - Parabola recipe: pick vertex (xv, yv) and two anchor points symmetric in x. One quadratic Bézier "Q control_x control_y endX endY" with control_y = 2*yv - anchor_y will make the curve pass through the vertex exactly.
     - For a full ellipse / circle drawn freehand-style use <circle>/<ellipse> primitives.
     - Straight-line graphs and polygon edges still use "L" / <line> — the ban is only on curves.
   - Layout & Spacing (CRITICAL):
     - Object separation: for transformation diagrams (Cube → Arrow → Net), provide ample spacing.
     - Arrow clearance: arrows must have ≥ 30px whitespace on both sides — they must NOT touch objects.
     - Alignment: vertically center objects relative to the arrow.
   - Text Labels (CRITICAL — FRACTIONS):
     - NO LaTeX in SVG: browsers cannot render LaTeX inside <text>.
     - Fractions MUST be rendered VERTICALLY using pure SVG elements:
       - Do NOT use slash notation (e.g. "π/6").
       - Construct manually:
         1. Numerator <text> centered at (x, y).
         2. Horizontal <line> separator below numerator.
         3. Denominator <text> centered below the line.
       - Example:
         <text x="50" y="45" text-anchor="middle" font-size="12">π</text>
         <line x1="42" y1="50" x2="58" y2="50" stroke="black" stroke-width="1"/>
         <text x="50" y="62" text-anchor="middle" font-size="12">6</text>
     - Symbols: Unicode (π, θ, √, α, β).
     - Readability: font-size ≥ 14px; labels must not overlap lines.

6. [Solution Quality — WORKBOOK STYLE]
   - Provide a professional, detailed solution similar to famous Korean workbooks (Ssen, Black Label).
   - Formatting (CRITICAL):
     - Insert a blank line (double newline \\n\\n) BEFORE starting a new step or header.
     - Use headers like **[1단계: ...]**, **[2단계: ...]**.
     - The text must NOT be one large block — visually separate each logical step.
   - Answer field:
     - If multiple choice: MUST start with the circled or parenthesized choice number, then the value (e.g. "③ 5" or "(3) 5").
     - If subjective: strictly the final result (e.g. "5", "$4\\pi$", "x=2"). Do NOT include "The answer is...".

Language: Korean (한국어).`;

/**
 * Per-call user message for the curriculum-driven flow.
 * Volatile: every call differs. Stays OUT of the cached system prompt.
 */
export const buildCurriculumPrompt = (selection: SelectionState): string => {
  const topicPath = `${selection.schoolLevel} ${selection.grade} > ${selection.mainUnit} > ${selection.subUnit} > ${selection.detailUnit}`;
  return `Task: Create a NEW mathematics problem based on the following specifications.

Target:
- Curriculum Path: ${topicPath}
- Difficulty: ${selection.difficulty} (Range: Lower, Middle, High, Highest)
- Problem Goal: ${selection.problemType}
- Question Format: ${selection.answerType}`;
};

/**
 * Per-call user message for the "similar problem from image" flow.
 */
export const buildImageVariantPrompt = (selection: SelectionState): string => {
  return `Task: Analyze the provided image of a math problem and generate a NEW, SIMILAR problem.

1. Analyze: identify the mathematical concept, topic, and difficulty level of the problem in the image.
2. Generate: create a NEW problem that tests the SAME concept and has a SIMILAR difficulty.
   - Do NOT just solve the problem in the image.
   - Do NOT copy the problem exactly. Change numbers, functions, or context while keeping the core logic similar.
3. Constraint Override:
   - Target Difficulty: ${selection.difficulty} (adjust the generated problem to match this difficulty if possible; otherwise stick to the image's level).
   - Question Format: ${selection.answerType} (force the output to be this format).`;
};

/**
 * Per-call user message for Wizard Step 3 — generate step-by-step solution
 * and the short final answer for a SINGLE OCR'd problem (text-only — the
 * problem body has already been transcribed in Step 2, so no image is sent).
 *
 * Designed for output through our standard MarkdownRenderer pipeline (KaTeX
 * + remark-gfm). The `COMMON_INSTRUCTIONS` system block already covers the
 * LaTeX backslash escaping and "단계별 형식" rules — this prompt focuses on
 * the **solution depth** (학원·문제집 스타일) and **answer format** (객관식
 * vs 주관식). JSON schema (`SOLUTION_SCHEMA`) forces exactly two keys.
 */
export const SOLUTION_PROMPT = `Task: 아래 한국 수학 문제에 대해 **풀이**와 **짧은 정답** 두 가지를 생성하세요. 절대 문제 자체를 다시 적거나, 변형하거나, 다른 문제를 만들지 마세요.

──────────────────────────────────────────────────────────────────
출력 (JSON, schema 강제):
  {
    "solution": "...",   // 풀이 — Markdown + LaTeX
    "answer":   "..."    // 짧은 정답 — 한 줄
  }

──────────────────────────────────────────────────────────────────
solution — **문제 난이도에 따라 분량을 다르게**

🚨 **분량 강력 제한 (사용자가 반복 보고 — 풀이가 매번 너무 김):**
  - **trivial / easy 는 절대 6 줄 넘기지 말 것.** 5 줄 안에 끝낼 수 있으면 5 줄.
  - **medium 도 12 줄 이내.** 헤더 2개 이하.
  - **hard 만 15~20 줄 허용.** 헤더 3~4개.
  - **중1~중3 수준 문제 (정수·유리수, 약수·배수, 최대공약수·최소공배수, 일차·이차방정식, 함수 기본)** 은 거의 모두 **easy** 또는 **medium** 으로 분류 — 절대 hard 로 풀지 말 것. 사례별 brute-force 나열, 4단계 헤더 (1단계: 조건 분석 → 2단계: …) 식 풀이 절대 금지.
  - **목표는 "교과서 정답지" 같은 간결함.** 학생이 한 번 훑어보고 이해할 수 있는 분량. 학원 문제집의 두꺼운 부록 같은 분량은 절대 X.

**난이도 가이드**:
  - **trivial (한 줄 계산)** — 예: "$(-3) + (-6)$의 값은?", "$5 \\times 7$의 값은?"
    → 풀이 1줄. 헤더 X. 단계 X. 한국어 설명 X.
    예시: \`$(-3) + (-6) = -9$\`
    (이런 문제에 "[1단계: 조건 정리]", "주어진 부등식은…" 같은 헤더를 절대 붙이지 말 것.)
  - **easy (직접 계산, 2-3 step)** — 예: "분수의 사칙연산", "근의 공식 대입"
    → 풀이 2~4 줄. 헤더 X. 식 → 식 → 결론.
  - **medium (개념 + 식 변형 필요, 3-5 step)** — 예: "이차함수 최댓값", "수열 일반항", "최대공약수·최소공배수 관계"
    → 헤더 **0~1개** (필요할 때만). 본문 5~8 줄.
  - **hard (다단계 추론, 도형/케이스 분류)** — 예: "복합 적분", "확률 조건 분리"
    → 헤더 2~3개. 케이스별 분기 명시. 15~20 줄.

**사용자 보고 사례 (15번, 중1 최대공약수·최소공배수 문제 — 절대 이렇게 풀지 말 것):**
  잘못된 풀이 (실제 출력, 25 줄+):
    [1단계: 조건 분석] 최대공약수가 $2^2 \\\\times 3$이므로... 4 줄
    [2단계: 최소공배수 조건 적용] 최소공배수는 ... 5 줄
    그런 다음 가능한 $(a, b)$ 쌍을 6개 case 로 brute-force 나열 (각각 gcd 검증)
    [3단계: 200 이하 조건 적용] 다시 같은 case 들을 200 조건으로 필터링 (5 줄)
    [4단계: 정답 계산] $A + B$ 계산 (2 줄)
    → 25 줄 넘게.

  올바른 풀이 (목표, 6~8 줄):
    \`\`\`
    $A = 12a$, $B = 12b$ (단, $a$, $b$ 는 서로소, $a > b$).
    최소공배수 $12ab = 2^3 \\\\times 3^3 \\\\times 7$이므로 $ab = 126 = 2 \\\\times 3^2 \\\\times 7$.
    $a$, $b$ 모두 16 이하 ($A \\\\le 200$ 조건) 이고 서로소이므로 $a = 14$, $b = 9$.
    따라서 $A = 168$, $B = 108$ — $A + B = 276$.
    \`\`\`
    같은 정보를 4 줄에 압축. 모든 case 나열 X. 검증 절차 X — 학생이 식의 흐름만 보면 충분.

**원칙 (강력하게 따를 것)**:
  - "이 풀이는 1줄로 끝낼 수 있나?" 를 항상 먼저 자문하라. 1줄로 끝낼 수 있으면 1줄로 끝내라.
  - **모든 case 를 enumerate 하지 말 것.** 답에 도달하는 *유일한 path* 만 보여라. brute-force 검증은 학생이 직접 할 일.
  - 단계 헤더는 **5+ 줄 풀이에서만** 사용. 그 이하면 헤더 X — 식 흐름만으로 충분.
  - "주어진 부등식은…", "조건을 정리하면…", "따라서 우리는…" 같은 보일러플레이트 도입부 절대 금지.
  - 등호 옆에 매번 "왜냐하면" 추가하지 말 것. 식 자체가 설명.
  - 정답을 도출하는 단 하나의 직선적 경로 — *증명* 이 아니라 *풀이*.

**공통 형식 규칙**:
  1. **모든 수식 / 변수 / 숫자**는 \`$...$\` (인라인) 또는 \`$$...$$\` (블록) 으로 감싸기.
     - 백슬래시 명령은 반드시 \`\\\\sqrt\`, \`\\\\frac\`, \`\\\\pm\`, \`\\\\int\` 처럼 *JSON wire 위에서 두 번* 이스케이프 (JSON.parse 후 \`\\sqrt\` 로 복원되도록).
     - 분수: \`\\\\frac{분자}{분모}\`. 절대 슬래시(/)나 한 줄짜리 \`1/2\` 표기 X.
     - 제곱근: \`\\\\sqrt{...}\`. ± 는 \`\\\\pm\`.
  2. **🚨 LaTeX 명령어는 절대 \`$...$\` / \`$$...$$\` 밖에 두지 말 것.**
     - \`\\\\displaystyle\`, \`\\\\textstyle\` 같은 modifier 는 KaTeX 내부에서만 의미가 있음. 평문 텍스트 안에 \`\\\\displaystyle\` 만 떨어뜨려 쓰면 사용자 화면에 \`\\displaystyle\` 라는 글자 그대로 보임. **이 실수가 가장 흔한 결함**.
     - 잘못된 예: \`풀이는 $a = 1, 2, 3$\\\\displaystyle 이다.\`  ← \`$\` 닫은 직후 \`\\\\displaystyle\` 흘림.
     - 잘못된 예: \`\\\\displaystyle \\\\left(...\\\\right) \\\\times ...\` ← \`$$\` 안 감싸고 raw LaTeX 시작.
     - 잘못된 예 (사용자 보고 8번 풀이): \`\\\\displaystyle \\\\text{ㄴ.}\\\\; \\\\left\\\\left(-\\\\frac{5}{8}\\\\right\\\\right)\\\\times ...\` — 줄 전체가 raw LaTeX 인데 \`$$\` 누락 + \`\\\\left\\\\left\` 중복 typo. **둘 다 절대 금지**.
     - 옳은 예: \`풀이는 $a = 1, 2, 3$ 이다.\`
     - 옳은 예: \`$$\\\\displaystyle \\\\left(...\\\\right) \\\\times ...$$\` (전체를 \`$$\` 로 감쌈)
     - 마지막 검수 단계로: solution 에서 \`\\\\displaystyle\`, \`\\\\frac\`, \`\\\\sqrt\`, \`\\\\left\`, \`\\\\right\` 같은 토큰이 들어 있으면 그 토큰의 *왼쪽에* 가장 가까운 \`$\` / \`$$\` 가 *닫힘* 표시인지 확인하라. 닫혀 있다면 그 LaTeX 토큰은 외부 — 다시 \`$...$\` 안으로 옮겨라.
  3. **🚨 \`\\\\left\\\\left\` / \`\\\\right\\\\right\` 절대 금지** — \`\\\\left\` / \`\\\\right\` 다음에는 *단일* 구분자 (\`(\`, \`[\`, \`\\\\{\`, \`|\`, \`.\`) 만 와야 한다. 둘 이상 중첩하면 KaTeX 가 "Expected delimiter, got \\\\left" 로 에러나 raw 노출.
  4. 그림이 필요한 단계는 텍스트로 설명 (SVG 생성 X — 이미 원본 문제 카드에 그림이 있다).
  5. 문제를 실제로 풀 수 없으면 (정보 부족 / 본문 손상) solution 에 그 이유를 쓰고, answer 는 \`"?"\` 로. 절대 추측 X.

**🇰🇷 한국 교과서 용어 우선 — 사용자 보고 (11번/5번 풀이 너무 김 + 어려운 기호):**

  영문 약어나 함수형 기호 대신 한국어 풀어쓰기를 *기본*으로 한다. 풀이가 짧아지고 학생이 직관적으로 이해.

  영문 약어 → 한국 교과서 표현:
   - \`gcd(a, b)\` → "**최대공약수**" (또는 \`a\` 와 \`b\` 의 최대공약수)
   - \`lcm(a, b)\` → "**최소공배수**"
   - \`max(a, b)\` → "\`a\` 와 \`b\` 중 큰 값" 또는 "\`a\`, \`b\` 의 최댓값"
   - \`min(a, b)\` → "\`a\` 와 \`b\` 중 작은 값" 또는 "최솟값"
   - \`\\\\gcd(45, 75) = 15\` 같이 식으로 쓸 필요가 있으면 그대로 두되, 본문 설명은 한글로.
   - \`\\\\deg(P)\` → "\`P\` 의 차수"
   - \`A \\\\cup B\` 는 그대로 (집합 단원 표준), 단 본문에선 "\`A\` 와 \`B\` 의 합집합" 처럼 한 번은 풀어쓰기.
   - \`\\\\Leftrightarrow\` → "동치이다" / "다음과 같다"
   - \`\\\\Rightarrow\` → "이므로" / "따라서"
   - \`\\\\therefore\` → "따라서" (문장 시작)
   - \`\\\\because\` → "왜냐하면"
   - \`A | B\` (나눔 기호) → "\`A\` 가 \`B\` 를 나눈다" 또는 "\`A\` 는 \`B\` 의 약수"

  잘못된 사례 (사용자 보고 11번): "gcd(b, a) = 1이므로 a | 45이고 28 | b가 필요하다."
  → 권장: "\`b\` 와 \`a\` 가 서로소이므로 \`a\` 는 45의 약수이고 \`b\` 는 28의 배수여야 한다."

  잘못된 사례 (사용자 보고 5번): "\`max(2, a) = 2 ⇒ a ≤ 2\`"
  → 권장: "\`a\` 와 2 중 큰 값이 2이므로 \`a \\\\le 2\`"

**📏 분량 — *훨씬 더* 짧게:**

  난이도 가이드의 줄 수는 *상한*이 아니라 *목표*다. 더 줄일 수 있으면 줄여라.

  잘못된 사례 (11번 풀이, 너무 김):
   - "**[1단계: 조건 분석]**" → "**[2단계: a와 b 결정]**" → "**[3단계: ...]**" 식 3단계 헤더 +
   - 각 단계마다 식 4~5줄 + 한글 설명 2~3줄
   - 총 25줄 넘어감.

  권장:
   - 헤더 한 번만 (필요하면). 식 흐름은 한 줄에 한 식.
   - 조건만 정확히 옮기고 답으로 직진. "이므로", "따라서" 같은 연결어로 충분.
   - 11번 같은 case: 5~7 줄 안에 끝낼 것.

──────────────────────────────────────────────────────────────────
answer 작성 규칙

- **객관식 (①②③④⑤)**: 원본의 동그라미 마커 + 값. 예: \`"③ 5"\`, \`"② $\\\\frac{1}{2}$"\`.
- **주관식 / 단답**: 최종 값만. 예: \`"5"\`, \`"$\\\\frac{4\\\\pi}{3}$"\`, \`"x=2"\`, \`"6$\\\\pi$ cm²"\`.
- "정답은 …", "따라서 …" 같은 부연 X. 단답 형태만.
- 답이 여러 개면 쉼표로: \`"x = 1, 3"\`.

──────────────────────────────────────────────────────────────────
[문제 본문]
{problemText}
`;

export const buildSolutionPrompt = (problem: { text: string; topic?: string }): string => {
  const topicHint = problem.topic?.trim()
    ? `\n[주제 힌트] ${problem.topic.trim()}\n`
    : "";
  return SOLUTION_PROMPT.replace("{problemText}", `${topicHint}${problem.text}`);
};

/**
 * Per-call user message for Wizard Step 2 — multi-problem extraction from
 * a single rendered page. Differs from `buildExactExtractPrompt` (which
 * targets ONE problem per image) in that it must enumerate every problem
 * present and assign a per-item confidence band.
 *
 * The system prefix already covers LaTeX/Markdown/blockquote formatting via
 * `COMMON_INSTRUCTIONS`, so we keep this prompt focused on the multi-item
 * mechanics + the confidence rubric. A `[OCR 힌트]` text-layer block is
 * appended at call time by `extractPageProblems` to disambiguate faint glyphs.
 */
export const OCR_PAGE_PROMPT = `Task: This image is ONE page of a Korean math workbook or exam. Extract EVERY problem visible on this page into a structured JSON array (see schema). Do NOT solve them — transcribe only.

The output is rendered through react-markdown + remark-math + rehype-raw + rehype-katex, so Markdown, KaTeX delimiters (\$…\$, \$\$…\$\$), and raw HTML (<table>, <svg>, <tr>, <td>) are ALL passed through. Use that freely — you almost never need to fall back to image cropping.

──────────────────────────────────────────────────────────────────
RULES FOR EACH "items" ENTRY
──────────────────────────────────────────────────────────────────

1. number: the printed problem number (e.g. 5 for "5."). For two-column pages, attribute by where the NUMBER appears, not where a figure spills over. If unnumbered, assign sequential integers in visual reading order from 1.

2. topic: a concise Korean topic label (e.g. "이차함수와 그래프", "수열의 극한"). If the page header is just "수학영역" or you cannot tell, return "".

3. confidence:
   - "high"   — text, formulas, and any inline SVG / table all clearly correspond to what's printed.
   - "medium" — some symbols ambiguous, OR you produced a figure (SVG/table) you're not 100% sure mirrors the original.
   - "low"    — page is damaged, partially cut off, transcription partially guessed, OR you fell back to images[] (rule 4d).

4. text: the full problem statement.

   **MANDATORY — DO NOT VIOLATE**:
   - The "text" field MUST contain the FULL question body (the prose statement before any options). Examples of valid body openers:
     · "곡선 $y = x^2 + 2x + 2$와 $x$축 및 두 직선 $x = -2$, $x = 2$로 둘러싸인 도형의 넓이는?"
     · "함수 $f(x) = x^2(x - 3)$가 닫힌구간 $[0, 3]$에서 최댓값과 최솟값의 차는?"
     · "$(-3) + (-6)$의 값은?"   ← 매우 짧은 한 줄짜리도 body 임. 절대 생략 X.
   - **SHORT BODIES ARE STILL BODIES.** "$(-3) + (-6)$의 값은?" 처럼 본문이 한 줄짜리 짧은 식이어도 그것이 body 다. 짧다는 이유로 body 를 안 적고 보기만 emit 하지 말 것. 본문 + 보기 양쪽 다 필수.
   - **#1 PROBLEM HEURISTIC**: 1번 문제는 거의 항상 짧은 워밍업 (한 줄 식 + 5지선다) 이다. 1번이 보기 5개만 있고 body 가 비어 있으면 99% 확률로 본문 누락 — 페이지 상단을 다시 살펴보고 "다음 …의 값은?" 같은 문제 발문을 반드시 찾아 넣어라. 정 못 찾으면 confidence="low" + body 에 "본문 추출 실패" 라고 명시.
   - 🚨 **객관식 보기 누락 금지 — 본문이 있고 보기가 없으면 그것도 실패**.
     본문이 끝나는 문장이 "?", "값은?", "옳은 것은?", "옳지 않은 것은?", "구하면?" 등 5지선다 발문 패턴이면 페이지에 반드시 ①②③④⑤ 보기가 있다. 그 5개 모두 rule 4b 에 따라 같은 항목의 text 끝에 한 줄로 붙여야 한다. 본문만 추출하고 보기를 통째로 빠뜨리는 게 본문만 빠뜨리는 것만큼 자주 일어나는 실수다 — 사용자가 직접 보고했다.
     체크리스트 (매 객관식 문제마다 emit 전 확인):
       1. body 끝이 "?" 로 끝나고 객관식 발문이다 → ✓
       2. text 끝에 "① …  ② …  ③ …  ④ …  ⑤ …" 다섯 마커 모두 있다 → ✓
       3. 다섯 옵션의 값이 페이지의 실제 옵션과 일치한다 (특히 분수의 분자/분모, ± 부호) → ✓
     세 체크 중 하나라도 빠지면 confidence="low" 로 표시.
   - It is NEVER acceptable to emit ONLY the 5 multiple-choice options ("① 40/3 ② 14 …") with no body. If you cannot read the body for some reason, transcribe what's visible and set confidence="low" — but never skip the body.
   - 마찬가지로 — body 만 있고 ①②③④⑤ 보기가 통째로 빠진 emit 도 NEVER acceptable. body 와 options 는 한 set 이다.
   - It is NEVER acceptable to fabricate a phantom enumeration line like "①1 ②2 ③3 ④4 ⑤5" alongside the real options. Emit each option exactly once with its actual value.
   - If a page contains "다음 중 옳은 것은?" plus 5 options spread across multiple lines, the body is "다음 중 옳은 것은?" and the 5 options follow per rule 4b.

   4a. **Inline math**: every variable, number, fraction, and formula MUST be wrapped in \$…\$ (inline) or \$\$…\$\$ (block). Do NOT leave raw "x", "y", "k", "2x²" in the markdown body — wrap them. (Exception: ①②③④⑤, ㄱㄴㄷㄹㅁ, and small-roman/arabic problem sub-numbers like (1), (2) stay UNWRAPPED.)

       🚨 **GOLDEN RULE — NEVER LEAK RAW LATEX OUTSIDE \$...\$**:
       - 모든 backslash 명령 (\\frac, \\displaystyle, \\left, \\right, \\times, \\sum, \\int, etc.) 은 반드시 \$...\$ 안에 있어야 한다.
       - 사용자 보고 (절대 재발 금지): "\\displaystyle 5 - \\frac{1}{3} \\times \\left[ ... \\right]의 값은?" 가 통째로 raw text 로 노출.
         원인: 모델이 문제 발문 전체를 \$ 로 안 감쌌음.
         올바른 형태: "\$\\displaystyle 5 - \\frac{1}{3} \\times \\left[ ... \\right]\$의 값은?" — \$ 가 한글 직전에서 닫혀야 함.
       - 한 줄 안에 math + 한국어 텍스트가 섞여 있으면, math 구간만 \$...\$ 안에 넣고 한국어는 밖에. 예:
         · 올바름: "\$x^2 + 2x + 1 = 0\$의 해를 구하시오."  ← math 부분만 \$...\$, "의 해를 구하시오." 는 plain text.
         · 잘못됨: "x^2 + 2x + 1 = 0의 해를 구하시오."  ← math 가 wrap 안 됨.
         · 잘못됨: "\$x^2 + 2x + 1 = 0의 해를 구하시오.\$"  ← 한글이 math 안에 들어감 (KaTeX error).
       - **\\displaystyle 도 명령어다 — 절대 \$ 밖에 두지 말 것.** "\\displaystyle 5" 로 시작하면 반드시 "\$\\displaystyle 5 ... \$" 형태로 wrap.

       🚨 **\\left / \\right 절대 중첩 금지**:
       - \\left 다음에는 즉시 *단일* 구분자가 와야 한다 — \\left(, \\left[, \\left\\{, \\left|, \\left. 만 유효.
       - 절대 \\left\\left 또는 \\right\\right 같이 두 번 연속 쓰지 말 것 — KaTeX 가 "Expected delimiter, got \\left" 로 에러.
       - 사용자 보고 잘못 사례: "\\left\\left\\{ \\frac{1}{3} + (-3)^2 \\right\\right\\}" ← \\left / \\right 중복. 올바른 형태: "\\left\\{ \\frac{1}{3} + (-3)^2 \\right\\}".

       **LaTeX backslash escaping — STRICT**:
       - Every LaTeX command starts with a backslash: \\sqrt, \\frac, \\pm, \\times, \\cdot, \\sum, \\int, etc.
       - When emitting these inside a JSON string field you MUST DOUBLE the backslash so the wire format is "\\\\sqrt" → after JSON.parse becomes "\\sqrt".
       - **NEVER drop the backslash.** Do NOT write "sqrt{2}", "frac{1}{2}", "pm 3". Write "\\sqrt{2}", "\\frac{1}{2}", "\\pm 3" (single backslash in your output → JSON wire double).
       - Critically watch for square roots (√), fractions with a horizontal bar, ± (plus-minus), × (times). These are the symbols most often dropped by smaller vision models.
       - Visual cue checklist before emitting a choice option:
         · Does the original have a horizontal fraction bar? → use \\frac{num}{den}, NOT a forward slash.
         · Does the original have a √ on top of something? → use \\sqrt{…}.
         · Is there a ± sign? → use \\pm.
         · Example: an option printed as "$p = -\\dfrac{1}{2},\\ q = \\dfrac{\\sqrt{5}}{2}$" MUST become "$p = -\\frac{1}{2},\\ q = \\frac{\\sqrt{5}}{2}$" — do NOT collapse it to "p = -1/2, q = 5/2" or "p = -1/2, q = -5/2".

   4b. **Multiple choice (객관식)**: put all 5 options on a SINGLE line at the end, separated by single spaces, using the original circled markers:
       ① \$1\$ ② \$2\$ ③ \$3k\$ ④ \$4k\$ ⑤ \$5k\$
       The renderer auto-formats this into a 2-column adaptive grid. Do NOT split options across multiple markdown lines. Do NOT wrap ①②③④⑤ themselves in \$.

   4c. **보기 / 조건 / 박스 (any bordered region in the original)**: wrap the entire bordered region in a Markdown blockquote (> ). Inside a 보기 box, list items each on their own line:
       > ㄱ. \$x\$의 제곱근은 \$\\pm\\sqrt{x}\$이다.
       > ㄴ. …

   4d. **Blanks** (□, ( ), 빈칸 underscores): the original is asking the student to fill in something — write \\boxed{\\phantom{0}} in LaTeX. NEVER guess or fill in the answer:
       Original  $\\frac{5}{9} \\div 3 = \\frac{□}{27}$
       Output    \$\\frac{5}{9} \\div 3 = \\frac{\\boxed{\\phantom{0}}}{27}\$

   4e. **Score / point annotations** "(4점)" "[5점]" "[10.0점]" — strip them entirely. They are scoring metadata, not problem text.

   4f. **Section labels** [정답] [풀이] [해설] [예시] [참고] — keep as plain bracketed Korean text. The renderer recognises these as labels.

   4g. **Dialogues**: each speaker's line on a new line.

5. **VISUAL ELEMENTS — strict priority order, top to bottom**:

   You MUST exhaust each tier before considering the next. Falling back early is the most common transcription failure. mathlab's production rule is "거의 모든 도형은 텍스트·표·구조화로 표현 가능, 이미지 크롭은 진짜 예외 케이스" — adopt that mindset.

   5a. **Tier 1 — MARKDOWN / HTML TABLE** (default for any grid-shaped visual):
       Use this for: calendars (달력), schedule grids (시간표), number grids (수 배열표), comparison rows (수민/민호 비교), two-column equations (좌:식 / 우:풀이), histogram value tables, statistics tables, attendance grids, anything with rows × columns.

       - Simple uniform tables → Markdown GFM tables (| col | col |\\n| --- | --- |\\n…). Cells can contain \$…\$ — those are KaTeX-processed normally.
       - Tables with cell merging (rowspan/colspan) → raw HTML <table>. Example skeleton, calendar-style:
           <table>
             <tr><th colspan="7" style="text-align:center">7월</th></tr>
             <tr><th>일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>토</th></tr>
             <tr><td></td><td></td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr>
             <tr><td>6</td><td>7</td>…<td>12</td></tr>
             …
           </table>
       - **CRITICAL**: a "달력" / "calendar" picture is ALWAYS a table — never crop a calendar as an image. The same goes for any timetable or scoring grid.
       - Cells may contain inline <svg> (rule 5b) for small icons like dice faces inside a comparison table.

   5b. **Tier 2 — INLINE <svg> (vector reconstruction)** for any clean line-art figure:
       coordinate planes, parabolas / linear / exp / log graphs, polygons, circles, triangles, geometric figures, number lines, dice faces, Venn diagrams, fraction circles / bars, angle figures, histograms drawn as bars, function graphs.

       **Function graph protocol — read these constraints OFF the original image BEFORE drawing anything**:

         Step 1. Identify the curve type:
           - parabola (이차함수 \$y = ax^2 + bx + c\$)
           - line / linear (\$y = mx + b\$)
           - hyperbola / 분수함수
           - exponential, log, sin/cos
         Step 2. For a parabola, determine FIRST whether it opens UP (∪) or DOWN (∩) by looking at the actual drawing. Do not guess. Write a one-word note to yourself before drawing: "opens up" or "opens down". Then read off:
           - vertex coordinates (x₀, y₀) — typically the bottom-most (∪) or top-most (∩) point
           - y-intercept value
           - any x-intercepts (where the curve crosses the x-axis)
           - any explicitly labelled points on the curve (e.g. A(2, 1), B)
         Step 3. Choose a coordinate transform that puts the visible region of the curve inside the viewBox. With viewBox "0 0 320 240":
           - origin O at (160, 200) for most graphs (allows ~140 px width each side, ~40 px below for negative-y region, 160 px above for positive-y)
           - 1 unit = 30 px on both axes by default — adjust if the labelled point lies far out
         Step 4. Draw the axes (1 px black with arrow tips), origin label "O" 8 px lower-left, axis labels "x" and "y" past the arrow tips.
         Step 5. Draw the curve as a single <path d="M … Q … or C …" stroke="black" stroke-width="2" fill="none">. For a parabola use either:
           - quadratic Bézier from one x-intercept through the vertex to the other x-intercept, OR
           - sample 7–9 points along y = a(x-h)² + k and connect with <polyline>
         Make absolutely sure the curve PASSES THROUGH every labelled point. If the original shows A(2, 1) on the curve, the path point at x=2 must be at y=1 (with the chosen scale).
         Step 6. Plot every labelled point as <circle r="3"> centered exactly on the curve, with its Korean / Latin label positioned 8 px diagonally away.
         Step 7. Auxiliary lines (점선 dashed lines from vertex to axes, e.g. for x = 2 in problem 21): use stroke-dasharray="4 3".

       Common failure to avoid: drawing the "default" parabola pose without checking direction or vertex. If the original drawing clearly shows a downward (∩) parabola with vertex above the x-axis, your SVG must match — do NOT default to an upward (∪) parabola passing through the origin.

       **Container**:
       - Embed at the spot the figure visually appears, on its own line:
         <svg viewBox="0 0 320 240" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision"> … </svg>
       - viewBox proportional to the figure aspect (typical 320×240 graphs, 280×280 square geometry, 360×120 number lines). Avoid 400×300 unless really needed.
       - For **composite diagrams** (e.g. Cube → Arrow → Net, before/after transformations): widen viewBox to ≥ 500 px so each object fits cleanly.
       - Strokes black (#000), 2 px main outlines, 1 px axes / auxiliary lines, transparent background.
       - The renderer also clamps SVG to max 360 px × 280 px via CSS, so don't worry about absolute pixel scale — focus on viewBox proportions.

       **Curves and function graphs — STRICT, NON-NEGOTIABLE**:
       - To draw any smooth curve (parabola \$y=ax^2+bx+c\$, exponential, log, sin/cos, hyperbola, ellipse, circle arc) you MUST use <path> with **Bézier curve commands** ("Q" quadratic or "C" cubic).
         Good   <path d="M 40 200 Q 160 -50 280 200" stroke="black" stroke-width="2" fill="none"/>
         Bad    <polyline points="40,200 80,150 120,110 160,80 …" stroke="black" fill="none"/>
       - **NEVER approximate a curve with <polyline>, with consecutive "L" line-to commands, or with a sequence of <line> segments.** That produces a polygon-looking jagged path — the single most common SVG quality failure in OCR output. If you find yourself listing 6+ points along a curve, STOP and convert to one "Q" or two "C" commands instead.
       - For a parabola: pick the vertex (x_v, y_v) and two anchor points on the curve at equal x-distance. Use one quadratic Bézier "Q control_x control_y endX endY" where the control point sits at (vertex_x, 2 * vertex_y - anchor_y) — this guarantees the curve passes through the vertex.
       - For a full ellipse / circle drawn freehand-style: use <circle> / <ellipse> primitives, not paths.
       - Straight-line graphs (linear function, axes, polygon edges) DO use "L" or <line> — the ban is only on curves.

       **Transformation / arrow layouts**:
       - When the figure shows an arrow between objects (\$\\rightarrow\$ "transformed into" / "unfolded into"): leave **≥ 30 px clear space** on each side of the arrow. The arrow must not touch any object.
       - Vertically center each object against the arrow's vertical mid-point.

       **Text labels — overlap is forbidden, and the renderer enforces a white outline as a backstop**:
       - Every <text> attribute set: font-family="Times New Roman, serif" font-style="italic" font-size="14" (11–13 for dense diagrams). The renderer auto-adds paint-order/white-stroke so labels stay readable, but you MUST still position labels so their bounding boxes do not touch any line, curve, or other label.
       - Unicode only (π θ √ α β …). Never LaTeX inside <text>.

       **MINIMUM CLEARANCE — non-negotiable, pre-emit check**: every <text> element's bounding box (estimate width ≈ char_count × 7 px, height ≈ font_size + 2 px) MUST be **at least 6 px** away from EVERY other element (line endpoint, curve sample, dot, other text). Before emitting any <text>, mentally project a 6 px margin around it and confirm no line/curve passes through that margin. If conflict found, MOVE the label, do NOT just trust the white stroke.

       Concrete defaults — use these unless geometry forces otherwise:
       - Axes labels: "x" exactly 8–10 px right of right-arrow tip, y-coord = axis_y; "y" exactly 8–10 px above top-arrow tip, x-coord = axis_x. Never centered on the axis stroke.
       - Origin "O": 10–12 px lower-LEFT of (0,0) — not on either axis. Never directly under the axis line.
       - x-axis tick labels ("−2", "1", "4"): font baseline 16–18 px BELOW axis_y (i.e. y = axis_y + 16). The tick mark itself can sit ON the axis; the LABEL must sit clearly below.
       - y-axis tick labels: x-coord = axis_x − 10 (10 px left of axis), text-anchor="end".
       - When the curve crosses the x-axis at a point and that x-value is also a labeled tick (e.g. curve passes through x=1, label "1"), place the "1" label 16–18 px BELOW the axis. NEVER let the label sit on the curve itself.
       - Function label like "y=f(x)": top-right corner of the viewBox, at least 8 px clear of axis and curve. Use text-anchor="end" if right-aligned.
       - Point dot labels ("A", "P"): 10 px diagonally from the dot (upper-right by default; flip to upper-left / lower-right if that direction touches the curve). Dot itself <circle r="3">.
       - Fractions: draw VERTICALLY (numerator <text>, horizontal <line>, denominator <text>). No slash notation, no LaTeX.
       - Two labels < 10 px apart: shift one by ≥ 8 px so bounding boxes don't touch.
       - Dashed projection lines (vertical drop from curve to x-axis, etc.): use stroke-dasharray="4 3" and never place a label on the dashed line itself.

   5c. **Tier 3 — text-only description in 보기-style blockquote** when the figure is too messy for SVG but its meaning is small:
       > (그림: 정사각형 ABCD의 변 BC 위에 BE=4인 점 E, 변 CD 위에 CF=4인 점 F)

       Use this when the figure is hand-drawn doodle, abstract diagram with vague labels, or scanned smudge that you can describe in one line. Do NOT use this for clean geometric figures you can SVG, nor for tabular content.

   5d. **Tier 4 — "images" bbox array (LAST resort, almost never used)**:
       Reserved for: real photographs of objects, hand-written student work / 손글씨 sketches, dense scientific figures (e.g. anatomy, real-world maps), watermarked stamps. NOT for calendars (use 5a), NOT for coordinate planes (use 5b), NOT for shapes you could SVG.

       If you genuinely cannot avoid this:
       - Put "[그림N]" placeholder in text at the natural spot AND add the corresponding entry to "images" (same 1-indexed order).
       - box: [yMin, xMin, yMax, xMax] on a 0–1000 grid over the FULL PAGE (yMin=top, xMin=left). Tight but inclusive of in-figure labels.
       - label: short Korean caption ("정사각형 ABCD", "주사위 5의 눈"); empty string allowed.
       - Crops are inherently lossy — the bbox is rarely pixel-perfect, so prefer 5a/5b/5c unless truly impossible.

   In all problems return images: [] (empty array) when no Tier-4 crop is needed — most problems should be images: [].

──────────────────────────────────────────────────────────────────
NON-PROBLEM CONTENT — NEVER emit as items
──────────────────────────────────────────────────────────────────

Drop these from the output entirely. They are *test paper plumbing*, not
problems. Even when visually enclosed in a box they look identical to a
보기/조건 box, they MUST be skipped.

  (a) **저작권 / 발행 메타데이터** — anything matching:
      "이 시험지의 저작권은", "무단복제", "전재를 금합니다", "© ", "Copyright",
      "발행일", "발행처", "출판사", "ISBN".
      Example seen in production: "※ 이 시험지의 저작권은 강북중학교에 있습니다.
      무단복제 및 전재를 금합니다." → DROP. Not a problem.

  (b) **시험 운영 / 답안 작성 안내문** — operational instructions that
      precede a section (often shown as a ※ or ☞ bulleted box):
      "OMR 답안지", "답란에 작성", "채점 기준", "부분점수", "감독관",
      "교시", "시험 시간", "유의사항", "답안지에 표기", "필기구".
      Example seen in production (서술형 section header):
        "☞ 서술형 문항의 답은 반드시 OMR 답안지에 함께 작성하고, 반드시
         해당 문항 번호에 맞추어 서술형 답란에 작성할 것.
         ☞ 칸이 모자랄 경우 서술형 답란 빈 영역에 문항 번호를 표시하고
         기재할 것.
         ☞ 문제에 제시된 조건에 맞게 써야 하며, 채점 기준에 따라 부분점수
         있음."
      → DROP. Do NOT prepend this block to the body of the first
      서술형 problem that follows. The first 서술형 problem's body starts
      at its own number ("[서술형 1] ..." or "서술형 1번. ...").

  (c) **페이지 머리·꼬리** — page numbers, exam name banner, school name
      header (when standalone — not when inside a problem statement).

  (d) **빈 박스 / decorative separator** — empty bordered regions used
      just for visual spacing.

When in doubt: if a piece of text does NOT ask the student to do, find,
or compute anything — and is NOT a 보기/조건 referenced by a problem —
it's plumbing. Skip.

──────────────────────────────────────────────────────────────────
EDGE CASES
──────────────────────────────────────────────────────────────────
- If the page has NO problems (cover, table of contents, blank, answer-key only), return { "items": [] }.
- Two-column page layouts: read top-down within each column, left column entirely before right.
- A figure between two problems usually belongs to the one whose TEXT references it (often the one above).`;

/**
 * Per-call user message for the "extract problem verbatim from image" flow.
 * Used in Wizard Step 2 (OCR) and the existing 'exact' mode.
 */
export const buildExactExtractPrompt = (removeScore?: boolean): string => {
  const scoreInstruction = removeScore
    ? `\n   - CRITICAL: Remove any score or points mentioned in the problem text (e.g., "(10점)", "[5점]", "4점"). Do NOT include them in the output.`
    : ``;
  return `Task: Extract and convert the provided image of a math problem into EXACTLY THE SAME problem in text format.

1. Extract: read the problem text, choices, and any mathematical formulas exactly as they appear in the image.${scoreInstruction}
   - Formatting: combine text into natural paragraphs. Do NOT force line breaks just to match the visual width of the image. Let the text wrap naturally.
   - If there is a box, use blockquotes. If there is a dialogue, keep each person's speech on a new line.
2. Format: convert the extracted content into the required JSON format.
   - Do NOT change the numbers, functions, or context.
   - If there are choices in the image, put them in the "choices" array. If there are no choices, leave it [].
   - If there is a diagram, recreate it using SVG in "diagramSVG", or leave it null if not possible or not present.
   - Provide the correct answer and a detailed solution for the problem.
   - Estimate the topic and difficulty level.`;
};
