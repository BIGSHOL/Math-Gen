# CLAUDE.md — mathg-gen 작업 지침서 (반복 실수 방지)

이 문서는 mathg-gen 프로젝트에서 *실제로 부딪힌 함정과 해결책*을 모은 것이다.
같은 실수를 두 번 하지 않기 위해, 새 작업 시작 전 관련 섹션을 반드시 읽고
들어갈 것. 가설로 작성한 best practice 가 아니라, **현장에서 사용자 보고로
확인된 진짜 함정만** 기록한다.

---

## 1. AI / OCR 호출 함정

### 1-1. Anthropic SDK 의 `max_tokens > ~21k` 는 streaming 강제

`max_tokens` 가 모델별 threshold (~21333 토큰) 를 넘으면 `messages.create()`
가 **즉시 throw** — "Streaming is required for operations that may take longer
than 10 minutes." SDK 의 하드 체크.

**해결책**: `anthropic.messages.stream(...).finalMessage()` 사용. 반환
shape 은 non-streaming 과 100% 동일하므로 후처리는 그대로.

```ts
const stream = anthropic.messages.stream({ model, max_tokens: 64000, ... });
const response = await stream.finalMessage();
// `response` 는 messages.create 반환과 같은 shape
```

**참고**: `src/services/ai/ocr.ts` `callAnthropic`.

### 1-2. Gemini 의 `maxOutputTokens` 한도 도달은 invalid JSON 으로만 보임

Gemini 응답이 한도에 막혀 잘리면 `response.text` 가 **불완전한 JSON** 으로
오고, `JSON.parse` 가 "Unexpected end of JSON input" 만 throw — 사용자는
무엇이 잘못됐는지 모름.

**해결책**: parse 전에 `response.candidates[0].finishReason === "MAX_TOKENS"`
체크 → 명확한 한국어 에러로 변환.

```ts
const finishReason = (response as { candidates?: Array<{ finishReason?: string }> })
  .candidates?.[0]?.finishReason;
if (finishReason === "MAX_TOKENS") {
  throw new Error(`${model} 응답이 출력 토큰 한도(${MAX})에 막혀 잘렸습니다...`);
}
```

**참고**: `src/services/ai/ocr.ts` `callGemini`, `parseJsonOrThrow`.

### 1-3. OpenAI Responses API (`gpt-5.5-pro`) 는 `output_text` 가 빈 경우 있음

reasoning 모델은 내부 thinking 에 토큰을 다 써버리면 visible message 를
하나도 못 emit. `response.output_text` 가 `""` 인데도 status 는 success.

**해결책**:
1. `reasoning.effort: "low"` 강제 — 추론 비용 cap
2. `output_text` 빈 경우 `response.output[].content[].text` 로 fallback parse
3. `incomplete_details.reason === "max_output_tokens"` 이면 명확한 한국어 에러

**참고**: `src/services/ai/ocr.ts` `callOpenAIResponsesAPI`.

### 1-4. GPT-5 family + o-series 는 `max_completion_tokens` 필수, `temperature` 거부

`max_tokens` 보내면 400 — "Use 'max_completion_tokens' instead." `temperature`
도 same. 적용 모델: `o3`, `o4-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`,
`gpt-5.2`, `gpt-5.5`.

**해결책**: `usesCompletionTokens(model)` 헬퍼로 분기. gpt-5.5-pro 는 더 나아가
chat completions API 자체를 거부 → `requiresResponsesAPI(model)` 헬퍼.

**참고**: `src/services/ai/ocr.ts`.

### 1-5. Opus 4.7 은 **transcription 작업에 부적합** (problem generation)

Opus 는 reasoning 이 너무 강해서 OCR 시 "잘못 스캔된 거니까 보정해야지" 로
가서 본문을 **hallucinate** 한다. 실측: `x³-3x²+1=0` 을 `x³-3x²+k=0` 으로
바꾸고 옵션도 한 칸 shift. 8번 9번 문제 완전 다른 문제로 만듦.

**원칙**: 
- OCR 등 transcription 은 **Sonnet / Gemini Flash 같은 약-reasoning 모델**
- Opus / o3 / gpt-5.5-pro 는 해설 생성·복잡 도형 SVG 같은 reasoning task 에만

### 1-6. 모델 체인 fan-out hook 의 dispatch / cancel 신호 설계 (CRITICAL)

`usePageOcr` / `useSolutionGen` 같은 fan-out hook 의 핵심 함정 2가지.

#### 1-6-a. `dispatched` Set 은 *currently in-flight* 의미여야 한다 (ever-dispatched X)

`dispatched.current` 를 **"이미 dispatch 한 적 있음"** 으로 설계하면 함정:
- 사용자가 "페이지 재인식" 눌러도 `setPageOCR({ ocrComplete: false })` 만 호출되고
  `dispatched.has(id) === true` 는 그대로 → effect 가 skip → 페이지가 영원히
  진행 안 됨. 새로고침 외엔 해결 불가.
- PDF 재업로드 시 같은 `pg-N` id 가 재사용되면서 0/N 영구 hang.

**원칙**: `dispatched` 는 **"지금 in-flight 중"** 의미. 워커가 끝나면 (성공 ·
실패 무관) `finally` 에서 `dispatched.delete(id)` 로 즉시 해제. 그러면 store
가 `ocrComplete: false` 로 바뀐 다음 effect cycle 에서 자연스럽게 재 pick.

사용자 명시적 취소 (재시도 / 회전 버튼) 는 별도 `resetDispatch(pageId)`
콜백으로 - hook 이 return.

```ts
const { resetDispatch } = usePageOcr();
const requestRetry = () => {
  resetDispatch(activePage.id);
  setPageOCR(activePage.id, { ocrComplete: false, ... });
};
```

#### 1-6-b. AbortController 자체가 React 19 StrictMode/HMR 에서 trouble — 제거하라

처음엔 mount-lifetime `AbortController` 로 in-flight HTTP 를 cancel 하려
했지만, **React 19 dev mode 의 StrictMode 시뮬레이트 unmount / HMR /
부모 conditional render** 가 cleanup 을 반복 트리거 → `ctrl.abort()` 발동 →
워커가 `ctrl.signal.aborted` 분기로 silently return → `finally` 가
`dispatched` 마커를 비움 → 다음 effect cycle 이 같은 페이지 재 dispatch →
**무한 루프**. 사용자가 직접 본 증상: console 에 `→ dispatch` / `▶ getPageImage`
가 반복되는데 `✓ image loaded` 는 한 번도 안 찍힘.

여러 시도 (mount-lifetime ref + null-safe acquisition, StrictMode-safe
cleanup 등) 가 모두 race condition 으로 실패. 결국:

**해결 — AbortController 자체를 제거**. `dispatched` Set 멤버십을 유일한
취소 신호로 사용:
```ts
const isCancelled = (id: string) => !dispatched.current.has(id);
// 워커가 await 직후마다 체크
if (isCancelled(page.id)) return null;
```

**트레이드오프**: 실제 unmount 중 in-flight HTTP 한 번 분 cost 감수. zustand
의 `setPageOCR` 은 페이지 id 가 없으면 `.map` 매처가 no-op 이므로 unmount
후 호출돼도 안전.

**참고**: `src/hooks/usePageOcr.ts`, `useSolutionGen.ts`. fan-out hook 만들
때 절대 `AbortController` 추가하지 말 것 — `dispatched` Set 으로 충분.

### 1-7. Provider fallback chain 설계

사용자 합의된 라우팅 (Phase 후속 작업 시 참고):
- **Pass 1 (텍스트)**: Gemini 3 Flash Preview → 폴백 Gemini 3.5 Flash
- **Pass 2 (도형)**: GPT-5.5 → 폴백 Gemini 3.1 Pro Preview
- **해설 생성**: Sonnet 4.6 단일 (Opus 승급은 품질 평가 후)

폴백 트리거: `non-AbortError` throw → 다음 모델로 자동. AbortError 는 폴백
안 함 (사용자 취소 의도 존중).

### 1-8. Anthropic Sonnet 4.6 rate limit — pLimit + retry-after 설계

**증상** (사용자 보고): 30 문항 시험지 해설 생성 시 console 에 429 Too
Many Requests 10+ 연속 발생 → withRetry 도 429 → `ERR_ABORTED`. 해설이
중간에서 끊김.

**원인 분석**:
- Sonnet 4.6 의 분당 RPM (요청 수) 한도 ~30, TPM (토큰 수) 한도 ~40k.
- `useSolutionGen` 의 `pLimit(3)` 가 한 번에 3 개씩 발사 → 짧은 윈도우에
  여러 요청 누적 → 한도 즉시 초과.
- `withRetry` 의 backoff 1s → 2s 가 너무 짧음. Anthropic 의 rate window
  reset 은 보통 5~30 초 단위라 backoff 끝나도 여전히 429.

**해결 — 3 단계**:

1. **pLimit(3) → pLimit(1)**: 해설 생성은 sequential. 한 번에 1 요청만.
   30 문항 × ~3 초/요청 = 1.5 분 — UX 충분.
   ```ts
   const limit = useMemo(() => pLimit(1), []);
   ```

2. **withRetry backoff 강화**: maxRetries 2 → 4, baseDelay 1000 → 2000.
   실제 backoff sequence: 2s → 4s → 8s → 16s → 32s (총 ~60 초).

3. **`retry-after` 헤더 존중**: Anthropic SDK 의 `APIError` 는 `.headers`
   에 `retry-after` (초 단위) 노출. 그 값이 있으면 exponential 무시하고
   그 만큼만 대기. 60 초 cap 으로 UI hang 방지.
   ```ts
   const headers = (err as { headers?: Record<string, string> }).headers;
   const raw = headers?.["retry-after"];
   const secs = raw ? Number.parseFloat(raw) : null;
   return Number.isFinite(secs) && secs > 0 ? Math.min(60_000, Math.ceil(secs * 1000)) : null;
   ```

**`isRetryable` 정규식 확장**: `429|529|503|502|rate|limit|quota|overloaded|temporarily|gateway|timeout` — Anthropic 외에 일반 HTTP 5xx
도 retryable 로 처리.

**원칙**: OCR (vision) 은 페이지당 한 번이라 pLimit(2) OK. 해설 (text-only)
은 30+ 문항 단위라 pLimit(1) 안전. 모델별 RPM 한도를 미리 확인하고 pLimit
값을 *보수적으로* 설정. 새 fan-out hook 추가 시 retry-after 헤더 처리 누락
하지 말 것.

**참고**: `src/lib/concurrency.ts` `withRetry` / `extractRetryAfterMs`,
`src/hooks/useSolutionGen.ts` `pLimit(1)`.

### 1-9. 한국 교과서 분수·근사 표기 관행 (STRICT — CRITICAL)

한국 중·고등 시험지·교과서는 **가분수 (improper fraction) 를 그대로 두지
않고 항상 대분수로 표기**한다. 이유:
- 중1 수준은 순환소수 미학습 — `\frac{4}{3} = 1.333...` 는 학생이 인식 못 함
- 크기 비교·근사 판단에 정수부 + 분수부 분리가 훨씬 직관적
- 한국 수능·내신·문제집이 모두 이 관행을 따름

또한 **근사 기호 `\approx` / `≈` 대신 한국어 "약" 사용**. "≈ 1.33" 이 아니라
"약 1.33". `\approx` 는 수학적 동등 근사 기호로 학생들이 그대로 못 읽음.

**이중 방어선**:

1. **프롬프트로 모델 강제** (`COMMON_INSTRUCTIONS` 의 2번 섹션):
   - 가분수 → 대분수: `\frac{4}{3}` X, `1\frac{1}{3}` ✓
   - 정수로 떨어지면 정수만: `\frac{6}{3}` X, `2` ✓ (`2\frac{0}{3}` 도 X)
   - 진분수 (`\frac{1}{3}`) 와 식 분수 (`\frac{a+1}{2}`) 는 그대로
   - `\approx` X, 한국어 "약 X" ✓

2. **후처리 자동 보정** (`textPreprocess.ts` 의 `improperToMixed`):
   ```ts
   const improperToMixed = (math: string): string =>
     math.replace(
       /(-?)\\d?frac\{(\d{1,4})\}\{(\d{1,4})\}/g,
       (full, sign, numStr, denStr) => {
         const num = parseInt(numStr, 10);
         const den = parseInt(denStr, 10);
         if (num < den || den === 0) return full;
         const whole = Math.floor(num / den);
         const remainder = num % den;
         if (remainder === 0) return `${sign}${whole}`;
         return `${sign}${whole}\\frac{${remainder}}{${den}}`;
       },
     );
   ```
   `applyMathInnerNormalization` 에서 *dfrac→frac 정규화 직후*, *uprightGeometryLabels
   직전* 에 호출. 순서 중요 — `\mathrm{}` wrapping 이 끼면 정수 패턴 매칭이
   안 됨.

**보수적 휴리스틱**: 분자·분모가 모두 1~4자리 순수 정수일 때만 변환.
식 분수 (`\frac{a+b}{c}`, `\frac{\sqrt{2}}{2}`) 는 false positive 위험으로
제외. KaTeX 단순화는 그쪽 분수에 대해선 무능하므로 모델이 알아서 emit
하는 형태를 존중.

**`\approx` 후처리는 안 함**. 수식 안에서 `\approx` 가 다른 의미로 쓰일
수 있고 (예: 함수의 점근선 표기), 자연어 "약" 으로 변환하려면 `$` 닫고
새로 여는 구조 변경이라 부작용 큼. 프롬프트 가이드로 모델이 처음부터
"약" 자연어로 emit 하도록 유도.

**참고**: `src/lib/textPreprocess.ts` `improperToMixed`,
`src/services/ai/prompts.ts` `COMMON_INSTRUCTIONS` 의 2번 섹션.

---

## 2. 렌더링 함정 (SVG / KaTeX / MarkdownRenderer)

### 2-1. SVG namespace 가 React 의 `createElement('svg')` 에서 깨짐

ReactMarkdown + rehype-raw 가 SVG 를 React 엘리먼트로 변환할 때
`createElement('svg')` 가 HTML 네임스페이스로 처리 → `<text>`, `<path>`,
`<circle>` 모두 unrecognized tag 로 렌더되거나 invisible.

**해결책**: Stage 0 에서 `<svg>...</svg>` 블록을 정규식으로 추출 → ID 부여 →
placeholder map 에 normalized SVG 저장 → ReactMarkdown 의 `components.div`
가 `dangerouslySetInnerHTML` 로 주입 (브라우저가 직접 파싱 → namespace 올바름).

```ts
const svgPlaceholders = new Map<string, string>();
let svgExtractedContent = content.replace(
  /<svg\b[\s\S]*?<\/svg>/gi,
  (match) => {
    const id = String(nextPlaceholderId++);
    svgPlaceholders.set(id, normalizeInlineSvgs(match));
    return `\n\n<div data-svg-id="${id}"></div>\n\n`;
  },
);
// components.div: data-svg-id 있으면 dangerouslySetInnerHTML 으로 렌더
```

**참고**: `src/components/math/MarkdownRenderer.tsx` Stage 0.

### 2-2. KaTeX 의 √ ‖ ∑ ∫ 등도 inline `<svg>` — 같은 namespace 함정

KaTeX 의 sqrt / large parens / 큰 연산자는 내부적으로 inline SVG 로 그려짐.
rehype-katex 가 그걸 React 엘리먼트로 만들면 동일한 namespace 깨짐. 결과:
sqrt 가 안 보이고 숫자만 살짝 오른쪽으로 밀려있음.

**해결책**: 모든 `$...$` / `$$...$$` 를 **react-markdown 들어가기 전에**
`katex.renderToString` 로 HTML 문자열로 pre-render → placeholder 만 markdown
에 남김 → components.div / components.span 이 dangerouslySetInnerHTML 으로
주입 (SVG namespace 보존).

**참고**: `MarkdownRenderer.tsx` `prerenderAllKatex` + `katexMap`.

### 2-3. SVG `viewBox` 만 있고 width/height 없으면 브라우저별 0×0 collapse

모델이 `<svg viewBox="0 0 320 220">` 처럼 width/height 없이 emit 하면, CSS
`width: auto; height: auto` 와 결합돼 일부 브라우저에서 0×0 으로 collapse →
SVG 가 DOM 에는 있지만 invisible.

**해결책 2층**:
1. **JS injection**: `normalizeInlineSvgs` 에서 width/height 가 없으면
   viewBox 에서 추출해 attribute 로 박음.
2. **CSS fallback**: `.diagram-svg-inline { width: min(360px, 100%) }` +
   `.prose svg { width: 100%; height: auto }` 로 부모 explicit 폭 보장.
3. **추가 방어선**: `components.div` 가 placeholder 렌더 직전 한 번 더
   width/height 체크해 viewBox 에서 inject.

**참고**: `MarkdownRenderer.tsx` `normalizeInlineSvgs` Pass C + components.div
defensive check.

### 2-4. `.prose svg` CSS rule 이 KaTeX 내부 SVG 까지 잡으면 인라인 수식 깨짐

`.prose svg { display: block; max-width: 360px; margin: 8px auto }` 같은
넓은 룰은 KaTeX 의 sqrt 내부 SVG 까지 적용돼 인라인 수식 한가운데서
줄바꿈 + sqrt 슬롯 0 폭.

**해결책**: KaTeX 내부 SVG 는 `.katex *` 의 descendant 이므로
`:not(:where(.katex *))` 로 제외.

```css
.prose svg:not(:where(.katex *)), ... {
  /* ... */
}
```

**참고**: `src/styles/globals.css`.

### 2-5. `protectLooseLatex` 의 `<` `>` escape 가 정상 HTML 도 망친다

OCR 모델이 `$...$` 밖에 raw `<` `>` 흘리는 경우 placeholder span 이 시각적
누출되는 버그가 있었음. 그 fix 로 `<` → `&lt;`, `>` → `&gt;` 전역 escape 추가.
하지만 정상 `<svg>` / `<table>` / blockquote 마커 `>` 까지 escape → 다 깨짐.

**해결책 3층**:
1. **HTML 블록 보존**: `<svg>...</svg>`, `<table>...</table>` 은 PUA sentinel
   (`String.fromCharCode(57344)`) 로 빼두고 escape 처리 후 복원.
2. **Blockquote 마커 보존**: line-start `>` (`/^(\s*)>/gm`) 도 별도 PUA sentinel
   (U+E001) 으로 빼두고 escape 후 복원.
3. **떠있는 `\displaystyle` 류 제거**: math-mode-only directive 는 text mode 에선
   의미 없으니 그냥 strip.

**참고**: `src/services/ai/sanitize.ts` `protectLooseLatex`.

### 2-6. JSON.parse 가 LaTeX 백슬래시를 박살낸다

모델이 `"\\sqrt{2}"` 로 emit 했을 때 schema-output 경로가 single backslash 로
delivery 하면 JSON.parse 가 `\s` 를 invalid escape 로 처리. 더 심각:
- `\t` → 탭 문자 → `\times` 가 "imes" 만 남음
- `\f` → form feed → `\frac` 이 "rac" 만 남음
- `\b` → backspace → `\binom` 이 "inom" 만 남음
- `\n` → newline → `\nabla` 가 "newline + abla"

**해결책**: `fixLatexEscaping` 으로 control char + 잃어버린 백슬래시를 복원.

```ts
text
  .replace(/\t(?=[a-zA-Z])/g, "\\t")
  .replace(/\f(?=[a-zA-Z])/g, "\\f")
  .replace(/\x08(?=[a-zA-Z])/g, "\\b")
  // orphan command names (no backslash):
  .replace(/(?<![a-zA-Z\\])sqrt(?=\s*\{?\d|\s*\{)/g, "\\sqrt")
  .replace(/(?<![a-zA-Z\\])dfrac(?=\s*\{)/g, "\\frac")
```

**참고**: `src/services/ai/sanitize.ts` `fixLatexEscaping`.

### 2-7. OCR 모델이 `$...$` 밖에 raw LaTeX 흘리는 경우

`\frac{\sqrt{2}}{2}` 가 일부만 `$` 로 감싸진 모델 출력 — markdown 으로 흘러
raw text 노출 + placeholder 충돌. brace-balanced 토큰 consumer 로 한 묶음씩
wrap 해야 정확. 단순 regex 는 nested brace 못 따라감.

**해결책**: 수동 파서 `consumeLatexToken` — `\command` 발견 시 알려진 명령어
화이트리스트 매칭 → `{...}` 인수를 brace 균형 맞춰 끝까지 소비.

```ts
const consumeLatexToken = (text, startIdx) => {
  // text[startIdx] === '\\' 이고 뒤가 알려진 라텍스 명령이면, 명령어 +
  // 따라오는 모든 `{...}` 인수 (중첩 brace 허용) 를 끝까지 소비
};
```

**참고**: `src/services/ai/sanitize.ts`.

### 2-8. KaTeX 의 `\widehat` 는 hat (^) 모양, 호(arc) 아님

한국 교과서의 호 기호 (⌒) 는 폭 따라 늘어나는 부드러운 돔. KaTeX 의
`\widehat` 은 ^ 모양, `\overset{\frown}` 은 작은 글자 ⌢, `\overgroup` 은
V자 꺾이는 모양 — 셋 다 textbook 모양 안 나옴.

**해결책**: `\widehat{XY}` (2글자 이상 대문자) → `\htmlClass{geom-arc-wrap}{\mathrm{XY}}`
로 치환 + CSS `border-radius: 50% 50% 0 0 / 100% 100% 0 0` 으로 부드러운 호.
`renderKatex` 에 `trust: cmd => cmd === "\\htmlClass"` 옵션 추가 필요.

**참고**: `src/lib/textPreprocess.ts` `uprightGeometryLabels`, `globals.css`
`.geom-arc-wrap`.

### 2-9. 인라인 수식에서 분수가 작게 그려짐

KaTeX inline 모드는 `\frac` 가 작게 그려지는 게 정상이지만, 한국 교과서
관행은 항상 크게. `$...$` 안에 `\displaystyle` 자동 주입으로 해결.

```ts
// 모든 $...$ inner 의 앞에 \displaystyle 주입 (이미 directive 있으면 skip)
const injectDisplayStyle = (inner) => {
  if (HAS_STYLE_DIRECTIVE.test(inner)) return inner;
  return `\\displaystyle ${inner}`;
};
```

**참고**: `src/lib/textPreprocess.ts`.

### 2-10. 한국 교과서 점 라벨은 직립 Roman, 변수는 italic

`$\overline{AB}$` 의 A·B 는 점 *이름* 이므로 직립 Roman. `$x$` 는 변수
이므로 italic. KaTeX 기본은 모두 math italic.

**해결책**: `uprightGeometryLabels` — `\overline{XY}` / `\overrightarrow{XY}` /
`\triangle ABC` 등 안의 대문자 라벨을 `\mathrm{}` 으로 wrap. 단독 대문자
`$A$` `$ABCD$` 도 wrap. 휴리스틱은 보수적 — 대문자 라틴 + prime 만.

**참고**: `src/lib/textPreprocess.ts`.

### 2-11. 다중자 `\vec{AB}` 는 `\overrightarrow` 로 승격해야 화살표가 늘어남

`\vec` 는 단일 변수용 좁은 화살표. `\vec{AB}` 는 AB 위에 좁은 화살표만
나와서 textbook 과 다름.

**해결책**: `\vec{XY}` (2자+ 대문자) → `\overrightarrow{\mathrm{XY}}`,
`\vec{A}` (단일) → `\vec{\mathrm{A}}`, `\vec{v}` (소문자) → 그대로.

**참고**: `src/lib/textPreprocess.ts`.

### 2-12. KaTeX warning 무한 출력 (`No character metrics for '①'`)

KaTeX_Main 폰트에 ①②③④⑤ 없어서, 모델이 어쩌다 `$\text{① 답}$` 처럼
math 안에 emit 하면 매 렌더마다 console.warn 폭주.

**해결책**: `renderKatex` 호출 동안만 `console.warn` 래핑해서 "No character
metrics" 메시지만 필터. `finally` 에서 원래대로 복원 (race-safe).

```ts
const origWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === "string" && /No character metrics for/.test(args[0])) return;
  origWarn.apply(console, args);
};
try {
  return katex.renderToString(tex, ...);
} finally {
  console.warn = origWarn;
}
```

**참고**: `MarkdownRenderer.tsx` `renderKatex`.

### 2-13. 큰 괄호 자동 사이징 (`\left(...\right)`)

`(\int f dx)^3` 는 작은 괄호로 그려져 textbook 과 다름. KaTeX 의
`\left(...\right)` 가 auto-sized 괄호 제공.

**해결책**: brace-balanced 파서 `autoSizeBrackets` — `(...)` 와 `\{...\}` 안에
키 큰 명령 (`\int` `\frac` `\sum` `\sqrt` `\binom` `\lim`) 이 있으면 `\left/\right`
로 자동 변환. 중첩도 재귀 처리.

**참고**: `src/lib/textPreprocess.ts`.

### 2-14. raw LaTeX 가 한국어와 mix 된 줄은 line-level wrap + 한글 boundary split

모델이 `\displaystyle 5 - \frac{1}{3} \times \left[...\right]의 값은?` 처럼
한 줄 안에 math (LaTeX 명령) + 한국어 텍스트를 `$` 없이 emit 하는 케이스가
계속 발생. token-level `consumeLatexToken` (개별 `\frac{}` 만 wrap) 으로는
부족:
- `5 - ` 같은 plain operator/숫자 사이가 raw 로 남음
- `\displaystyle` 은 KNOWN_LATEX_CMDS 에 없어서 wrap 안 됨
- `STRAY_DIRECTIVES` strip 이 `\displaystyle` 만 지워서 의도된 display
  sizing 손실

**해결책 — 3 layer 방어**:

1. `sanitize.ts`/`protectLooseLatex` 에 `preWrapLatexHeavyLines` 단계 추가
   (token-level consume 이전). 줄에 `$` 가 없고 LaTeX heavy 면 첫 `\cmd` 부터
   첫 한글 boundary 까지 `$...$` 로 통째 wrap. `\displaystyle` 없으면 명시적
   prepend.

2. `textPreprocess.ts` 의 (9) auto-wrap 도 동일 패턴 — sanitize 가 미스해도
   second chance 로 잡음.

3. `prompts.ts` 의 `OCR_PAGE_PROMPT` / `SOLUTION_PROMPT` 에 "math + 한글
   mix 는 `$` 가 한글 직전에서 닫혀야 함" 규칙 + 사용자 실제 보고 사례를
   잘못된/올바른 예시로 박음.

**한글 boundary 정규식**: `/[가-힣ㄱ-ㅎㅏ-ㅣ]/`. math mode 안에 한글이 들어가면
KaTeX 가 에러나므로 반드시 split.

**참고**: `src/services/ai/sanitize.ts` `preWrapLatexHeavyLines`,
`src/lib/textPreprocess.ts` step (9).

### 2-15. KaTeX 직전에 모델 typo (`\left\left{`) 청소

KaTeX `throwOnError: false` 는 invalid LaTeX 면 통째로 빨간 raw 텍스트로
표시. 사용자가 보면 "raw LaTeX 가 노출됐다" 로 오인. 실제론 `$...$` wrap 은
됐고 KaTeX 가 에러 fallback styling 으로 표시한 것.

모델이 가장 자주 흘리는 typo: `\left\left\{ ... \right\right\}`. KaTeX 가
"Expected delimiter, got \left" 로 에러 — `\left` 다음에 *단일* 구분자
(`(`, `[`, `\{`, `|`, `.`) 만 와야 함.

**해결책**: `textPreprocess.ts` 의 `$...$` / `$$...$$` inner 처리에
`cleanMalformedLatex` pass 추가. lookahead 로 중복 명령어 detect 해 1회로
정상화:

```ts
.replace(/\\left(?=\\left\b)/g, "")    // \left\left{ → \left{
.replace(/\\right(?=\\right\b)/g, "")  // \right\right} → \right}
.replace(/\\frac(?=\\frac\b)/g, "")    // \frac\frac{}{} → \frac{}{}
.replace(/\\sqrt(?=\\sqrt\b)/g, "")    // \sqrt\sqrt{} → \sqrt{}
```

`\b` lookahead 가 `\leftarrow` 같은 정상 명령에는 trigger 안 되도록 보장.
같은 시점에 `\dfrac` → `\frac`, 유니코드 → LaTeX, `injectDisplayStyle`,
`autoSizeBrackets` 등도 같이 runtime.

**참고**: `src/lib/textPreprocess.ts` `cleanMalformedLatex` (`$...$` 처리
바로 앞 단계).

### 2-16. mathlab 의 단순 pipeline vs 우리의 적극적 safety net 정책

`F:\mathlab\src\components\math\shared\text-preprocess.ts` 는 단순함:
- `$...$` 정규화만 (`\(\)` → `$...$`, `$A$$B$` 분리)
- `\displaystyle` strip 없음
- auto-wrap 없음
- 그냥 ReactMarkdown + remarkMath + rehypeKatex 에 넘김

이유: mathlab 은 자체 problem editor 에서 사용자가 직접 입력한 LaTeX 라
**`$...$` wrapping 이 이미 정확**. 모델 출력을 신뢰.

우리는 OCR (Gemini Flash) + 해설 (Sonnet) 모델이 자주 raw LaTeX leak +
malformed 명령어 emit → safety net 적극 필요. 단 mathlab 의 단순 정규화 +
우리의 추가 layer 들 (line-level wrap, malformed cleanup, displaystyle
strip) 을 모두 합친 형태가 정답.

**원칙**: mathlab 의 코드를 직접 카피하면 안 됨. 우리 OCR 파이프라인 특성
(낮은 신뢰도) 을 감안한 추가 방어선을 위에 쌓는 식.

### 2-17. KaTeX 빨간 글씨 에러 fallback 의 multi-path 함정 (CRITICAL)

**증상**: 사용자 보고가 가장 자주 반복된 함정. 화면에 LaTeX 가 *빨간 글씨*
로 그대로 보임. 사용자는 "raw LaTeX 가 노출됐다" 로 오인하지만, 사실 KaTeX
가 input 을 받고 *invalid LaTeX* 라 `throwOnError: false` 의 에러 fallback
styling (빨간 색) 으로 표시한 것. `$...$` wrap 자체는 됐다.

가장 흔한 원인: `\left\left\{` (모델 typo) — KaTeX 의 `\left` 는 다음에
*단일 구분자* 만 받음. `\left` 두 번 연속이면 "Expected delimiter, got
\\left" 에러.

**근본 함정 — 정규화가 wrap path 마다 다르게 적용됨**: 라인을 `$...$` 로
wrap 하는 코드가 **4 군데** 에 있는데 정규화 함수 `cleanMalformedLatex`
(`\left\left` → `\left` 등) 가 한 군데에만 호출되면, 다른 path 로 만들어진
`$...$` 는 정규화 없이 KaTeX 까지 도달 → 빨간 글씨.

**Wrap 이 발생할 수 있는 4 path**:
1. `sanitize.ts` `preWrapLatexHeavyLines` — OCR/해설 결과의 raw LaTeX-heavy
   라인을 `$...$` 로 wrap.
2. `textPreprocess.ts` `$...$` inner 처리 (Step 4/5) — 이미 wrap 된 `$...$`
   안의 normalize.
3. `textPreprocess.ts` Step 9 auto-wrap — `$` 누락된 라인의 line-level wrap.
4. `MarkdownRenderer.tsx` `renderKatex` — KaTeX 에 넘기기 직전.

**정답 패턴 — 모든 path 에 동일 정규화**:
- `cleanMalformedLatex` 를 module-level export 로.
- `applyMathInnerNormalization` 헬퍼 신설 — `cleanMalformedLatex` +
  `\dfrac → \frac` + unicode → LaTeX + `uprightGeometryLabels` +
  `autoSizeBrackets` + `injectDisplayStyle` 일괄.
- 4 path 모두에서 호출.
- `preprocessMathText` 끝에 **Step 10 final pass** — 모든 변환 후 모든
  `$...$` 한 번 더 `cleanMalformedLatex` 통과 (safety net).
- `renderKatex` 가 `katex.renderToString` 호출 직전에 `cleanMalformedLatex`
  한 번 더 (last guard).

**`cleanMalformedLatex` 가 잡아야 할 모델 typo 카탈로그** (전부 실사례):
- 중복 명령어: `\left\left`, `\right\right`, `\frac\frac`, `\sqrt\sqrt`,
  `\boxed\boxed` → 첫 명령어 제거 (lookahead `(?=\\cmd\b)`)
- 명령어 결합: `\bigl\left`, `\bigr\right` → `\bigl/r` 제거
- 빈 분수: `\frac{a}{}` → `\frac{a}{1}`, `\frac{}{b}` → `\frac{0}{b}`
- Escape delimiter: `\left\(` / `\left\)` / `\left\[` / `\left\]` → unescape
- 중복 spacing: `\;\;\;`, `\,\,\,`, `\quad\quad`, `\qquad\qquad` → 단일화
- 근사 등호: `\approx`, `≈` → `=` (사용자: 물결표 금지)

**원칙**: 새 wrap path 추가하면 *반드시* 같은 정규화 묶음 통과시킬 것.
미스하면 그 path 의 출력만 빨간 글씨가 됨 — 디버깅 가장 어려운 케이스 중 하나.

**참고**: `src/lib/textPreprocess.ts` `cleanMalformedLatex` /
`applyMathInnerNormalization`, `src/services/ai/sanitize.ts`
`preWrapLatexHeavyLines`, `src/components/math/MarkdownRenderer.tsx`
`renderKatex`.

---

## 3. 상태 관리 함정

### 3-1. Zustand persist `partialize` 는 *나가는* 데이터만 필터, *들어오는* 건 그대로

`partialize` 함수가 persist 에 쓸 객체를 만드는데, 단순히 `pages: s.pages` 만
하면 *모든* 페이지 필드가 sessionStorage 로 감 — `ocrInflightModel`,
`upgrading` 같은 휘발성 in-flight 플래그까지 박힘 → 새로고침 후 spinner 가
계속 돌고 있는 것처럼 보임.

**해결책**: `partialize` 에서 페이지 별로 매핑하면서 휘발성 필드 strip.

```ts
partialize: (s) => ({
  ...,
  pages: s.pages.map((p) => ({
    ...p,
    ocrInflightModel: undefined,
    upgrading: false,
  })),
}),
```

**참고**: `src/stores/wizardStore.ts`.

### 3-2. "다시 업로드" / "재인식" 류 reset 핸들러가 *3 곳* 다 비워야 함

- **컴포넌트 로컬 state** (phase, error, previews 등)
- **Zustand store** (pages, uploadedFileName 등)
- **IndexedDB** (이전 이미지 잔존 데이터)

한 곳만 빠뜨려도 사용자 입장에서 버튼이 "작동 안 함" 으로 보임. 예: Step1
의 reset 이 로컬 state 만 비웠을 때 `showFinished = phase==="idle" &&
persistedPages.length > 0` 가 여전히 true → 완료 카드 안 사라짐 → 드롭존 안
나타남.

**참고**: `src/components/wizard/Step1Upload.tsx` `reset`.

### 3-3. React useEffect 의 `cleanup` + AbortController 함정 (3 layer 진화사)

3 단계로 진화한 함정. 첫 두 단계는 *제거하지 마라* — 새 hook 만들 때 매번
같은 함정을 다시 밟게 됨. **지금 정답은 [1-6-b](#1-6-b) 의 AbortController
제거 패턴**.

**1단계 (실패)**: per-effect AbortController. setState → re-render → effect
재실행 → cleanup → 직전 시작한 fetch abort. traffic 0, hang.

**2단계 (부분 성공)**: mount-lifetime ref + unmount-only cleanup 분리.
```ts
const ctrlRef = useRef<AbortController | null>(null);
if (ctrlRef.current === null) ctrlRef.current = new AbortController();
useEffect(() => () => ctrlRef.current?.abort(), []);  // unmount only
useEffect(() => {
  const ctrl = ctrlRef.current!;
  // ... use ctrl.signal
}, [pages]);  // 이 effect 의 cleanup 은 정의하지 않음
```
Production build (`npm run preview`) 에서는 동작. 하지만 dev (`npm run dev`)
에서 React 19 StrictMode + HMR + 부모 conditional render 가 unmount cleanup
을 반복 트리거 → ctrl.abort() → 워커 silent return → 무한 dispatch 루프.

**3단계 (정답 — [1-6-b](#1-6-b) 참고)**: AbortController 자체를 제거. fan-out
hook 의 in-flight 마커 (`dispatched` Set) 만으로 cancel 신호 표현. unmount
중 in-flight HTTP 1건 cost 는 감수.

**원칙**: dev 와 production 동작 차이가 의심되면 즉시 `npm run preview` 로
비교 — StrictMode 와 HMR 의 잡음을 차단해서 진짜 버그인지 dev 환경만의
함정인지 가린다.

### 3-4. WizardStepIndex 같은 union type 확장은 next/prev clamp 도 같이 갱신

`type WizardStepIndex = 0|1|2|3|4` → `0|1|2|3|4|5` 로 늘릴 때:
- `next` 액션의 `if (s < 4)` 도 `< 5` 로 바꿔야 함
- `useWizardGuard(step > 0 && step < 4)` 도 `< 5` 로
- `WizardScreen` STEPS 배열도 entry 추가

하나 빠뜨리면 마지막 step 진입 불가 또는 wizard guard 안 걸림.

**참고**: `src/stores/wizardStore.ts`, `src/components/wizard/WizardScreen.tsx`,
`useWizardGuard.ts`.

### 3-5. button 내장 컴포넌트 (`Toggle`, `Chip`, ...) 를 `<button>` 안에 넣지 말 것

UI 컴포넌트 라이브러리 중 일부는 *내부적으로 `<button>` 을 렌더*. 예:
`<Toggle>` 은 `<button role="switch">` 로 구현됨. 이런 컴포넌트를 외곽
`<button onClick={...}>` 안에 두면:

```
<button onClick={rowClick}>   ← 외곽
  <Toggle .../>               ← 내부 button
</button>
```

→ DOM spec 위반 (`<button>` 안 `<button>` 금지) + React hydration warning
"In HTML, `<button>` cannot be a descendant of `<button>`. This will cause
a hydration error." + 일부 브라우저에서 클릭 동작 비결정적.

**해결책**: 외곽을 `<div role="button" tabIndex={0}>` + onKeyDown 핸들러
(Enter/Space) 로 대체. 내부 button 의 onClick 은 `stopPropagation()` 으로
격리해 이중 발동 방지:

```tsx
<div
  role="button" tabIndex={0} aria-pressed={on}
  onClick={() => handleExtra(ex.id)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleExtra(ex.id);
    }
  }}
>
  ...
  <div onClick={(e) => e.stopPropagation()}>
    <Toggle value={on} onChange={() => handleExtra(ex.id)} />
  </div>
</div>
```

**찾는 법**: 새 row/card UI 만들 때 자식 컴포넌트 (Toggle, Chip, Btn 등) 가
내부에 `<button>` 을 렌더하는지 *반드시* 확인. 컴포넌트 source 한 번 열어보면
됨 — 추측 X.

**참고**: `src/components/wizard/Step3Options.tsx` "함께 만들 자료" row,
`src/components/ui/Toggle.tsx`.

### 3-6. Zustand selector 안에 *inline arrow* / *새 reference* 반환 금지 (CRITICAL)

**증상** (사용자 보고 + Chrome MCP 발견): 컴포넌트 마운트 즉시 빈 화면. 콘솔
`Maximum update depth exceeded. ... forceStoreRerender ... updateStoreInstance`
무한 setState 루프. 50+ cycle 후 React abort.

**원인 (실제 발견 사례 — Step1_5CropInspect)**:
```tsx
const setActiveIndex = useWizardStore((s) =>
  (i: number) => s,  // ← selector 안에서 *매 호출마다 새 함수* 반환
);
```

zustand 의 `useStore(selector)` 는 selector 결과를 *얕은 비교 (Object.is)*
로 변경 감지. 새 arrow function 은 매번 *다른 reference* → 항상 변경됨 으로
판단 → 강제 re-render → selector 재호출 → 또 새 함수 → 또 re-render →
*무한 루프*.

**같은 함정 패턴들 — 모두 금지**:
```tsx
// ❌ inline arrow — 매번 새 reference
const fn = useStore((s) => () => s.doSomething());
const obj = useStore((s) => ({ a: s.a, b: s.b }));  // 새 객체!
const arr = useStore((s) => s.items.filter(...));    // 새 배열!
```

**해결 패턴**:
```tsx
// ✅ store 의 *기존 reference* 만 select
const doSomething = useStore((s) => s.doSomething);

// ✅ 액션은 직접 호출 — selector 없이
const handleClick = () => useWizardStore.setState({ activePageIndex: i });

// ✅ 파생 계산은 useMemo 로 메모화 (store 외부)
const filtered = useMemo(() => items.filter(...), [items]);

// ✅ 또는 zustand shallow equality 명시
import { useShallow } from "zustand/react/shallow";
const { a, b } = useStore(useShallow((s) => ({ a: s.a, b: s.b })));
```

**찾는 법**: `useStore((s) =>` 로 grep + selector 의 *반환문* 검토. *함수
호출 (s.x())*, *객체 리터럴 ({...})*, *배열 메서드 (s.x.filter / map)*,
*spread (...)* 가 있으면 의심. 가장 안전한 형태는 *단순 property access*
(`(s) => s.x`).

**참고**: `src/components/wizard/Step1_5CropInspect.tsx` 의 dummy
`setActiveIndex` selector 가 dead code 였음에도 *컴포넌트 mount 시 무한
루프* 일으킴. 빈 화면 + 콘솔 에러 → Chrome MCP `read_console_messages` 로
"Maximum update depth" 키워드 grep 으로 발견.

### 3-7. 한 effect 안에서 *N 회 store mutation* — `Maximum update depth` (CRITICAL)

**증상**: useEffect 가 mount 시 N 개 항목 순회하며 store action 을 N 번 호출.
React 18+ 의 `useSyncExternalStore` (zustand) 는 effect 안 setState 를 *batch
안 함* → 매 호출이 *즉시 reflow* → effect 재실행 → 또 N 회 setState →
*update depth exceeded*.

**원인 (실제 — useCropDetect 의 비-문항 페이지 처리)**:
```tsx
useEffect(() => {
  for (const page of pages) {
    if (!page.isProblemPage && !page.forceOcr) {
      setPageCropBoxes(page.id, []);  // ← 각 호출이 pages 새 reference 생성
      continue;
    }
    // ...
  }
}, [pages, ...]);
```

`setPageCropBoxes(p.id, [])` 가 `state.pages.map(...)` 으로 *전체 새 array*
생성 → useEffect dep `pages` 변경 감지 → 재실행 → 다음 비-문항 페이지 처리
→ 새 array → ... CRA 의 `unstable_batchedUpdates` 없이는 무한 동기 loop.

**해결**: *한 번의 functional setState* 로 모든 항목 batch update:
```tsx
useEffect(() => {
  // 처리할 항목이 있으면 한 번에 모두 update
  const needsUpdate = pages.some((p) => p.cropBoxes === undefined && !p.isProblemPage);
  if (needsUpdate) {
    useWizardStore.setState((state) => ({
      pages: state.pages.map((p) =>
        p.cropBoxes === undefined && !p.isProblemPage ? { ...p, cropBoxes: [] } : p,
      ),
    }));
    return;  // 다음 cycle 에서 자연스럽게 다음 단계 처리
  }
  // 다른 처리...
}, [pages, ...]);
```

**원칙**: effect 안에서 *루프 + setState* 패턴 발견 시 *batch setState* 로
변환. 한 번의 `setState((state) => ({...}))` 가 N 회 개별 setState 보다 *훨씬
안전*. zustand 의 `set` 도 functional form 받음 — 한 함수 안에서 여러 필드
동시 update 가능.

**참고**: `src/hooks/useCropDetect.ts` 의 비-문항 페이지 batch 처리.

---

## 4. 코드 작성 함정

### 4-1. Edit 도구에서 control character (U+0001) 가 안 보임

`String.fromCharCode(1)` 같은 control char 를 Edit 의 `new_string` 으로 넘기면
출력에서 invisible — 다음 Edit 가 "string not found" 로 실패. PUA 영역
(`U+E000` 이상) 도 비슷.

**해결책**: control char 가 필요한 sentinel 은 `String.fromCharCode(57344)`
같은 *명시적 표현식* 으로 작성 — Edit 도구에서 시각적으로 안전.

```ts
// ❌ Edit 에 안 보이는 문자
const PRESERVE_MARK = "";  // U+0001 invisible

// ✅ 명시적 표현식
const PRESERVE_MARK = String.fromCharCode(57344);  // U+E000 PUA
```

### 4-2. 정규식 안에서 `\bwidth\s*=` 가 `stroke-width=` 도 매칭

`\b` (word boundary) 는 word char vs non-word char 사이. `stroke-width` 의
`-w` 위치도 word boundary → `stroke-width="1"` 안에서 `width=` 가 매칭됨.

**증상**: SVG opener 에 width attribute 없는데 `hasWidth` 검사가 true →
주입 skip → SVG 가 0×0.

**해결책**: `\b` 대신 명확한 lookbehind 사용. `(?<!-)\bwidth\s*=` 같은 식.
또는 attribute 만 캡처하는 더 강한 정규식.

### 4-3. 정규식 `[^>]*` 와 `[\s\S]*?` 의 차이

- `[^>]*` — `>` 빼고 *전부* (newline 포함). HTML 한 tag 의 attribute 영역
  매칭에 적합.
- `[\s\S]*?` — 모든 char (newline 포함) non-greedy. tag 내용 매칭에 적합.
- `.*?` — `.` 는 기본적으로 `\n` 제외. multi-line tag/content 매칭 시 위험.

OCR 응답은 multi-line 가능성 크니까 newline 포함하는 패턴 선택.

### 4-4. `String.replace` 의 `$1` `$2` capture group 은 *replacement string* 에서만

콜백 함수 형태 `(_m, p1, p2) => ...` 에서는 `$1` 안 쓰고 매개변수로 받음.
초보 실수: 콜백 안에서 `` `$${p1}$` `` 라고 쓸 때 `$$` 가 literal `$` 가
되도록 escape 신경 써야 함 (특히 template literal 안에서).

### 4-5. JSON Schema `additionalProperties: false` + 모든 키 `required`

Anthropic / OpenAI 의 strict JSON schema 출력은 `additionalProperties: false`
와 모든 properties 가 `required` 에 들어가 있어야 정확히 따름. 빠뜨리면
schema 가 "loose" 해져서 model 이 임의 키 추가하거나 빠뜨림.

```ts
{
  type: "object",
  additionalProperties: false,
  properties: { solution: {...}, answer: {...} },
  required: ["solution", "answer"],  // 모든 키 명시
}
```

Gemini 는 `additionalProperties` 무시 + `minItems > 1` 같은 제약 거부. Schema
를 그대로 보내면 안 되고 `toGeminiSchema` 헬퍼로 변환.

### 4-6. Template literal (`` `...` ``) 안의 backtick / em-dash 함정

`prompts.ts` 같은 *큰 prompt 텍스트 string literal* 을 편집할 때 가장 자주
부딪힌 함정. TypeScript 컴파일 에러로 *발견 후 디버깅* 하면 십수 분 낭비.

**(a) Markdown code marker `` ` `` 가 template literal 을 닫음**:
prompt 안에 ``` `items[]` ```, ``` `gcd(a,b)` ```, ``` `\frac` ``` 같은 code-styled
토큰을 쓰면 그 backtick 이 outer ` `` ` 를 *닫아버림* → 뒤따르는 prompt 본문이
TS 코드로 파싱되어 "',' expected" 에러 폭발.

**해결**:
- backtick 을 무조건 `\`` 로 escape (소스에서 `\`` 처럼 보임), OR
- backtick 대신 double-quote 또는 unicode 인용부호 사용 (예: `"items"`, `"gcd(a,b)"`)
- 우리 prompts.ts 의 `OCR_PAGE_PROMPT` 는 quote 위주, `SOLUTION_PROMPT` 는
  escaped backtick 위주 — 새 섹션 쓸 때 *주변 패턴에 맞춰서* 선택.

**(b) Em-dash (`—`) / 특수 unicode 인용부호 가 일부 OS 에서 invisible**:
Edit 도구의 `old_string` 으로 em-dash 가 포함된 줄을 그대로 복사하면 매치
실패. 원본 파일에서 ellipsis (`…`), em-dash (`—`), 한국어 인용부호 (`「」`)
같은 글자는 *그대로 보이지만 Edit 매처에서는 0-1 byte 차이* 가 자주 발생.

**해결**: Edit 매치 실패하면 즉시 `Read` 로 해당 줄 재확인. 새 prompt 작성
시엔 ASCII (`-`, `--`, `"..."`, `'...'`) 우선.

**예방 정책**: 새 prompt 본문 작성 후 *반드시* `npx tsc --noEmit` 한 번 돌릴 것.
backtick / unicode 함정은 컴파일 에러로만 발견됨.

---

## 5. PDF / 이미지 처리

### 5-1. PDF.js viewport rotation 메타데이터 + textLayer 휴리스틱

회전된 PDF (가로로 저장된 시험지) 는 OCR 정확도 크게 떨어짐. 자동 감지는
**비용 0원** 으로 가능:

1. **`page.rotate`**: PDF 자체에 박힌 회전 메타데이터 (문서 편집기/스캐너에서
   저장된 경우 다수)
2. **textLayer 글리프 transform 매트릭스**: `getTextContent()` 의 item.transform
   `[a, b, c, d, e, f]` 에서 a/d (수평 스케일) vs b/c (수직 스케일) 비율 측정.
   회전 페이지에선 b/c 가 a/d 보다 큼.

회전 적용은 **OCR 호출 시점에만** (`applyRotation(dataUrl, rotation)`) —
IndexedDB 원본 이미지는 그대로. 썸네일·중앙 패널은 CSS `transform: rotate()`
로만 표시.

**참고**: `src/lib/pdfProcessor.ts` `detectPageRotation`, `applyRotation`.

### 5-2. PDF.js 의 standard fonts

PDF 의 14 standard fonts (Helvetica, Times, Symbol, ZapfDingbats 등) 는 폰트
파일 내장 안 됨 — pdfjs-dist 4.x+ 에서 `standardFontDataUrl` 안 주면 ☐ 로
렌더. Symbol 폰트로 표시된 수학 글리프가 다 깨짐.

**해결책**:
```ts
pdfjsLib.getDocument({
  data: ...,
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
});
```

### 5-3. IndexedDB write 순서가 race condition 의 핵심

Step 1 에서 페이지마다 `putPageImage` / `putThumbnail` 두 개의 IndexedDB
write 가 모두 끝난 *후에만* `setPages(pages)` 호출해야 함. 그렇지 않으면
`usePageOcr` 가 즉시 `getPageImage(imageRef)` 시도 → 아직 write 안 끝나서
undefined 반환 → "페이지 이미지 없음" 에러.

**원칙**:
```ts
const [imageRef, thumbRef] = await Promise.all([putPageImage(...), putThumbnail(...)]);
pages.push({ ..., imageRef, thumbRef });
// 루프 끝까지 await 완료 후에만 setPages
setPages(pages);
```

---

## 6. UI / 사용자 경험

### 6-1. Confidence → status 매핑 + body-missing override

모델은 confidence 를 high/medium/low 로 emit. 우리는:
- `high` → status `"ok"` (확정)
- `medium` / `low` → status `"warn"` (검토)
- **이와 무관하게** `bodyMissing === true` 면 force `"warn"` — 휴리스틱이
  찾은 "본문 누락" 케이스는 사용자가 반드시 봐야 함

OCR_PAGE_PROMPT 의 confidence 룰: "SVG 직접 그렸으면 medium 권장" → 도형
페이지는 거의 자동으로 검토 상태. 의도된 동작 (도형은 모델 생성이라 사용자
검증 필요).

### 6-2. DEV 게이트 패턴 (`import.meta.env.DEV`)

내부 디버그용 UI (모델명 배지, in-flight 상태 등) 는 `import.meta.env.DEV` 로
prod 빌드에서 숨김:

```tsx
{import.meta.env.DEV && page.ocrInflightModel && (
  <Chip>...{page.ocrInflightModel}...</Chip>
)}
```

Vite 가 prod 빌드 시 이 분기를 dead-code-elimination.

### 6-3. 5지선다 ①②③④⑤ 자동 grid

OCR 모델이 옵션들을 `① $1$ ② $2$ ③ $3k$ ④ $4k$ ⑤ $5k$` 처럼 한 줄로 emit
하면 자동으로 1열 또는 2열 grid 로 분기.

**규칙** (`MarkdownRenderer.renderChoiceRowOrNull`):
- 최대 옵션 길이 ≤ 25 → 2열 (3+2 layout)
- > 25 → 1열 (긴 식)

`<p>` 컴포넌트 레벨에서 children 검사 → ①②③④⑤ 가 순서대로 다 있으면
choice grid 로 변환.

---

## 7. 작업 흐름 원칙

### 7-1. mathlab 패턴 차용 시 mathg-gen 컨벤션 적용

`F:\mathlab` 에 검증된 패턴 (pdf-extract-engine, withRetry, MarkdownRenderer
등) 이 많지만 mathg-gen 은:
- **브라우저 직접 호출** (Next.js API route 없음, `dangerouslyAllowBrowser: true`)
- **NDJSON stream 사용 안 함** — Anthropic SDK 의 `messages.stream` native 사용
- **한국어 주석** 우선 (mathlab 영문 주석 → 한국어로 정리)
- **mock storage 없음** — Phase 0.5 단계라 IndexedDB + sessionStorage 직접

### 7-2. 절대 만들지 말 것

- **새 문서 (`.md`)** — 명시적 요청 없으면 만들지 않음. README, *.md 등 자동 생성 X.
- **새 라이브러리 의존** — 사용자 승인 없이 npm install 하지 않음.
- **하드코딩 한국어 메시지를 영어로 바꾸지 않음** — 사용자가 한국어 UX 의도.

### 7-3. 작업 시작 전 항상 확인

1. **TaskList 확인** — 진행 중인 작업 / 사용자가 미리 만든 작업 있는지
2. **dev 서버 상태 확인** — `curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/`
   200 이면 작업 가능. 죽었으면 사용자에게 알림.
3. **사용자가 입력한 모델 / 프롬프트 변경** — `OCR_MODELS`, `pickPass1Chain`,
   `pickPass2Chain`, `SOLUTION_PROMPT` 등은 최근 사용자 결정에 따라 변동.
   임의로 되돌리지 않음.

### 7-4. 작업 종료 후 항상 확인

1. **Vite dev compile 확인** — `curl -s "http://localhost:3005/src/path/to/file.ts"`
   로 트랜스파일 결과에 추가한 export / function 보이는지
2. **브라우저 검증 — Chrome MCP 최우선** — 콘솔 에러 확인 (`read_console_messages`),
   UI 동작 검증 등 *브라우저 확인은 모두* Chrome MCP (`mcp__Claude_in_Chrome__*`) 를
   **최우선**으로 사용. 확장 미연결 등으로 사용 불가능할 때만 Preview MCP
   (`mcp__Claude_Preview__*`) 로 폴백 — Preview MCP 는 화면 패널을 차지하므로 차선.
3. **TaskUpdate completed** — 끝낸 작업은 반드시 completed 마킹

### 7-5. 프롬프트 수정 — "일반 지시문" 보다 *사용자 실제 보고 사례* 가 강력

사용자가 같은 종류의 보고를 반복하는 경우 ("풀이 너무 김", "raw LaTeX 노출",
"한국 교과서 용어 써", "보기 누락") 가 자주 있다. 그때마다 prompt 에 일반
지시문 ("be brief", "wrap in `$...$`") 을 *추가* 하는 식의 수정은 효과 거의
없음. 모델은 이미 일반 룰을 알고 있고 그걸 일관 적용하지 못해서 같은 실수
반복하는 것.

**효과적 패턴**:
1. 사용자가 보고한 *실제 잘못된 출력* 을 그대로 prompt 에 박는다 — 잘못된
   예시 라벨로.
2. 같은 케이스의 *올바른 출력* 을 옆에 박는다 — "권장" 라벨로.
3. 둘의 차이를 1~2 문장으로 설명 — "왜" 가 명확해야 모델이 generalize.

예 (15번 풀이 너무 김 케이스 — `SOLUTION_PROMPT` 에 박은 패턴):
```
잘못된 풀이 (실제 출력, 25 줄+):
  [1단계: 조건 분석] ... 4 줄
  [2단계: ...] ... 5 줄
  ... 6 case brute-force 나열
  → 25 줄 넘게.

올바른 풀이 (목표, 6~8 줄):
  $A = 12a$, $B = 12b$ ...
  최소공배수 ... 이므로 ...
  따라서 ...
```

**원칙**:
- "동일 보고 2 번 받으면 그 사례 자체를 prompt 에 박을 것."
- 사용자 메시지에서 잘못된 출력 부분을 *복사* 해서 prompt 에 그대로 (조금만
  요약). 모델이 같은 패턴을 emit 하려고 하면 prompt 안에서 "이거 잘못된
  거다" 라는 강한 signal 을 받는다.
- 일반 지시문 추가는 *최후 수단*. prompt 가 비대해지면서 효과는 약해짐.

**한국 교과서 용어 (gcd → 최대공약수, max → 큰 값) 같은 매핑** 도 같은 원칙.
prompt 에 정확한 매핑 표 + 잘못된 예 + 올바른 예 박는 게 일반적인 "한국어
풀어쓰기 우선" 지시문보다 훨씬 효과적.

**참고**: `src/services/ai/prompts.ts` `OCR_PAGE_PROMPT` / `SOLUTION_PROMPT`
에 박힌 "사용자 보고 사례" 섹션들.

### 7-6. 모델의 trial-and-error / self-correction / 답 검증 흔적 명시 금지

사용자 보고 13번 — 모델이 풀이 중 잘못 계산했음을 깨닫고 *그 과정을 그대로
출력*. "잠깐, 선택지가 작으므로 다시 확인", "다시 정리:", "여전히 선택지에
없음" 같은 self-correction 흔적이 그대로 raw 로 emit. 결과: 풀이가 25 줄+
폭발 + 학생이 혼란.

**원인**: 일반 지시문 ("be brief") 만으로는 모델이 thinking 흔적을 못 자름.
모델 입장에서 그게 풀이의 일부로 인식됨.

**해결 — Prompt 에 명시적 금지 표현 + 사례**:

```
🚨 trial-and-error / self-correction 흔적 절대 금지

  잘못된 실제 출력 (절대 emit X):
    "...합 = 1960. **잠깐, 선택지가 작으므로 다시 확인**. ... = 1120.
    여전히 선택지에 없음. **다시 정리:** ... = 280."

  → 모델이 본인 thinking 을 raw 로 emit. 절대 금지 표현:
  - "잠깐", "다시 확인", "재정리", "재검토", "다시 계산"
  - "선택지가 없으니", "여전히 없음"
  - "사실은", "실제로는"

  올바른 패턴: 잘못 계산했으면 **출력에서 그 과정을 *지우고*** 처음부터
  정답까지 직선 식 흐름만.
```

**관련 함정 — 답 검증 / 정리 / 마무리 멘트**:

답이 schema 상 별도 필드 (`answer`) 로 가는 구조라면, `solution` 의 마지막
식이 답을 보여주면 충분. "따라서 답은 ⑤", "정리하면 답: ⑤", "선택지 확인:
⑤가 정답" 같은 검증/마무리 멘트는 *중복 정보*. prompt 에 명시적으로 금지.

```
🚨 답 검증 / 정리 / 마무리 멘트 금지

  잘못된 출력:
    "...따라서 답은 ⑤" / "정리하면 답: ⑤"
  올바른 예 (마지막 줄):
    "A + B = 168 + 108 = 276"  (← 끝. 다른 멘트 X.)
```

**원칙**: 모델 출력의 *형식* 을 통제하고 싶으면 일반 지시문보다 (a) 금지
표현 카탈로그 + (b) 사용자 보고 실제 잘못 출력 + (c) 올바른 출력 비교 의
3 종 세트가 가장 효과적. 7-5 의 패턴과 동일.

**참고**: `src/services/ai/prompts.ts` `SOLUTION_PROMPT` 의 "trial-and-error
흔적 절대 금지" / "답 검증 멘트 금지" 섹션.

---

## 8. 디버그 도구

### 8-1. 브라우저 React state 추출 (sessionStorage 경유)

```js
JSON.parse(sessionStorage.getItem('mathgen-wizard-v1'))?.state
```

`partialize` 된 데이터만 보이므로 휘발성 필드 (`ocrInflightModel`, `upgrading`)
는 안 보임 — 실시간 디버그엔 부족. React DevTools 또는 console.log 필요.

### 8-2. IndexedDB 인스펙션

```js
const dbs = await indexedDB.databases();
// 정확한 DB 이름: 'mathgen' (3 stores: pageImages, pageThumbnails, pdfBlobs)
// 잘못 알려진 이름 'mathgen-images' 는 빈 ghost DB — 무시
```

### 8-3. fetch monkey-patch 진단

API call 이 진행 중인지 / hang 인지 확인할 때:

```js
window.__fetchSpy = { pending: [], completed: [], errors: [] };
const orig = window.fetch;
window.fetch = async function(...args) {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
  const entry = { url: url.slice(0, 120), startedAt: Date.now() };
  window.__fetchSpy.pending.push(entry);
  try {
    const res = await orig.apply(this, args);
    entry.duration = Date.now() - entry.startedAt;
    entry.status = res.status;
    window.__fetchSpy.completed.push(entry);
    window.__fetchSpy.pending = window.__fetchSpy.pending.filter(e => e !== entry);
    return res;
  } catch (err) {
    entry.error = err.message;
    window.__fetchSpy.errors.push(entry);
    window.__fetchSpy.pending = window.__fetchSpy.pending.filter(e => e !== entry);
    throw err;
  }
};
```

설치 후 `window.__fetchSpy` 로 상태 확인. spy 설치 *이전*에 시작된 fetch 는
안 잡히므로 새로고침 후 즉시 설치 권장.

### 8-4. Performance API 로 *완료된* API call 만 보기

```js
performance.getEntriesByType('resource')
  .filter(e => /anthropic|openai|gemini|generativelanguage/.test(e.name))
```

진행 중인 호출은 안 보임. 완료된 호출이 0건이면 "호출이 아직 안 끝났음" 또는
"호출 자체가 시작 안 됐음" 둘 중 하나 — fetch monkey-patch 로 구분.

---

## 10. mathDefense — 학년별 fragment 시스템

### 10-1. 학년 fragment 의 token 절감 (~75 %)

`SOLUTION_PROMPT` 의 *방어 프롬프트 영역* (패턴 A-I + 자가 검증 + 단원별 함정
표) 을 전부 박으면 ~570 줄. 사용자 결정으로 **학년별 fragment** 로 분리:

- `MATH_DEFENSE_COMMON` (~2,574 tokens) — 모든 학년 공통
- `MATH_DEFENSE_BY_GRADE` (10 키, 각 200~1000 tokens) — 학년별 단원 함정

`buildMathDefense(grade)` 가 한 시험지 단위로 결합. 학년 미선택 fallback 은
공통만 inject.

**Token 비용** (30 문제, Sonnet 4.6):
- 전체 박기: 시험지당 $0.32
- 학년 분리: 시험지당 ~$0.07~0.09 (약 75% 절감)

### 10-2. fragment 의 정규식 추출 함정

mathDefense.ts 의 학년별 fragment 는 `\`${MIDDLE_SCHOOL_NOTATION_GUARD}\n
─── 중1...` 같이 *nested template literal* 형태. 단순 regex `const NAME =
\`(...)\`` 는 `${VAR}` interpolation 때문에 *첫 번째 backtick* 에서 끊김.

**해결**: token 측정 / fragment 검증 등은 **dynamic import** 로:
```ts
import { MATH_DEFENSE_BY_GRADE } from "./src/services/ai/mathDefense";
// 정규식 추출 X — 실제 평가된 값 사용
```

`tsx` 또는 `vite-node` 로 `.mts` 스크립트 실행 (`npx tsx token_est.mts`).

### 10-3. 중학 (1~3) 집합 기호 금지 (사용자 강력 보고)

중학 교육과정에 *집합 개념이 없다* (집합은 고1 공통수학2). 사용자 보고:

  잘못된 출력: `□ = 2^a × 3^b (a ∈ {0, 1, 2}, b ∈ {0, 1, 2, 3})`
  → 중1 학생은 `∈`, `{}` 못 읽음.

**해결**: `MIDDLE_SCHOOL_NOTATION_GUARD` 헬퍼 신설 → middle1/2/3 fragment 가
공유. 다음 기호 모두 금지:
- `∈` / `\\in`, `{ ... }` 집합 brace, `∪`, `∩`, `⊂`, `⊃`, `∅`, `∀`, `∃`

올바른 대안:
- 자연어: "\`a\` 는 0, 1, 2 중 하나"
- 부등식 (중2+): "0 ≤ a ≤ 2, a 는 정수"

### 10-4. 패턴 A-I (메타 인지 오류) — 사용자 두 차례 심각 보고 반영

- **패턴 A (max-condition)**: "필수 vs 상한" 혼동. `\\max(A, B) = C` 일 때
  `A ≥ C` 면 `B` 는 *0~C 모두 가능*. 사용자 13번 LCM 문제 사례 박기.
- **패턴 B (constraint-stage)**: "서로 다른" 조건을 *중간 단계* 에 적용해
  case 조기 제외. 절댓값 분해 `{2, 5, 5}` 가 부호 배정 후 `(-5, 2, 5)` 로
  *세 정수 서로 다름* 만족.
- **패턴 I (sign-consistency)**: 부호 배정 후 *음수 개수 패리티* ↔ 곱 부호
  일치 확인. (5, -2, -5) 는 음수 2개 → 곱 +50 → -50 조건 위반.

세 패턴 모두 사용자 보고 *그대로* (잘못된 풀이 + 진짜 정답) prompt 에 인용.
일반 지시문 ("be careful") 보다 훨씬 효과적 (7-5 원칙 재확인).

---

## 11. Anthropic Prompt Caching

### 11-1. 도입 동기 + 효과

해설 생성 (Sonnet 4.6) 의 input 비용 절감. 한 시험지 30 호출이 *같은 학년·
prompt prefix* (~6,270 tokens) 공유 → 첫 호출 cache write, 29 호출 cache
read (90% 할인) → input ~87% 절감, 전체 ~46% 절감 ($1.00 → $0.54).

### 11-2. byte-identical split CRITICAL

cache hit 의 *전제 조건*: 같은 model + max_tokens + temperature + system +
content blocks 의 *byte-identical prefix*. 1 글자라도 다르면 cache miss.

**해결 패턴** (`prompts.ts`):
1. 헬퍼 `buildPersonaAndDefense(grade)` 추출 — persona + defense 의 *단일
   source of truth*. 두 함수가 같은 헬퍼 호출 → byte-identical 자동 보장.
2. `buildSolutionPrompt` (string) 유지 — Gemini/OpenAI 호환.
3. `buildSolutionPromptBlocksAnthropic` 신규 — `SPLIT_MARKER = "{problemText}"`
   기준 `slice + replace` 로 2 blocks 분리. **fallback**: marker 없으면 단일
   block 반환 (cache X, 동작 보존).
4. **검증 필수**: `[b0.text, b1.text].join("") === buildSolutionPrompt(...)`
   를 임시 assert 또는 별도 검증 스크립트 (21 시나리오 = 7 학년 × 3 문제) 로
   100% 통과 확인.

### 11-3. SDK 타입 패턴

`@anthropic-ai/sdk` 0.97.1 의 `CacheControlEphemeral = { type: 'ephemeral';
ttl?: '5m' | '1h' }`. TextBlockParam 의 `cache_control?` field.

**우리 컨벤션** (generate.ts SYSTEM_BLOCKS 와 동일): `import type Anthropic`
없이 `as const literal` 패턴:
```ts
{ type: "text", text: prefix, cache_control: { type: "ephemeral" } }
```

### 11-4. 회귀 방지

- Gemini / OpenAI 호출 경로 **0 줄 변경** — `callGemini` / `callOpenAI` 의
  `buildSolutionPrompt(input.problem, input.grade)` 그대로 유지.
- 변경 commit 1 개, 파일 2 개 (prompts.ts + solutions.ts) — 충돌 0 으로
  격리.
- 롤백 1 줄: `content: userBlocks` → `content: [{type:"text", text: buildSolutionPrompt(...)}]`.

### 11-5. cache hit 측정 (DEV-only)

```ts
if (import.meta.env.DEV) {
  const u = (response as { usage?: ... }).usage;
  console.debug(`[ai/solutions] cache_read=${u?.cache_read_input_tokens ?? 0}
    cache_create=${u?.cache_creation_input_tokens ?? 0}`);
}
```

조기 경고: *2번째 호출* 부터 `cache_read = 0` 이면 즉시 롤백.

### 11-6. cache TTL vs 우리 호출 패턴

TTL 기본 5분. `pLimitWithGap(1, 1500ms)` × 30 호출 = ~45초. 안전 범위 (TTL
의 15%). 학년 chip 변경 → cache 자동 무효 (의도된 동작).

### 11-7. 사용자 아이디어 — OCR + 해설 통합의 trade-off

사용자가 "OCR 결과를 다시 prompt 에 넣는 게 비효율" 정확히 진단. *근본
해결*은 같은 모델로 통합:
- Sonnet 4.6 vision: OCR + 해설 한 호출 → input 중복 0
- 단 OCR 정확도 (vs Gemini Flash-Lite) 불확실 — 1 시험지 spot-check 후 도입
- 절감 ~$0.40 (vs prompt caching $0.45)

**결론** (사용자 결정): prompt caching 우선 (위험 0, 효과 비슷). 통합은 후속.

---

## 12. 다른 프로젝트 통합 검토 패턴 (mathlab 사례)

### 12-1. *우리 시스템 우수성* 먼저 평가

다른 프로젝트 (`D:\mathlab`) 의 utilities 활용 검토 시:
- 우리 *동등 함수* 가 이미 있나? 우리가 더 정교한가?
- *진짜 신규 가치* 만 추출, 나머지는 미통합

mathlab 분석 결과:
- 우리 `curriculum.ts` 402 줄 > mathlab 347 줄 — **미통합** (우리가 우수)
- 우리 `sanitize.ts` + `textPreprocess.ts` 1100 줄 > mathlab `post-processor.ts`
  325 줄 — **9 함수 중 3 함수만 통합**
- 우리 패턴 A-I (mathDefense) > mathlab H1-H8 — *우리가 더 깊음*

### 12-2. Explore agent 의 *방향 통제*

Agent 가 "D:\mathlab 탐색" 명령 받고 *D:\mathg-gen* 자체를 탐색해버린 사례.

**해결 패턴**:
- prompt 에 "**절대 D:\mathg-gen 보지 말 것**" 명시
- 가능한 모든 경로를 explicit list 로
- 첫 결과 신뢰성 의심되면 새 prompt 로 재실행

### 12-3. 통합 우선순위

3 카테고리로 분류:
1. **즉시 적용** — 신규 가치 명확 + 충돌 없음
2. **후속 (Phase 2)** — 가치 있지만 기능 도입 후
3. **미통합** — 충돌 / 도메인 차이 / 우리가 우수

mathlab 의 9 함수 통합 결정:

| 함수 | 결정 | 이유 |
|---|---|---|
| `normalizeCircledMarkers` (textcircled → ①㉠㉮) | ⭐ 통합 | 한글 특화 유니코드 맵, 우리에 없음 |
| `resolveMCAnswer` (값 → 마커) | ⭐ 통합 | 정답 정규화, 우리에 없음 |
| `deepFixText` (객체 재귀) | ⭐ 통합 | 미래 schema 확장 가치 |
| `fixLatexEscaping` | 미통합 | 우리 30 줄 lookbehind 가 더 보수적 |
| `normalizeMathText` | 미통합 | 우리 `preprocessMathText` 445 줄 |
| `[N단계]` → bold 변환 | 미통합 | 우리 단계 축소 정책과 충돌 |
| `\therefore` → 자연어화 | 미통합 | prompt 강제로 충분 |
| `\text{한글}` 제거 | 후속 | `uprightGeometryLabels` 충돌 평가 후 |
| `stripCodeFence` | 미통합 | 우리 `stripCodeFences` 있음 |

### 12-4. 통합 전 sanitize 순서 검증 (CRITICAL)

`normalizeCircledMarkers` 를 잘못된 단계에 두면 KaTeX 에러:
- `protectLooseLatex` *이후* → `\textcircled{1}` 이 `$` 안에 wrap → "Unknown
  command" 에러
- 권장 순서: `IMG_TAG_RE` → `MD_IMG_RE` → `normalizeCircledMarkers` →
  `fixLatexEscaping` → `protectLooseLatex`

새 sanitize 함수 추가 시 *순서가 영향 미치는지* 반드시 검토.

---

## 13. UI / 상호작용 패턴

### 13-1. OS-aware 단축키 표시

키 핸들러는 `e.metaKey || e.ctrlKey` 로 양쪽 인식 가능. *UI 표시*만 분기:

```ts
// src/lib/platform.ts
export const isMac = () => /Mac|iPhone|iPad/i.test(navigator.platform);
export const modKey = () => isMac() ? "⌘" : "Ctrl";
```

`<ModKey/>` 컴포넌트 (Kbd.tsx) 로 일관 사용. SSR-safe (`navigator` 없으면
false → Windows fallback).

### 13-2. inline-flex 의 margin 함정

정답 박스의 *content-fit width* 처리 시 `inline-flex` 사용하면 vertical
margin (mb-3 등) 이 부모 line-height 와 충돌해 *마진 적용 불안정*.

**해결**: `flex w-fit max-w-full flex-wrap` 패턴.
- `flex` — block-level flex container (margin 정상)
- `w-fit` — fit-content (짧으면 작게)
- `max-w-full` — 너무 길면 부모 폭 cap
- `flex-wrap` — 줄바꿈

### 13-3. Chip 컴포넌트의 한계

`Chip` 은 `<span>` 으로 렌더 — `onClick` / `title` prop 받지 않음.

- **클릭 가능 chip** 필요 시: 자체 `<button>` 으로 chip-style 직접 작성
  (`SelectablePill` 패턴, Step1Upload 학년 chip 참고).
- **tooltip** 필요 시: `<span title="...">` wrapper 로 감싸기:
  ```tsx
  <span title={`full id: ${model}`}>
    <Chip size="sm">{shortLabel}</Chip>
  </span>
  ```

### 13-4. 모델명 표시 — 페이지 vs 문항

페이지 단위 OCR 호출이므로 *같은 페이지 안의 모든 item* 은 기본적으로 같은
모델. 단 task #41 (item 별 재실행) 도입 시 다를 수 있음.

**구조**:
- `WizardPage.ocrModel` — 페이지 단위 (현재)
- `OCRProblem.ocrModel` — 문항 단위 (페이지 모델 복사 + item 재실행 시
  override)
- `OCRProblem.solutionModel` — 해설 모델 (이미 있음)

`src/lib/modelLabel.ts` 의 `modelShortName()` 헬퍼 — PageThumbColumn /
OCRItem / SolutionItem 등 *모든 모델 chip* 이 공유.

### 13-5. 문항 카드의 표시 순서 — *문제 → 정답 → 풀이* (CRITICAL)

사용자 보고: 정답이 *문제 위* 에 있어 학습 흐름이 깨짐 — 문제 읽기도 전에
선택지 ③ 등이 노출. 교과서 / 학습지의 자연스러운 흐름은:

```
1. 문제 본문 + 선택지 (학생이 *직접 풀어볼* 영역)
2. 정답 (확인 직전 시점)
3. 풀이 (펼침 — 정답이 왜 그런지)
```

**원칙 — *통합 카드 (문제+정답+풀이 한 카드)* 에 적용**:

| 영역 | 적용 여부 | 이유 |
|---|---|---|
| `VariantItem` (Step 4 변형 카드) | ✅ 적용 | 통합 카드 — 문제/정답/풀이 모두 한 카드 |
| `PrintQuestionBlock` (인쇄 문제지) | N/A | 문제만 — 정답 없음 |
| `PrintAnswerKeyPage` (인쇄 정답지) | N/A | 정답 + 해설 묶음 — 별도 페이지 |
| `SolutionItem` (Step 3 우측) | ❌ 예외 | 분리 카드 — 좌측 OCRItem 이 문제, 우측 SolutionItem 이 *정답 + 해설*. 우측 안에서 *정답 → 해설* 자연스러움. |
| `OCRItem` (Step 2/3 의 문제 카드) | N/A | 문제만 |

**구현 패턴** (VariantItem 예시):

```tsx
<Card>
  <Header />
  {/* 1. 문제 본문 */}
  <MarkdownRenderer content={problem.question} />
  {/* + 객관식이면 선택지 ①②③④⑤ */}

  {/* 2. 정답 strip — 강조 (accent-soft) */}
  <div className="mt-3 px-3 py-2 rounded-r2 bg-accent-soft border border-accent/30 ...">
    <span>정답</span> {problem.answer}
  </div>

  {/* 3. 풀이 — <details> 펼침 토글 */}
  <details>
    <summary>풀이 보기</summary>
    <MarkdownRenderer content={problem.solution} />
  </details>
</Card>
```

**새 통합 카드 추가 시 — 이 패턴 강제**. 분리 카드 (Step 3 좌우) 가 아닌
*문제·정답·풀이 한 카드* 이면 *반드시 문제 → 정답 → 풀이* 순.

**참고**: `src/components/wizard/VariantItem.tsx` L321-390. 사용자 보고
(2026-05-26) 후 *정답 strip 을 문제 + 선택지 *아래* 로 이동*.

### 13-6. 액션 버튼 위치 — *한 곳에 모으기* (CRITICAL)

사용자 보고 (2026-05-26): DetailScreen 의 *TopBar 우측* (공유/PDF/이어서작업)
+ *하단 CtaBanner* (변형만들기) 가 *제각각 위치* → "버튼들 위치가 제각각이여서
매우 불편함. 좌우측 공간 활용해야할듯"

**원칙 — 한 화면의 *주요 액션* 은 *한 묶음* 으로**:
- 흩어지면 사용자가 *어디 클릭해야 할지* 매번 찾음 — 인지 부하 ↑
- 좌우 sidebar 가 *좁아 보여도* 액션 모으기엔 충분 (~280px width)
- *TopBar 의 액션* 은 *글로벌 네비* (보관함, 검색) 만 — 화면별 액션은 sidebar 로

**적용 예시 (DetailScreen)**:

| 위치 | 이전 | 이후 |
|---|---|---|
| TopBar 우측 | [공유][PDF][이어서작업] | (비움) |
| 메인 하단 | [변형 만들기 CTA banner] | (제거) |
| 우측 sidebar 최상단 | (없음) | **[액션 섹션]** — 변형 만들기 / 이어서 작업 / 공유 / PDF |

**구현 (`DetailMetaSidebar`)**:
```tsx
<aside>
  {/* 1. 액션 — 최상단 */}
  <Eyebrow>액션</Eyebrow>
  <Btn kind="accent" full icon="sparkle" iconRight="arrow-right" onClick={onResume}>
    변형 만들기
  </Btn>
  <Btn kind="secondary" full icon="play" onClick={onResume}>이어서 작업</Btn>
  <div className="flex gap-2">
    <Btn kind="ghost" full size="sm" icon="share-network" onClick={onShare}>공유</Btn>
    <Btn kind="ghost" full size="sm" icon="download-simple" onClick={onPdf}>PDF</Btn>
  </div>

  {/* 2. 정보 */}
  {/* 3. 변형 이력 */}
</aside>
```

**원칙 일반화**:
- 화면별 *주요 액션 4개+* 가 있으면 *sidebar 의 액션 섹션* 으로 모음
- TopBar 는 *글로벌 네비 + status indicator* 만
- 본문 안의 inline CTA banner 는 *데이터 없음 / empty state* 에만 사용 (액션 중복 방지)

**참고**: `src/components/detail/DetailMetaSidebar.tsx` (액션 섹션 신설),
`src/components/detail/DetailScreen.tsx` (TopBar 우측 비움 + CtaBanner 제거).

---

## 14. Plan mode 활용 패턴

### 14-1. 5 phase 워크플로우

복잡한 변경 (mathlab 통합, prompt caching 등) 에 *plan mode* 매우 효과적:

1. **Phase 1 (Initial Understanding)** — 1~3 Explore agent 병렬. 각각 *다른
   관점*. `D:\mathlab` 같은 다른 프로젝트 탐색 시 *우리 프로젝트 절대 X*
   prompt 에 명시.
2. **Phase 2 (Design)** — 1~3 Plan agent. 사용자 의도가 명확하면 1 개 충분.
3. **Phase 3 (Review)** — Plan agent 가 인용한 *SDK 타입·파일 경로* 를 실제
   파일에서 grep 으로 검증.
4. **Phase 4 (Final Plan)** — `phase-bright-nygaard.md` 에 최종 결정 +
   변경 영역 + 회귀 방지 체크리스트.
5. **Phase 5 (ExitPlanMode)** — `allowedPrompts` 로 필요한 Bash 명령 권한
   미리 요청.

### 14-2. AskUserQuestion 의 효과적 사용

- 통합 정도 (전체 / 핵심 / 선택적 / 생략) 같은 *선택지* 가 명확할 때
- 의도 모호하면 *plan 작성 전* 질문 (plan 끝에는 ExitPlanMode 만)
- "사용자 결정" 카테고리: 단원별 함정 통합 정도, 학년 selector vs 자동 추정,
  fragment 구조 위치 등

### 14-3. 사용자 보고 사례를 *그대로* 인용하는 패턴

"동일 보고 2번 → prompt 에 사례 그대로 박기" (7-5 원칙) 의 *plan 의 변형*:
사용자가 한 번에 여러 보고 (max/min, 정답 정렬, 변수 도입 누락, 곱 부호
일관성 등) 던지면 *각 사례를 prompt 에 *별도 섹션* 으로* 박기. 한 줄 일반
지시문보다 사례 풀 인용이 훨씬 효과적.

---

## 15. 토큰 비용 측정 패턴

### 15-1. 실측 스크립트 (`token_est.mts`)

추정 (한국어 1글자 ≈ 0.5 token) 만으로는 부정확. *실제 build 된 prompt* 의
char 수 측정:

```ts
import { buildSolutionPrompt } from "./src/services/ai/prompts";
const full = buildSolutionPrompt(problem, grade);
console.log(full.length, "chars,", Math.round(full.length * 0.5), "tokens");
```

`npx tsx token_est.mts` 로 즉시 실행. 모든 학년 × 모든 시나리오 측정 후
스크립트 삭제 (one-shot).

### 15-2. 비용 모델

| 모델 | input | output | cache write | cache read |
|---|---|---|---|---|
| Sonnet 4.6 | $3/M | $15/M | $3.75/M | $0.30/M |
| Haiku 4.5 | $0.30/M | $1.50/M | — | — |

30 문제 시험지 (중1, mathDefense 통합 후): input 8,238 + output 1,500 평균.
- 도입 전: ~$1.00 / 시험지
- prompt caching 후: ~$0.54 / 시험지

### 15-3. 사용자 비용 질문 시 *각 단계 분리* 답변

OCR (Gemini 페이지 단위) + 해설 (Sonnet 문항 단위) 분리해서 합산. 각 단계의
token / 비용 / 절감 옵션 별도.

---

## 16. Step 4 Variant Pipeline 함정 카탈로그

이번 phase 구현 (Step 3 옵션 → Step 4 변형 검토 파이프라인, ~1,400 줄 신규
+ 4 파일 수정) 에서 부딪힌 함정 + 해결 패턴. *다음 fan-out hook + AI 서비스
조합 작업 시 첫번째로 읽을 섹션*.

### 16-1. 답 구조 검증 — caller withRetry × service throw 의 역할 분담

**증상 가설**: 객관식 5지선다를 변형했더니 모델이 4지선다로 emit. UI 가
choices index out of range 로 깨짐. 또는 주관식을 객관식으로 emit.

**root cause**: 모델은 *원본의 보기 개수* 를 prompt 로 받지만, output 토큰
한도 / context 잘림 / mathDefense 의 self-correction 권유 등으로 *답 구조*
까지 무의식적으로 변경할 수 있음. prompt 룰만으로 100% 보장 안 됨.

**3-layer 방어**:

1. **schema 강제** (`variantSchema.ts`):
   - `choices` 는 항상 `type: "array"` (`required` 에 포함). 빈 array `[]`
     (주관식) 또는 정확히 5 items (객관식) 만 허용.
   - schema 만으로는 *5 vs 4* 차이는 못 잡음 (둘 다 array). length validation
     은 caller 책임.

2. **service throw** (`variants.ts`):
   ```ts
   const expectedCount = input.choicesCount ?? 0;
   const actualChoices = Array.isArray(parsed.choices) ? parsed.choices : [];
   if (expectedCount !== actualChoices.length) {
     throw new Error(`변형 결과의 보기 개수가 원본과 불일치합니다 (원본 ${expectedCount} → 변형 ${actualChoices.length})`);
   }
   ```
   parse 직후 즉시 throw — *post-process 까지 도달 X*. caller 가 received
   exception 으로 retry 결정.

3. **caller `withRetry`** (`useVariantGen.ts`):
   ```ts
   const result = await withRetry(() =>
     generateVariant({ problem, goal, difficulty, grade, choicesCount }),
   );
   ```
   `withRetry` 의 maxRetries 4 (concurrency.ts 기본) 가 받음. 첫 실패 → 1~2
   초 backoff → 재시도. 모두 실패하면 `genError` 로 surfacing → VariantItem
   이 "재시도" 버튼 노출.

**원칙**: AI 출력의 *구조적 contract* 는 service layer 에서 throw 로 단단하게
verify. caller 는 retry 로직만 책임. UI 는 final genError 만 본다 — *3-layer
모두 책임 분리*.

### 16-2. `ProblemReview` optional 필드 — sessionStorage 자동 hydration

`wizardStore.ts` 의 `ProblemReview` 에 3 필드 추가 (`genError`, `genModel`,
`generating`). 모두 optional (`?:`).

**왜 optional 가 중요한가**: persist middleware 가 `sessionStorage` 에 저장
했던 *이전 schema 의 `problems`* 를 새 mount 에서 그대로 hydrate 한다. 새
필드가 *required* 면 `undefined` 가 들어가 TS 타입은 통과하지만 runtime
에서 `if (p.generating)` 같은 분기가 false 로 흘러 *silent bug*. optional
이면 `undefined` 가 의미적으로 명확.

**partialize 자동 포함** (3-1 함정 참고): `partialize: (s) => ({ problems:
s.problems, ... })` 가 spread 로 모든 필드 그대로 통과. 따라서:
- 신규 필드가 휘발성 (`generating: true` 같은 in-flight) 이면 `partialize`
  에서 명시적으로 strip — 새 mount 가 "생성 중…" 상태로 stuck 됨.
- 신규 필드가 영속성 (`genError`, `genModel`) 이면 그대로 둔다.

**현재 결정**: `generating` 만 strip 대상 — 그러나 effect-B 의 dispatched
Set 이 mount-lifetime 이라 *어쨌든 새 mount 면 false 로 reset 됨*. 별도
처리 불필요. `genError` 는 유지 — 사용자가 page refresh 후 "재시도" 버튼을
다시 볼 수 있어야 함.

**참고**: `src/stores/wizardStore.ts` `ProblemReview`.

### 16-3. byte-identical split 의 핵심 — 공유 헬퍼 *단일 source of truth*

`SOLUTION_PROMPT` (Step 2) 와 `VARIANT_PROMPT` (Step 4) 둘 다 Anthropic
prompt caching 적용. cacheable prefix 는 *byte-identical* 이어야 한다
(11-2 함정 참고).

**위험**: 같은 persona + mathDefense 를 *두 prompt 가 별도로 박으면* 한쪽
수정 시 다른 쪽 미반영 → 비용 1.4 배 (cache miss).

**해결**: `buildPersonaAndDefense(grade)` 공유 헬퍼 — `prompts.ts` module
top level. `buildSolutionPrompt` + `buildVariantPrompt` 모두 이걸 호출.
한 곳만 수정하면 두 prompt 가 자동 동기화.

검증 방법:
```ts
// 임시 assert (개발 중에만):
const a = buildSolutionPrompt(problem, "middle1");
const b = buildSolutionPromptBlocksAnthropic(problem, "middle1");
console.assert(b.map(x => x.text).join("") === a, "split mismatch");
```

VARIANT 의 경우 *21 학년-difficulty 시나리오 × 6.x goal-direct = 135 cases*
모두 verify. 한 번이라도 mismatch 면 cache key 가 부분 미스 → 비용 손해.

**원칙**: 새 prompt template 추가 시 *기존 prompt 와 공유할 prefix* 가 있다면
*반드시 헬퍼로 추출*. 복사-붙여넣기 절대 금지.

**참고**: `src/services/ai/prompts.ts` `buildPersonaAndDefense`,
`buildSolutionPrompt` / `buildVariantPrompt` / `*BlocksAnthropic`.

### 16-4. seed + dispatch 2-effect 패턴 (fan-out hook standard)

`useSolutionGen` / `useVariantGen` 의 표준 구조 — fan-out AI 호출 hook 의
정답 패턴 (1-6, 3-3 함정 모두 회피).

**effect-A (seed, mount 1회)**:
```ts
useEffect(() => {
  if (problems.length > 0) return;  // 이미 시드 또는 hydrate 됨
  const eligible = pages.flatMap(p => p.ocrResult)
    .filter(it => /* eligibility checks */);
  const seeded = eligible.map(it => ({ id, original, variant: original, status: "pending" }));
  setProblems(seeded);
}, [pages, problems.length, goal, setProblems]);
```

- `problems.length > 0` 가드는 *세션 복원* 케이스 보호. 새로고침 후 *기존
  problems* 가 hydrate 되면 reseed X.
- eligible filter 는 *시드 단계* 에서만. effect-B 가 받을 때는 이미 통과한
  것들만.

**effect-B (dispatch, problems 변경 시마다)**:
```ts
useEffect(() => {
  if (goal === "digitize") return;  // fast path
  for (const p of problems) {
    if (dispatched.current.has(p.id)) continue;
    if (p.status === "confirmed" || p.generating || p.genError) continue;
    if (p.status === "review" && p.variant !== p.original) continue;  // 이미 완료

    dispatched.current.add(p.id);
    updateProblem(p.id, { generating: true });
    void limit(async () => {
      if (!dispatched.current.has(p.id)) return;  // 취소 check
      try {
        const result = await withRetry(() => generateVariant({...}));
        if (!dispatched.current.has(p.id)) return;
        updateProblem(p.id, { variant, status: "review", generating: false });
      } catch (err) {
        updateProblem(p.id, { status: "pending", generating: false, genError: ... });
      }
    });
  }
}, [problems, goal, difficulty, ...]);
```

- *모든* dispatch 조건은 if-continue chain 으로. early-skip 으로 명확.
- `dispatched.add` 와 `updateProblem({generating:true})` 는 *limit() 호출
  직전*. 비동기 작업 시작 마커 + UI 즉시 반영.
- async 안에서 *await 직후마다* `dispatched.has(p.id)` 재체크 — 사용자
  중간 취소 / page change / unmount 대응.
- catch 안에서 `status: "pending"` 으로 되돌림 — VariantItem 이 *대기 중*
  대신 *재시도* 버튼 노출 (genError 가 truthy 라서).

**resetDispatch(id) + reseedAll() 콜백 export** — 1-6-a 와 동일 패턴.

**참고**: `src/hooks/useVariantGen.ts`, `src/hooks/useSolutionGen.ts`.

### 16-5. digitize fast path — 호출 0 / 비용 0

사용자가 Step 3 옵션에서 `goal: "digitize"` 선택 시: OCR 결과를 *그대로*
사용 (변형 X). AI 호출 0, 비용 0.

**구현 위치**: `useVariantGen` effect-A 의 seed 단계.
```ts
const isDigitize = goal === "digitize";
const seeded = eligible.map(it => ({
  id: it.id,
  original: ocrToGenerated(it),
  variant: ocrToGenerated(it),
  status: isDigitize ? "confirmed" : "pending",
  generating: false,
}));
setProblems(seeded);
```

effect-B 의 첫 줄 `if (goal === "digitize") return;` — fast exit. 사용자가
*전체 자료 확정* 상태로 Step 4 진입.

**원칙**: AI 호출 비용은 *기본값* 이 아니다. 사용자 옵션이 *결과를 안 바꾼다*
면 호출 0 path 명시. fast path 가 코드의 *첫 줄* 에 와야 가독성·실수 0.

### 16-6. 도형 미변형 정책 (사용자 결정 — 이번 phase)

`OCRProblem.images.length > 0` 인 *도형 포함 문항* 의 처리:
- **현재**: 원본 도형 그대로 사용. `diagramSVG: null` 로 emit.
- **UI**: VariantItem 헤더에 `<Chip tone="soft">도형 미변형</Chip>` —
  사용자에게 "이 문항은 도형이 변형되지 않았음" 명시.

**prompt 강제** (VARIANT_PROMPT):
- "diagramSVG: null 로만 emit. 도형 SVG 직접 그리지 마세요."
- schema `diagramSVG: { type: ["string", "null"] }` + post-process 에서
  null 외 값은 무시.

**왜 도형 변형은 *후속 phase***:
- SVG 재생성은 별도 reasoning task — Sonnet 으로는 부족, GPT-5.5 / Opus
  필요 (1-5 참고)
- 비용 ~2 배 + 품질 평가 필요
- 도형 *동등성* 검증 (변형 후에도 원본과 같은 답이 나오는지) 미정의

**참고**: `src/components/wizard/VariantItem.tsx` `hasDiagram` chip,
`src/services/ai/prompts.ts` VARIANT_PROMPT R7 룰.

### 16-7. 옵션 변경 후 재생성 — 버튼 only (다이얼로그 X)

사용자가 Step 4 진입 후 Step 3 으로 돌아가 옵션 (goal / difficulty / extras)
변경 → Step 4 재진입 시:
- **현재 정책**: 기존 problems 그대로 유지. 사용자가 *명시적으로* "옵션 재생성"
  버튼 누를 때만 reseed.
- **사용자 결정 이유**: 자동 reseed 는 *부주의한 옵션 변경* 으로 기존 작업
  날려먹는 위험. confirm 다이얼로그 path 는 UX 흐름 끊김.

**구현** (Step4Review):
```tsx
<Btn icon="arrow-clockwise" onClick={() => {
  if (window.confirm(`현재 옵션 (${goal} / ${difficulty}) 으로 모든 문항의 변형을 다시 생성합니다. 기존 변형 결과는 사라집니다. 계속하시겠습니까?`)) {
    reseedAll();
  }
}}>
  옵션 재생성
</Btn>
```

`reseedAll()` 이 dispatched.current.clear() + setProblems([]) 호출 → effect-A
가 빈 problems 감지 → 새 옵션으로 재시드. 자연스럽게 effect-B 픽업.

**향후 폴리시**: 다이얼로그를 `ModalShell` 로 교체 (브라우저 native confirm
은 UX 빈약). 일단 `window.confirm` 으로 빠르게.

### 16-8. Step 3 problemCount 정확화 — 시드 필터와 일관성

`Step3Options.tsx` 의 미리보기 카드의 `problemCount` (예상 문항 수) 가
*useVariantGen 의 eligible filter 와 동일* 해야 한다. 다르면:
- Step 3 에서 "30 문항" 으로 보이다가 Step 4 진입 후 "15 문항" — 사용자 혼란
- "변형 불가 N개 (OCR 결손)" chip 누락

**해결** (Step3Options L149-155):
```ts
const problemCount = useMemo(() => {
  const items = pages
    .filter(p => p.isProblemPage || p.forceOcr)
    .flatMap(p => p.ocrResult)
    .filter(it => it.text && !it.bodyMissing && !it.choicesMissing
                  && it.solution && !it.solutionError);
  return items.length > 0 ? items.length : 0;
}, [pages]);
```

`useVariantGen` 의 eligible filter 와 *byte-identical*. 새로 필터 룰 추가
시 *두 곳 모두 수정*. (또는 `lib/eligibility.ts` 헬퍼 추출.)

### 16-9. VARIANT_PROMPT 의 4×3 directive matrix

`goal` (4-way) × `difficulty` (3-way) = 12 시나리오. prompt 안에 *명시 텍스트*
로 모두 박았음:

| goal | 설명 |
|---|---|
| `digitize` | (호출 X — fast path) |
| `similar` | 같은 단원 / 같은 유형 / 숫자만 변경 |
| `variant` | 같은 단원 / 다른 유형 / 핵심 개념 유지 |
| `targeted` | 특정 단원 강화 (extras 기반) |

| difficulty | 설명 |
|---|---|
| `easier` | 더 단순한 단계로 |
| `same` | 원본과 동등 |
| `harder` | 더 복잡한 단계로 |

prompt 안에서 `goalDirectiveText(goal)` + `difficultyDirectiveText(difficulty)`
헬퍼가 placeholder 치환. *각 case 별로 다른 instruction* 필요 시 헬퍼 안에서
switch.

**중요**: 12 시나리오 × 학년 7 × 문제 유형 N → 백만 case. *prompt 룰* 만으로
못 잡는 edge case 발생. 사용자 보고 사례 박는 패턴 (7-5) 으로 점진 보강.

**참고**: `src/services/ai/prompts.ts` `goalDirectiveText`,
`difficultyDirectiveText`, VARIANT_PROMPT.

### 16-10. extras (함께 만들 자료) 의 deferred semantics

Step 3 의 *함께 만들 자료* row (단원평가 / 진단평가 / 학습지 / 학습체크리스트)
는 *현재 미구현 placeholder*. Toggle 만 작동, 실제 별도 자료 생성 X.

**현재 동작**: extras 선택 정보는 store 에 저장. Step 4 변형 생성 결과에
영향 없음. *옵션 재생성* 시에도 무시.

**왜 placeholder**:
- 단원평가·진단평가는 *별도 prompt + 별도 schema* 필요. 변형 prompt 와 다름.
- 학습지·체크리스트는 출력 포맷이 다름 (PDF / DOCX 별도 layout).
- Step 5 (export) 구현 시 통합 — 변형 검토 끝난 후 *다른 자료 추가 생성*.

**원칙**: deferred 기능의 UI 는 Toggle 만 두고 *실제 효과는 후속 phase*.
사용자에게 "준비 중" tooltip 으로 명시. 가짜 동작 만들지 말 것 — 디버깅
어렵고 *실제 구현 시 backward compat* 문제.

---

## 17. Wizard 6 단계 상태

- **Step 0 (업로드)**: PDF → IndexedDB 이미지 + 자동 회전 감지 ✅
- **Step 1 (OCR)**: 페이지별 multi-problem 추출, 폴백 체인, 회전 적용 ✅
  + 진행 가시성 (모델·경과 시간·대기 상태 thumbnail 표시) ✅
- **Step 2 (해설)**: 단계별 해설 + 정답 자동 생성 (Sonnet 4.6) ✅
  + 진행 가시성 (SolutionItem 대기/생성 구분 + 경과 시간) ✅
  + 정확도 runtime validator (Pattern J 위반 warning banner) ✅
- **Step 3 (옵션)**: 변형 옵션 UI ✅, extras (단원평가/통계) deferred 🟡
- **Step 4 (검토)**: 문항별 원본·변형 비교 ✅
  + 진행 가시성 (VariantItem 대기/생성 구분 + 경과 시간) ✅
- **Step 5 (내보내기)**: PDF (jsPDF + html2canvas) + 인쇄 + 4 templates ✅
  + DOCX 🟡 (후속 phase)

## 18. 심각 오류 카탈로그 — 재발 방지 (이번 phase 누적)

이번 phase 에서 사용자 보고로 *반복 발생* 한 심각 오류들. 같은 함정에 다시 빠지지
않도록 *코드 + prompt + 후처리 + UI* 4 단으로 강제. 새 기능 추가 시 이 섹션 먼저 읽을 것.

### 18-1. Windows 멀티 vite dev — 같은 port 동시 listen (4 차 진단)

**증상** (사용자 보고 4 차에 걸친 함정): mathg-gen vite dev 서버가 *다른
프로젝트가 점유 중인 3000 port* 에 **또 listen** 성공. process 목록 확인 시
*두 node 가 같은 3000 port* listening. 브라우저 접근 시 어느 게 응답할지 비결정.

**Root cause (단계별 진단)**:
1. **vite 의 strictPort 기본 false** 가 fallback 한다고 *가정* — 실제론 다른 이유로 실패.
2. **host: "0.0.0.0" + Windows SO_REUSEADDR** — 두 vite 가 *EADDRINUSE 안 뜨고* 둘 다 listen 성공.
3. **host: "localhost" 로 바꿔도** — IPv4 (`127.0.0.1`) 와 IPv6 (`::1`) binding 이 다른 socket 으로 처리되어 충돌 미감지.
4. **`net.createServer().listen(p, "0.0.0.0")` 사전 검사** 도 부족 — Next.js Turbopack 의 `::` (IPv6 dual-stack) 와 충돌 안 잡힘.

**최종 해결** (`vite.config.ts`):
- `findFreePort(start)` 가 *IPv4 + IPv6 둘 다* listen 시도.
- 어떤 binding 이든 EADDRINUSE 면 다음 port.
- 빈 port 보장 후 `strictPort: true` 로 잠금.

```ts
const tryListen = (port, host) =>
  new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(port, host);
  });

const findFreePort = async (start, max = 30) => {
  for (let p = start; p < start + max; p++) {
    if (!(await tryListen(p, "0.0.0.0"))) continue;
    if (!(await tryListen(p, "::"))) continue;
    return p;
  }
  return start;
};
```

**원칙**: 멀티 인스턴스 / 멀티 프로젝트 환경에서 port 자동 fallback 이 필요하면
*vite 의 strictPort 기본동작에 의존 X* — 명시적 net 모듈 검사 + IPv4·IPv6 양쪽
확인. `host: "0.0.0.0"` 는 Windows 에서 SO_REUSEADDR 함정 → `localhost` 추천.
LAN 접근 필요 시 `--host 0.0.0.0` 명시.

### 18-2. KaTeX 분수 크기 일관성 — `\frac` → `\dfrac` 강제 업그레이드

**증상**: 같은 식 안에 분수 크기가 *들쭉날쭉*. 대분수 안 `\frac{2}{3}` 와 진분수
`\frac{1}{2}` 가 다른 크기. `\displaystyle` prefix 가 *식 중간에 reset* 되거나
*multi-path 누락* (CLAUDE.md 2-17 패턴).

**기존 코드의 잘못된 가정**: mathlab 의 `\dfrac` → `\frac` *다운그레이드* 가
"KaTeX fontdimen 부족" 우려로 박혔는데, **KaTeX 0.16.35 + 번들 woff2 폰트**
환경에서는 `\dfrac` 정상 작동. 오히려 inline 모드에서 작은 사이즈 함정만 남음.

**해결** (`textPreprocess.ts` `applyMathInnerNormalization`):
- `\dfrac` → `\frac` 다운그레이드 **제거**.
- `\frac` → `\dfrac` **업그레이드** 추가 (improperToMixed 다음, injectDisplayStyle 이전).
- `\tfrac` (textstyle 강제) 는 모델 명시 의도 보존 — 매치 안 함.

```ts
// improperToMixed 다음에:
s = s.replace(/\\frac(?![a-zA-Z])/g, "\\dfrac");
```

**효과**: `\dfrac` 가 *문맥 무관* displaystyle 크기 분수 강제 → inline 모드의 작은
사이즈 함정 회피. injectDisplayStyle 보조 안전망 유지 (큰 연산자 `\sum`/`\int` 용).

**원칙**: KaTeX 의 inline vs display 사이즈 분기를 *문맥 통제* 로 해결하려 하지
말 것 — 환경 의존성 (multi-path) 으로 깨짐. `\dfrac` 같은 *명시적 강제 명령* 으로
일관성 잠금.

### 18-3. `[xxx]` 박스 가드 — 동작 명사 카탈로그 누락 함정

**증상**: 풀이 안 sub-section 라벨 `[절댓값 분해]` 같은 형태가 *대시드 박스*
(`diagram-placeholder` pill) 로 잘못 렌더. MarkdownRenderer 의 `LABEL_SUFFIXES`
가드가 "경우 / 단계 / 조건" 등 일부 키워드만 잡고 *동작 명사* 누락.

**해결** (`MarkdownRenderer.tsx` `LABEL_SUFFIXES`):
- 한국어 풀이 sub-section 라벨로 자주 등장하는 *동작 명사* 일괄 추가:
  - 분해 / 변환 / 분리 / 계산 / 분석 / 정리 / 비교
  - 검토 / 확인 / 정의 / 증명 / 결론 / 검증 / 전개
  - 치환 / 대입 / 소거 / 이항 / 약분 / 통분
  - 풀이 / 해석 / 표기 / 표현 / 표시

**원칙**: `[xxx]` 가드는 *exclude list* 패턴이라 *새 형태* 의 라벨이 등장하면 또
누락. 사용자 보고 *그 즉시* 카탈로그에 추가. 또는 *include list* 로 전환 (`[그림N]`,
`[한글 도형 설명]` 만 박스화) — 후속 검토.

### 18-4. 해설이 *생각 과정 자체* — trial-and-error 재발 방지 (CRITICAL)

**증상** (재발): 사용자 보고 *3 차* — "324 = 2² × 3⁴..." 부터 시작해 "가능한 □
합 = 847 인데 선택지에 없으므로 *조건을 재검토한다*" 거쳐 *처음부터 다시* "21 ×
□의 ... 따라서 b ≤ 3 ... = 280" 까지 *오답 → 재해석 → 정답* 전 과정 그대로 노출.

**근본 한계**: CLAUDE.md 7-6 의 *금지 표현 카탈로그* 가 이미 있는데도 모델이
*새로운 표현* 으로 우회. "조건을 재검토", "선택지에 없으므로", "그런데 ...
이므로", "처음부터 다시" 등.

**강화** (`SOLUTION_PROMPT`):
- *추가 금지 표현* — 위 4 종 명시.
- **장황한 조건 도출 과정 자체 금지** — 문장형 조건 풀이 → *수식 한 줄* 압축.
- 사용자 사례 2 (장황 분석 + 재시작) 의 *실제 출력 전문* 인용 + *6~8 줄* 올바른
  압축 풀이 비교.

```
잘못된 출력: "최소공배수가 ~이 되려면 ~의 소인수는 ~만 가능하고, 지수는 정확히
~ (이미 ~에 ~이 있으므로 ~)" 같은 문장형 풀이 → 6+ 줄.

올바른 풀이: "□ = 2^a × 3^b 꼴 (a ≤ 2, b ≤ 3). ∵ 7은 21에 이미 있으므로 □에
없어야 하고, 3의 지수는 1+b ≤ 4 이므로 b ≤ 3."  ← 2 줄.
```

**원칙**: 모델 출력 *형식 통제* 는 일반 룰보다 *(a) 금지 표현 카탈로그 + (b)
사용자 실제 잘못된 출력 + (c) 올바른 압축 비교* 3 종 세트가 가장 효과적
(CLAUDE.md 7-5 패턴). 새 사용자 보고 → 카탈로그에 *즉시 추가*.

### 18-5. "서로 다른 N 개" 조건 위반 — Pattern J + runtime validator harness

**증상** (CRITICAL): "서로 다른 세 정수의 곱 = -50" 문제에서 정답에 *-48*
포함. -48 = (-50) + 1 + 1 = -48 의 튜플 *(-50, 1, 1)* 은 **1 이 두 번** 들어가
*서로 다름 위반*. Pattern B (조기 제외 금지) 의 *역방향 함정* — case 살려놓고
*부호 배정 후* set 크기 미검증.

**3 단 방어선** (사용자 요청 "강력하게 + 하네스화"):

#### (1) mathDefense.ts — *Pattern J 신규* (set-distinct post-assignment)
- 절댓값 분해에 중복 있을 때 부호 배정 case 유효성 룰:
  - 절댓값 중복 a 둘 → *서로 다른 부호* 만 유효 (a, -a 가 다름)
  - 같은 부호 두 개 → 무효
- 각 case 마다 `|{n₁, n₂, n₃}| === 3` *명시적* 검사 강제.
- 사용자 실제 사례 (-50, 1, 1) → -48 풀이 그대로 인용.

#### (2) SOLUTION_PROMPT — V5 자가 점검 + STRICT 룰
- "서로 다른 N 개" 조건이면 풀이 *모든* 튜플 `(...)` / `\{...\}` 의 set 크기 검사.
- *각 case 명시적 set 크기 적기* 강제 (예: "{-50, 1, 1}: 원소 2 개 → 무효").

#### (3) `lib/solutionValidator.ts` 신규 — Runtime harness
```ts
validateDistinctTuples(problemText, solutionText): SolutionWarning | null
```
- problem 본문에서 "서로 다른 N" / "모두 다른" 키워드 + N 추출 (한국어 수사
  한/두/세/네... + 아라비아 숫자).
- solution 본문에서 정수 튜플 추출 (괄호 / 중괄호, 음수 OK, 변수 섞이면 제외).
- 각 N-튜플의 set 크기 < N 인 것 카운트 → SolutionWarning.

#### (4) `SolutionItem` warning banner
- `solutionWarnings` 있으면 카드 헤더 chip *"정확도 검증 실패 가능성"* (warn tone)
- 카드 border warn ring + 답 직전 warn-soft banner + `<details>` collapsible
- 답 *무효화 X* (false positive 위험) — 사용자가 본문 확인 후 재생성 결정

**원칙**: AI 출력의 *정확도* 는 prompt 만으로 100% 보장 불가. *명백한 오류
패턴* (Pattern J 같은) 은 runtime 휴리스틱으로 검출 → 사용자에게 *시각 경고*.
답 자동 무효화는 false positive 위험으로 안 함 — 사용자 판단 위임. 후속: 자동
재생성 1 회 시도 옵션.

### 18-6. `\n\n` literal 노출 — JSON escape 후보정 (sanitize)

**증상**: 서술형 4번 본문에 "풀이과정을 쓰시오.\\n\\n(단, A > B이다.)" 가
화면에 *`\n\n` 두 글자* 그대로 노출. 모델이 JSON wire 에서 `\\\\n\\\\n` 처럼
*한 번 더 escape* 해서 JSON.parse 후에도 literal `\n\n` (백슬래시 + n) 가
남음.

**해결** (`sanitize.ts` `sanitizeText` 마지막 단계):
```ts
return wrapped
  .replace(/\\n\\n/g, "\n\n")              // markdown paragraph break
  .replace(/\\n(?![a-zA-Z])/g, "\n")       // 단일 \n (LaTeX 명령 보호)
  .replace(/\\t(?![a-zA-Z])/g, "\t");      // \t 도 동일
```

- `(?![a-zA-Z])` lookahead 로 `\nabla`, `\ne`, `\neq`, `\not`, `\theta`, `\times`
  같은 LaTeX 명령 보호.
- `\\n\\n` 연속은 markdown paragraph break 로 우선 변환.

**원칙**: 모델 출력에서 *control char escape 사고* 는 자주 발생.
`fixLatexEscaping` 이 *반대 방향* (`\t` → `\\t` 보호) 도 처리하므로 충돌 없게
`sanitizeText` 의 *마지막 단계* 에서 literal → newline 변환. 추가로 사용자 보고
시 sanitize 강화 패턴 (CLAUDE.md 2-6 의 `fixLatexEscaping` 과 같은 패턴).

### 18-7. 진행 가시성 — Step 2/3/4 일관 패턴

**증상** (사용자 보고): OCR pg-3 가 *큐 대기* 인데 *stuck* 으로 오인. Step 3
해설 / Step 4 변형도 어떤 항목이 *진행* 인지 *대기* 인지 구분 안 됨.

**일관 패턴 도입**:
- **WizardPage.ocrStartedAt** / **OCRProblem.solutionStartedAt** /
  **ProblemReview.generatingStartedAt** — worker 가 *limit() async fn 첫 줄* 에서
  set, 완료 시 unset. 모두 partialize 에서 strip (휘발성).
- **`generating: true` vs `startedAt`** — generating 은 dispatched 직후 즉시
  (큐 대기 포함). startedAt 이 있어야 *실제 in-flight*. 두 상태 시각 구분.
- **1초 tick hook** — 카드/thumbnail 이 in-flight 일 때만 활성, idle 시 정리.

**UI 시각화**:
| 상태 | 표시 |
|---|---|
| 진행 중 (`generating + startedAt`) | spinner + 모델 짧은 이름 + 경과 시간 ("12s") |
| 대기 중 (`generating` only) | hourglass-medium 아이콘 + "다른 ~ 처리 후 시작" |
| 완료 | result 표시 |
| 에러 | warn icon |

**concurrency 분리** (`usePageOcr.ts`):
- `pass1Limit = pLimit(3)`, `pass2Limit = pLimit(1)` — Pass2 (느린 GPT-5.5) 가
  Pass1 슬롯 잠식 X. 3 페이지 시험지 시간 약 50% 단축.

**원칙**: AI 호출 fan-out 마다 *시작 timestamp* 필드를 분리해야 *대기 vs 진행*
구분 가능. 단일 `generating: boolean` 만으로는 사용자가 정상 큐를 stuck 으로
오인. 모든 fan-out hook (usePageOcr / useSolutionGen / useVariantGen) 동일 패턴.

---

## 19. 후속 phase 후보

### 19-1. Production 진입 필수
- **Phase G — Supabase Auth** — 이메일 / OAuth 로그인. `DEV_USER_ID` → `auth.uid()` 자연 전환 (RLS 정책 이미 대응 — schema.sql L138). Auth UI + onboarding 흐름 추가. ~600줄.

### 19-2. 비용 / 정확도 보강
- **cropped Pass 2 — 호출 자체 절감** — 현재 페이지 단위 Pass 2 (GPT-5.5) 호출. Pass 1 결과의 도형 bbox union 으로 cropped image 만 Pass 2 입력 → vision token 30-50% 절감. ~400줄 + bbox 좌표계 역변환 주의. 크롭 정확도 사전 검증 하니스는 §20.
- **도형 vector 정확도 검증 데이터 수집** — Phase F (OCR Tier 2) + Phase I (raw SVG 메인) 적용 후 *실제 PDF* 테스트로 [diagram] 검증 로그 확인. issue 패턴 발견 시 prompt 의 *부정 예시* 보강.
- **DiagramParams 재활성화 검토** — 현재 OCR_PAGE_SCHEMA 에서 *완전 제거* (OpenAI strict 호환 위해). raw SVG 가 충분히 정확함을 검증 후, *교사 편집 기능* 필요 시 strict: false 모드 + schema 재추가 또는 *완전 specified 필드* 로 재활성.
- **runtime validator 확장** — sign-parity (Pattern I), ascending-order, set-distinct (이미 J 부분 적용)

### 19-3. UX / 출력
- **DOCX 내보내기** (`docx` 라이브러리 또는 html-docx-js) — 교사 요청 잦음. SVG/KaTeX → PNG 변환 후 이미지 삽입 (Tier 2 패턴).
- **HWP 내보내기** (한국 학교 표준, 라이브러리 부족 — 후순위)
- **인쇄 프리셋 localStorage** (mathlab `mathlab_print_preset` 패턴)
- **워터마크 / 학원 로고** (인쇄 시 옅게)

### 19-4. 작은 개선
- **task #41 — OCRItem 카드별 모델 선택 + 재실행 메뉴** — item 별 Pass 2 trigger 또는 Sonnet 으로 강제 OCR
- **task #31 — 브라우저 verify (SVG 크기 + 표 줄바꿈)**
- **Windows 콜론 파일명 처리** — `migrated_prompt_history/prompt_*T*Z.json` 같은 ISO timestamp 파일이 Windows 체크아웃 실패. `.gitattributes` 또는 *cross-platform safe naming* 으로 마이그레이션.
- **Step 5 PDF 출력의 KaTeX 깨짐** — html2canvas → jsPDF 경로의 폰트 / SVG 누락. Puppeteer headless print 또는 react-pdf 검토.

### 19-5. 인쇄 6 신규 template 후속 (commit `a127535` 후)
- **PrintMeta 의 학교명 / instructorName / conceptNote / patternName / patternStrategy / examDate / examDuration / academyName UI 입력** — 현재 빈 string fallback. PrintOptionsPanel 의 *고급 옵션* accordion 으로 텍스트 필드 6~8 개. wizardStore 의 `printOptions` 에 직접 추가 또는 별도 `printMeta` 필드.
- **template 별 폰트 크기 미세조정** — `estimateProblemHeight` 의 charsPerLine / lineH 가 6 신규 template 의 실제 폰트 크기 (pyeongga 13.2, jeongtong 13.5, modern 13.5, workbook 12.5/11.5, jaseup 12.5/11.5, yuhyung 12.5/11.5) 와 일치하도록.
- **WorkbookTemplate / JaseupTemplate 의 풀이공간 dynamic sizing** — flex:1 stretch 만으로 부족 시 페이지당 문항 수 더 정밀 추정. 현재 `getPageContentHeight(workbook, 1단) = 720` 보수적.
- **paper accent 색 (navy / red / gold / slate) 을 PrintOptionsPanel COLORS 에 추가** — 현재 mathg-gen 의 8 색만. 신규 6 template 의 `TEMPLATE_DEFAULT_ACCENT` 와 일치하는 4 색 추가.
- **첫 페이지 헤더 영역 실제 DOM measure 로 동적 추정** — 현재 `getPageContentHeight(template, columns, isFirstPage)` 가 *고정 차감값* (jeongtong -240, modern -240, pyeongga -100, yuhyung -100, workbook/jaseup -120). 사용자가 PrintMeta 의 conceptNote 채우면 jaseup 의 헤더가 *더 길어짐* → 부정확. ResizeObserver 또는 ref.current.offsetHeight 로 실측.
- **legacy 시험지 hydrate 회귀 자동 테스트** — `matchLegacyTemplate` 의 6 매핑 (exam/default/minimal/classic + mathlab 4) Vitest 또는 임시 스크립트.
- **Puppeteer PDF 에서 Google Fonts 로딩 보장** — `page.waitForFunction(() => document.fonts.ready)` 호출 추가. 현재 시스템 폰트 fallback 으로 떨어질 가능성. `/api/export-pdf.ts` 수정.
- **KoPub 폰트 self-host** — 시험지·교과서 표준이지만 Google Fonts 미지원. 한국출판인협회의 WOFF2 다운로드 → `public/fonts/kopub-batang.woff2` + `globals.css` `@font-face`. fontPack 추가.
- **PrintableHeader.tsx / PrintQuestionBlock.tsx 파일 삭제 (실제 unlink)** — 이미 commit `a127535` 에서 *git rm* 완료. 향후 IDE 캐시 잔재 정리 시 grep 확인.

---

## 20. 크롭 검출 / 크롭 테스트 페이지 (?croptest)

"cropped Pass 2" (문항을 개별 크롭해 도형·난문항만 재OCR — §19-2) 본구현 전, 크롭
정확도를 눈으로 측정하는 테스트 하니스. 프로덕션 OCR (`ocr.ts`/`prompts.ts`) 무수정.

- `src/services/ai/cropDetect.ts` — `detectCropBoxes(pageBase64)` Gemini 3 Flash
  structured-output 단일 호출. 페이지에서 문항별 크롭 박스 검출.
- `src/screens/CropTestScreen.tsx` — `?croptest` URL gate. 보관함/PDF 두 소스 →
  검출 → % 오버레이 → 크롭 미리보기 → 크롭 재OCR → 기존 whole-page 결과 비교.
- `App.tsx` `route` union 에 `"croptest"` 추가 (AuthGate 우회, `?katex` 동일 패턴).

### 20-1. 크롭 경계 규칙 (CROP_DETECT_PROMPT)

한국 시험 문항은 또렷한 텍스트 마커로 경계가 잡힘:
- 객관식: [문항번호 → 마지막 보기 ⑤ 행]. 도형은 항상 번호와 보기 사이 → 박스 포함.
- 단순 서술형: [번호 → (N점) 배점 마커].
- 분할 서술형: [번호 → 하위 배점 누적이 [총 N점] 도달하는 마지막 하위문항]. 하위
  문항 전체가 ONE 박스.

### 20-2. 크롭 박스 여백 보정 — 컬럼 인지 + 동적 분류 (CRITICAL)

검출된 raw 박스는 실제 내용보다 안쪽으로 잡히는 경향 → 사용자 "우측 짤림" 보고.
여백 후처리를 추가하며 부딪힌 함정 3 가지:

**(a) 프롬프트 지시 + 결정적 후처리는 *합산* 된다.** 프롬프트에 "우측 ~45 units
패딩" 을 넣고 *동시에* 후처리로 `xMax + 35` → 총 80 → 1단 박스가 중앙 거터를 넘어
2단 침범. **원칙**: 결정적 후처리가 있으면 프롬프트는 같은 수치를 *올리지 말 것* —
한쪽이 단독 책임. 프롬프트는 "내용 끝까지 정확히" 같은 *정확도* 지시만, 여유 마진은
후처리 단독.

**(b) 좌측 확장은 항상 안전, 우측 확장은 위험.** 박스 왼쪽엔 항상 빈 공간 (페이지
좌측 여백 또는 단 사이 거터) → `xMin` 을 줄여도 흰 여백만 더 들어옴. 반면 1단 박스의
`xMax` 를 키우면 거터를 넘어 2단 *본문* 을 침범. → 좌측 패딩 넉넉히 (`LEFT_PAD` 25),
우측 보수적 (`RIGHT_PAD` 15).

**(c) 단 경계는 시험지마다 다르다 — 고정값 금지.** 처음 `PAGE_MIDLINE = 500` 으로
1/2단을 갈랐으나 시험지마다 단 경계 위치·좌우 폭이 제각각 → 오분류. **해결 —
`estimateColumnSplit`**: 검출 박스들의 `xMin` 을 정렬해 *최대 간격* 탐색. 한 컬럼
문항들은 같은 좌측 여백에 정렬돼 `xMin` 이 좁게 뭉치므로 (흔들림 <50), 2단이면 두
무리 사이에 큰 간격 (400+) 발생. 간격 ≥ `COLUMN_GAP_MIN` (200) → 2단 (간격 중점이
분할선), 미만 → 단일 컬럼 (전부 1단 취급 → 모두 좌측 패딩). 페이지마다 그 페이지
박스에서 계산하므로 단 경계가 480·520·비대칭이든 자동 적응.

**원칙**: 페이지 레이아웃 의존 파라미터 (단 경계, 여백 폭) 는 *고정 상수로 박지 말고*
검출 결과에서 동적 산출. 정규화 0–1000 그리드라 임계값 (`COLUMN_GAP_MIN`) 자체는
해상도 무관 고정 가능.

**참고**: `src/services/ai/cropDetect.ts` `estimateColumnSplit` / `padCropBox`.

---

## 21. 인쇄 6 신규 template 구현 함정 카탈로그 (commit `a127535`)

`design_handoff_print_templates` (6 standalone 컴포넌트) 를 Mathgen 에 통합하면서
부딪힌 함정 + 해결 패턴. 다음 *template 신규 추가* 또는 *PrintOptions 확장* 작업
시 첫번째로 읽을 섹션.

### 21-1. PrintTemplate union 교체 시 *cascade type error* 의 합리적 처리

`wizardStore.PrintTemplate` 의 4 → 6 신규로 교체하면, 기존 `PrintableHeader` /
`PrintQuestionBlock` / `PrintOptionsPanel` 의 `"exam"` / `"default"` 등 *legacy
문자열 비교* 코드가 *7+ 곳* 동시 type error.

**잘못된 접근**: Phase B (union 만) 끝나고 commit → CI build 깨짐 → bisect 어려움.

**정답**: *한 PR 안에서 Phase A~D 묶음 commit*. 순서:
1. Phase A — 신규 인프라 (tokens / types / 6 template) — 영향 0.
2. Phase B — wizardStore union 교체 (Phase A 의 types.ts re-export).
3. Phase C — PrintOptionsPanel TEMPLATE_OPTIONS 6 개 — legacy 문자열 제거.
4. Phase D — Step5Export 의 PageBody dispatcher 화 — PrintableHeader /
   PrintQuestionBlock import 제거. 둘 다 *`git rm`* (파일 삭제).

Phase B 의 *중간 type error 7건* 는 정상. Phase D 끝나야 모두 clean. tsc 통과
확인은 Phase D 후 1회.

### 21-2. `declare const ProblemBody` placeholder 카피 패턴

design_handoff 의 6 template 안에 `declare const ProblemBody: React.FC<{...}>;`
placeholder. 카피 시 *각 파일에서* 다음 변환:
- `declare const ProblemBody` 줄 삭제
- 상단에 `import { ProblemBody } from "./ProblemBody";` 추가
- 호출부 prop name 유지 (`<ProblemBody problem={p.variant} fontSize={N} />`) —
  Mathgen 의 ProblemBody.tsx 의 시그니처도 `problem` 으로 통일

**원칙**: 외부 design handoff 의 placeholder 가 있으면 *그 시그니처를 그대로
유지* 한 새 컴포넌트 신설. design 코드를 *Mathgen 컨벤션에 맞춰 rename* 하면
카피 비용 ↑.

### 21-3. 순환 import — wizardStore ↔ types.ts (type-only OK)

`types.ts` (print template 공통 타입) 가 `wizardStore` 의 `ProblemReview` /
`PrintOptions` import. 동시에 `wizardStore` 가 `types.ts` 의 `PrintTemplate`
import (re-export 패턴):
```ts
// wizardStore.ts
export type { PrintTemplate } from "@app/components/print/types";
import type { PrintTemplate } from "@app/components/print/types";
```

**핵심**: 양방향이지만 *모두 type-only import*. TypeScript 가 runtime
dependency 없는 type 사이클 허용 → compile OK. runtime value import (예:
`import { someValue }`) 면 ESM 순환 → undefined 또는 crash.

**원칙**: type 만 정의하는 *types.ts* 파일은 *상태 (store) 와 양방향 type
import OK*. 단 runtime helper / constant 는 *반대 방향만* 두라.

### 21-4. CSS variable 의 React style inline 타입 cast

폰트 팩 동적 적용 — `style={{ "--paper-font-serif": "..." }}` 가 React 의
`CSSProperties` 와 mismatch (strict 에서). cast 필요:
```tsx
const fontVars = {
  "--paper-font-serif": fontPack.serif,
  "--paper-font-sans": fontPack.sans,
} as CSSProperties;
return <div style={fontVars}>...</div>;
```

`as CSSProperties` 가 CSS variable key (`--*`) 를 통과시킴. `as React.CSSProperties`
도 가능하지만 named import (`import { type CSSProperties } from "react"`) 가
더 깔끔.

### 21-5. inline `fontFamily` → CSS variable 일괄 변환 (sed 패턴)

6 template × 50+ 곳의 `fontFamily: PAPER_FONTS.serifKR` → `"var(--paper-font-serif)"`.
sed 일괄:
```bash
for f in src/components/print/templates/{Pyeongga,...}Template.tsx; do
  sed -i 's|fontFamily: PAPER_FONTS\.serifKR|fontFamily: "var(--paper-font-serif)"|g' "$f"
  sed -i 's|fontFamily: PAPER_FONTS\.sansKR|fontFamily: "var(--paper-font-sans)"|g' "$f"
  sed -i 's|fontFamily: PAPER_FONTS\.mono|fontFamily: "var(--paper-font-mono)"|g' "$f"
done
```

**원칙**: 동일 패턴이 *5+ 파일에 반복* 되면 sed 가 Edit 보다 *훨씬 빠름*. 단
sed 의 string match 가 *정확* 해야 — `PAPER_FONTS\.serifKR` 의 `\.` escape +
`g` flag (global) 필수. sed 후 `grep -c` 로 변환 count 검증.

추가로 *PAPER_FONTS unused import* 도 sed 로 정리:
```bash
sed -i 's|import { PAPER_COLORS, PAPER_FONTS, A4_DIM }|import { PAPER_COLORS, A4_DIM }|g'
```

### 21-6. 첫 페이지 vs 이후 페이지 *가용 높이 불일치* (CRITICAL)

**증상** (사용자 보고): "5번 문항처럼 너무 하단처럼 내려온건 다음페이지로
가야겠는데? 하단에 페이지번호가 안보일정도야."

**원인**: `getPageContentHeight(template, columns)` 가 *단일값* (jeongtong
980). 그러나 *첫 페이지* 는 헤더 영역 (시험 정보표 + 학생 정보표 + OMR 안내
등 **~240px**) 이 추가로 차지. paginate 가 *그걸 모름* → 첫 페이지에 5번까지
욱여넣어서 마지막 문항이 푸터 침범. 페이지번호 (`- 2 -`) 가 *시야 밖*.

**해결**: `getPageContentHeight(template, columns, isFirstPage)` 분기:
- jeongtong / modern: 첫 페이지 740, 이후 980 (헤더 -240)
- pyeongga: 첫 페이지 900, 이후 1000 (박스 헤더 -100)
- yuhyung: 첫 페이지 880, 이후 980 (배너 -100)
- workbook / jaseup 1단: 첫 페이지 600, 이후 720 (학원/단원 헤더 -120)

`paginateProblems` 가 첫 페이지 처리 후 *이후 페이지 가용 높이* 로 동적 전환:
```ts
let pageH = getPageContentHeight(template, columns, true);
for (...) {
  if (...overflow...) {
    pages.push(...);
    pageH = getPageContentHeight(template, columns, false); // 이후 페이지
  }
}
```

**원칙**: 페이지 분할 알고리즘은 *각 페이지의 가용 높이가 다를 수 있음* 을
명시적으로 처리. 단일 상수는 *첫 페이지에 추가 헤더가 있는 디자인* 에 깨짐.

후속 — *실제 DOM measure* (ResizeObserver 또는 ref.offsetHeight) 로 동적
추정. PrintMeta 의 conceptNote (jaseup) 같은 *가변 길이 헤더* 에 정확.

### 21-7. A4 page wrapper padding vs template 내부 padding 중복

`A4Page.tsx` 가 `paddingClass="px-12 py-10"` 기본 적용. 6 신규 template 은
*자체 padding* (pyeongga "42px 56px", workbook "32px 44px 20px" 등). 둘 다
적용되면 *padding 두 번* — 컨텐츠 영역 너무 좁아짐.

**해결**: `A4Page` 에 `bare?: boolean` prop 추가:
```tsx
const padding = bare ? "" : paddingClass;
```

Step5Export 의 *문제 페이지* (6 신규 template) 호출 시 `bare={true}`. *정답
페이지* (PrintAnswerKeyPage) 는 *그대로* paddingClass 사용 (정답지는
template-agnostic).

hidden print DOM (인쇄 전용 div) 도 동일 — `className="... px-10 py-7 ..."`
에서 *px-10 py-7 제거*.

### 21-8. legacy template 값 마이그레이션 — 누락 시 hydrate crash

Supabase / sessionStorage 의 기존 시험지의 `printOptions.template` 이
`"exam"` 등 *옛 4 union* 값. wizardStore 의 hydrate 가 그대로 통과시키면
신규 6 union 위반 → Step6 의 dispatcher 가 `default` case 로 fallback (만약
default case 없으면 *null render* → crash).

**해결**: `src/lib/printTemplateMigration.ts` 의 `matchLegacyTemplate(raw)`:
- 신규 6 값이면 통과
- 옛 값 매핑 (exam → pyeongga / default → jeongtong / minimal → yuhyung /
  classic → modern)
- mathlab 9 잠복 (large/csat/notebook/formal/bubble) 도 함께 매핑
- 그 외 → fallback `"jeongtong"`

호출 위치 — `wizardStore.onRehydrateStorage` 안에서:
```ts
state.printOptions.template = matchLegacyTemplate(state.printOptions.template);
```

mappers.ts (Supabase row hydrate) 에 추가 호출 없어도 OK — Supabase 의 시험지
저장 시점에 `printOptions` 컬럼 없음 (wizardStore 의 sessionStorage 전용).

**원칙**: union type 교체 시 *legacy hydrate 헬퍼* 가 *원자적 변환*. Default
case 만 fallback 으로 두지 말고 *기존 데이터 보호* 의도 명시.

### 21-9. PrintTemplateProps `options.color` vs `options.accentColor` 호환

design_handoff 의 6 template 일부 (`ModernTemplate`, `WorkbookTemplate`,
`JaseupTemplate`, `YuhyungTemplate`) 가 `options.accentColor` 호출. Mathgen 의
`PrintOptions` 는 `color` 필드. 충돌.

**해결**: 카피 시 *각 template 에서 `options.accentColor` → `options.color`
일괄 변경*. PrintOptions 인터페이스는 *건드리지 않음* (영향 범위 최소화).

sed 패턴:
```bash
sed -i 's|options\.accentColor|options.color|g' src/components/print/templates/*.tsx
```

**원칙**: 외부 코드 카피 시 *Mathgen 컨벤션이 이미 정해진 영역* (PrintOptions
필드명) 은 그대로 유지 + *카피 코드만 adapter pattern* 으로 맞춤. 양쪽 다
바꾸려 하면 영향 범위 폭발.

### 21-10. Chrome MCP 미리보기 frozen — 인쇄 6 template 의 무거운 reflow

증상: Step 6 미리보기 페이지 6+ 개 (4 문제 + 2 해설) 가 KaTeX 식 + 도형
+ 6 template 의 복잡 layout 모두 paint → main thread 점유 ~30s+. Chrome
MCP `screenshot` / `scroll` timeout (30s).

**대응**:
1. 첫 1~2 페이지만 시각 확인 (Chrome MCP wait 5~10s + screenshot)
2. 다른 4 template 은 *사용자 직접 dev 에서 클릭*
3. Hard reload (Ctrl+Shift+R) 후 첫 페이지만 보기 — 무거운 reflow 회피

**원칙**: 6+ 페이지 미리보기는 *Chrome MCP 자동화* 한계. 첫 1~2 페이지 +
template switch (좌측 패널 클릭 → 첫 페이지 자동 갱신) 로 5 template 확인
가능. 전체 시각 검증은 사용자 위임.

### 21-11. Google Fonts CDN 의 `display=swap` 강제

폰트 팩 5 개 중 4 개 (nanum / noto / gowun / pretendard) 는 Google Fonts /
jsdelivr CDN. `index.html` 의 link 에 `&display=swap` 필수 — fallback 폰트로
*먼저 paint* + 다운로드 후 *swap*. 없으면 다운로드 동안 빈 화면 (FOIT).

```html
<link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap" rel="stylesheet" />
```

**원칙**: 인쇄 미리보기는 *폰트 로딩 지연이 시각 깨짐* 으로 보임. `swap` 으로
fallback 가시화 + 다운로드 완료 후 자연 swap.

**후속**: Puppeteer PDF 에서 `page.waitForFunction(() => document.fonts.ready)`
없으면 fallback 폰트로 PDF 굳어질 위험. `/api/export-pdf.ts` 에 추가 필요
(§19-5).

### 21-12. *GeneratedProblem 신규 optional 필드* 의 안전한 추가

6 template 이 `p.variant.points ?? 3` 호출. 기존 `GeneratedProblem` 에
`points` 필드 없음 → type error.

**해결**: `src/types/index.ts` 의 `GeneratedProblem` 에 `points?: number`
추가. *optional* 이라 supabase 의 기존 JSONB 데이터 (points 없음) 도 hydrate
정상 — 모든 template 에서 `?? 3` fallback.

**원칙**: AI 출력 schema 의 신규 필드 추가 시 *항상 optional* 로. 기존 row
hydrate 시 undefined 가 자연스럽게 처리됨. required 추가하면 옛 데이터
crash.

### 21-13. `index.ts` barrel re-export — *6 template 한 import*

`src/components/print/templates/index.ts` 가 6 template + ProblemBody +
BodyContainer + ProblemMeta + types re-export. Step5Export 의 PageBody
dispatcher:
```ts
import {
  PyeonggaTemplate, JeongtongTemplate, ModernTemplate,
  WorkbookTemplate, JaseupTemplate, YuhyungTemplate,
} from "@app/components/print/templates";
```

barrel 없으면 6 줄 import. barrel 로 *한 import 그룹*. Tree-shaking 영향 거의
없음 (Vite 가 ESM named import 따라 자동 prune).

**원칙**: 동일 폴더의 *2+ 컴포넌트가 같은 곳에서 import 되면* index.ts
barrel. 단 *순환 import 위험* — barrel 이 sibling 을 import 하지 않도록.

---

## 22. 다음 진행사항 체크 (라이브 — 2026-05-26 기준)

### 22-1. *완료* 인쇄 6 신규 template 통합 (commits `a127535` ~ `24f9c41`)
- ✅ Phase A: tokens / types / ProblemBody / BodyContainer / ProblemMeta / 6 template / index barrel
- ✅ Phase B: wizardStore PrintTemplate 6 신규 union + matchLegacyTemplate + onRehydrateStorage
- ✅ Phase C: PrintOptionsPanel TEMPLATE_OPTIONS 6 (grid-cols-3 + label+hint) + getPageContentHeight 분기
- ✅ Phase D: Step5Export PageBody dispatcher + A4Page bare + PrintableHeader / PrintQuestionBlock 삭제
- ✅ Phase E: tsc + build + Chrome MCP 시각 (jeongtong + pyeongga + yuhyung 확인) + commit
- ✅ 추가: 한글 폰트 팩 5 개 (system / nanum / noto / gowun / pretendard) + Google Fonts CDN preload
- ✅ 추가: 첫 페이지 vs 이후 페이지 가용 높이 분기 (5번 푸터 침범 fix)
- ✅ 추가: DifficultyBadge chip (color-coded), 컬럼 구분선 옵션, 5 단계 세로여백 preset
- ✅ 추가: katex-display 스크롤바 인쇄 영역에서 visible 강제 (사용자 보고 #17 fix)

### 22-2. *진행 권장* — 6 template 사용성 보강
- 🟡 PrintOptionsPanel *고급 옵션* accordion — academyName / instructorName /
  conceptNote / patternName / patternStrategy / examDate / examDuration /
  totalScore 텍스트 입력. (현재 빈 string fallback)
- 🟡 paper accent 색 (navy / red / gold / slate) 4 색을 PrintOptionsPanel 의
  COLORS picker 에 추가. 신규 template 의 TEMPLATE_DEFAULT_ACCENT 와 일치.
- 🟡 첫 페이지 헤더 영역 *실제 DOM measure* — 현재 fixed 값. conceptNote
  채우면 jaseup 헤더 가변 → ResizeObserver.
- 🟡 Puppeteer PDF 의 `page.waitForFunction(() => document.fonts.ready)` 추가
  — 현재 fontPack 가 PDF 에 반영되는지 보장 X.

### 22-3. *후순위* — 폰트 / 디자인 미세조정
- 🟢 KoPub 폰트 self-host (`public/fonts/kopub-batang.woff2` + `@font-face`)
  → fontPack 에 `kopub` 추가
- 🟢 template 별 폰트 크기 미세조정 — `estimateProblemHeight` 의
  charsPerLine / lineH 가 각 template 실제 폰트 (12.5 / 13.2 / 13.5) 와 일치
- 🟢 6 template 의 *2단 모드 디자인 일관성 검증* — Chrome MCP 시각 (사용자
  검증 위임)
- 🟢 워터마크 / 학원 로고 (인쇄 옅게) — 기존 watermark 인프라 (task #27~31)
  와 통합. 6 신규 template 의 헤더 위치에 conditional render.

### 22-4. *Production 진입 필수*
- ✅ Phase G (Supabase Auth) **— 완료** (`3fb6b60`, 2026-05-26 세션). 자세한 사항 §23.
- ✅ Phase H (Vercel async backend) **— 코드 완성 + Vercel preview E2E 검증 완료** (2026-05-26 세션). §23.
- 🚨 API key 3개 rotate (task #64) — `.env.example` 에 노출된 잔재.
- 🚨 legacy 시험지 회귀 자동 테스트 — `matchLegacyTemplate` 의 4 매핑 (옛
  exam / default / minimal / classic 시험지가 신규 6 union 으로 정상 변환)
  Vitest 추가.

### 22-5. *대기 중 (사용자 검증 후 우선순위 결정)*
- 🟢 6 template 모두 시각 확인 (현재 jeongtong + pyeongga + yuhyung 만
  Chrome MCP 확인. modern / workbook / jaseup 사용자 직접 검증 필요)
- 🟢 6 template 의 PDF 다운로드 (`/api/export-pdf`) 결과 검증 — Puppeteer
  로딩 시 폰트 / 색상 / layout 일관성

### 22-6. *완료* Phase I-7b — Pass 2 per-box cropped OCR (commit `d8771c7`)
- ✅ usePageOcr Pass 2 가 전체 페이지 → 검증된 cropBox (class="problem")
  별 cropped image 로 전환. vision token 30~50% 절감 목표.
- ✅ 도형 있는 figureItems 만 호출 대상. 도형 없는 item 은 호출 자체 X.
  결과는 number 기준 merge.
- ✅ legacy v2 fallback: cropBoxes=undefined 시 cropInspectionOK 통과하지만
  problemBoxes 비어있어 silent no-op (Pass 1 유지). 사용자가 Step 1.5 에
  다시 방문 시 자동 populate.
- ✅ pass2Chain 폴백 + dispatched Set 매커지 그대로 (no AbortController).
- 🟡 검증 갭: dev 에서 API 키 미노출 → extractPageProblems 호출 시 401/auth
  에러. 한 차례 브라우저 hung 관찰 (fresh tab 로딩은 정상 — 일회성). 실제
  cropped Pass 2 동작 검증은 *API 키 활성 환경* (Vercel preview 또는
  VITE_OPENAI_API_KEY 설정된 dev) 에서 사용자 수동 권장.

---

## 23. ClassDay 흡수 + Phase G/H/I 진행 + handoff (2026-05-26 세션)

### 23-0. 세션 개요 — 3 commits

| commit | 영역 | 변경 |
|---|---|---|
| `3fb6b60` | chore(auth) | schema 코멘트 정리 + Tenant 초대코드 복사·재발급 UX |
| `687d921` | chore(infra) | .gitignore — Vercel CLI 자동 + migrate-storage.mjs 보안 차단 |
| `26c4b6f` | feat(wizard) | Phase I-1: wizardStore foundation (CropBox + Step 1.5 액션) |

세션 결과물:
- **로드맵 doc**: `C:\Users\user\.claude\plans\logical-mapping-aho.md` (per-user plan 파일; G/H/I/J/K/L/M 전체 phase 전략)
- **Phase G/H 완료** — Auth 가동 + Vercel async backend E2E 검증
- **Phase I 시작** — I-1 (store foundation) 완료, I-2~9 남음

### 23-1. ClassDay (class.day) 5-stage pipeline — 핵심 architectural 인사이트

ClassDay 의 *시험지 출처 분석* 기능을 실 계정 + 실 시험지(`[대구일중][1][수학][23-1-중간].pdf`)로 조사. 발견한 5-stage:

```
업로드 → DB화 진행중 → 검수중 (human edit) → 검수 완료 → 완료 DB
        ↑ 자동 crop      ↑ 박스 편집 UI       ↑ user 트리거    ↑ 임베딩 매칭 후
        ~5분            (드래그 4 도구)                      → 8쪽 PDF 보고서
```

**4 가지 결정적 architectural 패턴** — mathg-gen 흡수 대상:

1. **Pipeline 5-stage with human-in-the-loop** — 100% 자동 X. 검수 단계 미설치 시
   박스 누락 = 분석 누락 (대구일중 22문제 → 13개만, 41% 손실 직접 측정). cropDetect
   의 한계 = 사용자 보정 필수.
2. **드래그-편집 박스 UI** — 4 도구 (생성/조절/이동/삭제) + 3-class (문제/그림/표)
   색상 분류. WYSIWYG. Phase I-3~5 의 직접 모방 대상.
3. **백엔드 비동기 큐** — `fileConversionTaskId=21026`, 5분+ 처리, **`진행률: 51%`**
   progress 노출. 브라우저 직접 호출 불가. Phase H 가 같은 아키텍처.
4. **출처 매칭 + threshold + 카테고리** — exact / [유사] 분류, 80% 미만 컷오프,
   학년 hard-filter 누락 시 *완전 다른 단원·학년* 오매칭 발생 (중1 부등식 → 중2(하)
   순열과 조합 82% 매칭 사례 직접 관찰). Phase L 의 prereq.

자세한 매칭 표·오매칭 사례·8쪽 PDF 보고서 구조는 §20 참고. §20-1~20-2 의 크롭
경계 규칙·여백 보정 + 본 §23-1 합쳐서 ClassDay 흡수 전체 그림.

### 23-2. Phase G (Auth) ✅ 완료

3fb6b60 커밋. 사전 95% 완성된 상태 (`authStore` + `AdminGate` + `UserMenu` + RLS
정책 가동). 정리 작업:

- **schema.sql / schema-storage.sql** — dev_user_id 스테일 코멘트 정리. 실제 RLS
  정책 SQL 은 무변경 (COALESCE 패턴 유지 — auth.uid() null 시 zero UUID 폴백,
  anon/dev 진입 보호용; production 사용자는 항상 auth.uid() 보유).
- **TenantManagement.tsx** + **admin.ts** — 초대코드 복사 버튼 (clipboard API +
  2초 ✓ 피드백) + 재발급 버튼 (confirm 다이얼로그) + `regenerateInviteCode(id, newCode)`
  서비스 함수 신규.

남은 작업 (코드 X, runtime test 만):
- PasswordResetFlow E2E — `requestPasswordReset` / `updatePassword` 코드 모두
  authStore.ts 194-215. UI 는 PasswordChangeModal / NewPasswordScreen / AuthScreen
  / AuthGate 5 파일에 분산. Chrome MCP 또는 사용자 직접 테스트 필요.

### 23-3. Phase H (Vercel async backend) ✅ **코드 완성 + E2E 검증 완료**

**중요한 meta-lesson**: Explore agent 의 1차 보고가 부정확했음 — "훅이 fetch 안
함" 이라 했지만 실제로는 USE_API 분기가 *세 파일 모두* (ocr.ts:1015, solutions.ts:490,
variants.ts:518) 완성되어 있고 훅은 switched export 를 호출. 즉 production 빌드에서는
자동 fetch 경로로 전환. Phase H "3-4주 작업" 추정은 wildly off — 실제는 ~1주 검증.

**완성된 것**:
- 3 fetch wrappers (`extractPageProblemsViaApi`, `generateSolutionViaApi`, `generateVariantViaApi`)
  — Bearer auth (`currentAccessToken` from api/supabase.ts:65) + AbortSignal + 에러 처리
- USE_API switch — `import.meta.env.PROD || VITE_USE_API==="true"` 일 때 fetch 경로
- vercel.json `api/*.ts` 60초 timeout
- 핸들러 (api/ai-{ocr,solution,variant}.ts) — JWT 검증 (api/_jwt.ts) + usage 로깅
  (api/_logUsage.ts) + `_usage` 스트립 후 client 응답

**E2E 검증 절차** (재현 가능):
```
1. vercel link --project math-gen --scope bigshols-projects --yes  (이미 됨)
2. vercel env pull .env.local --environment production --yes  (필요 시)
3. vercel deploy --yes  (preview, ~1분)
4. preview URL 확보 (예: math-lo7pu1806-bigshols-projects.vercel.app)
5. Chrome MCP navigate → /api/ai-ocr 가 reachable 한지 확인
6. javascript_tool 로 직접 fetch:
   fetch("/api/ai-ocr", { method: "POST", headers: {"Content-Type": "application/json"}, body: "{}" })
   → HTTP 400 + {"error":"pageBase64 field required"} = stack 전체 정상
```

검증된 stack: Vercel routing → 함수 로드 (import 성공) → JSON 파싱 → 필드 검증 →
에러 응답 → 브라우저 도달 → CORS 통과. **production path 완전 검증.**

남은 의사 결정 (코드 X):
- **Vercel Pro 결제** ($20/월) — `api/*.ts` 60초 → 300초 timeout. Phase I 의
  cropped Pass 2 가 GPT-5.5 5분+ 호출 가능 → Pro 필요. Phase I 본구현 시점 재결정.
- **Progress polling endpoint** — ClassDay 51% 패턴 모방. 5분 직접 함수가 가능하면
  polling 없이 OK. **후순위**.

### 23-4. ⚠️ `vercel dev` + Vite 호환 이슈 — Vercel preview 가 정답

E2E 검증을 위해 `vercel dev` (로컬 Vite + api/ 동시 serving) 를 먼저 시도했으나
**index.html 을 Vite import-analysis 파이프라인으로 잘못 라우팅** → React 마운트 실패.
에러: `Failed to parse source for import analysis because the content contains invalid
JS syntax. ... index.html:8:4`.

알려진 vercel-dev + Vite 결합 이슈. `assetsInclude: ["**/*.html"]` 패치 가능성도
있으나 검증 안 했음.

**원칙**: 로컬에서 `/api/*` E2E 검증 필요할 때 — **vercel dev 시도 X**. 대신
**Vercel preview 배포** (`vercel deploy --yes`) + Chrome MCP. preview URL 받아
직접 fetch / 정상 navigate / 함수 응답 확인. 30초~1분.

### 23-5. Phase I — cropped Pass 2 + 검수 UI

**I-1 완료** (`26c4b6f`). **I-2~9 남음, 4-6주 추정.** 상세 plan: §logical-mapping-aho.md.

**I-1 변경 (purely additive — UI 무영향, persist v2 유지)**:
- `WizardStepIndex` 0|...|5 → 0|...|6 (next() clamp 는 5 유지 — I-6 시점 6 으로)
- `CropBox` interface 신설 — id (UUID) / class (problem|figure|table) / bbox
  / verified / source (ai|user|edited) / number
- `WizardPage` 에 cropBoxes? / cropInspected? / cropDetectInflight? / cropDetectError?
  4 optional 필드 추가
- 8 신규 액션: setPageCropBoxes / addCropBox / updateCropBox (bbox·class 편집 시
  source ai→edited 자동 전환) / deleteCropBox / markCropInspected / markAllCropInspected
  / setCropDetectInflight / setCropDetectError
- partialize 에서 cropDetectInflight strip (휘발성)
- persist v2 유지 — v3 + migrate (+1 step shift) 는 I-6 (WizardScreen 갱신) 과
  함께 ship

**남은 sub-task 순서**:

| sub | 파일 | ~줄 | 의존 |
|---|---|---|---|
| I-2 | `src/hooks/useCropDetect.ts` (NEW) | 140 | I-1 |
| I-3 | `src/components/wizard/Step1_5CropInspect.tsx` (NEW) | 280 | I-2, I-4, I-5 |
| I-4 | `src/components/wizard/EditableCropBox.tsx` (NEW) | 220 | — |
| I-5 | `src/components/wizard/CropEditTools.tsx` (NEW) | 80 | — |
| I-6 | `src/components/wizard/WizardScreen.tsx` + persist v3 migrate | 30 | I-1, I-3 |
| I-7 | `src/hooks/usePageOcr.ts` (cropped Pass 2 refactor) | 200 | I-1 |
| I-8 | `src/hooks/usePageImageDataUrl.ts` (NEW, refactor) | 40 | — |
| I-9 | Toast 시스템 — `src/components/ui/Toast.tsx` + `src/stores/toastStore.ts` (NEW) | 150 | — |

### 23-6. 다음 세션 시작 — Phase I-2 (useCropDetect 훅)

**최우선 작업**: `src/hooks/useCropDetect.ts` 생성. ~140줄.

**패턴**: `usePageOcr.ts` 와 동일 fan-out — `dispatched` Set membership 만으로
cancel 신호 (CLAUDE.md §1-6-b — AbortController 금지).

**골격** (plan agent 결과 발췌):

```ts
export const useCropDetect = () => {
  const pages = useWizardStore((s) => s.pages);
  const setPageCropBoxes = useWizardStore((s) => s.setPageCropBoxes);
  const setCropDetectInflight = useWizardStore((s) => s.setCropDetectInflight);
  const setCropDetectError = useWizardStore((s) => s.setCropDetectError);

  const limit = useMemo(() => pLimit(2), []);  // Gemini 3 Flash, ~2-3s/page
  const dispatched = useRef<Set<string>>(new Set());

  useEffect(() => {
    const isCancelled = (id: string) => !dispatched.current.has(id);
    pages.forEach((page) => {
      if (page.cropBoxes !== undefined) return;
      if (page.cropDetectError) return;
      if (!page.isProblemPage && !page.forceOcr) {
        setPageCropBoxes(page.id, []);  // 비-문항 페이지 = 빈 박스로 즉시 통과
        return;
      }
      if (dispatched.current.has(page.id)) return;
      dispatched.current.add(page.id);
      setCropDetectInflight(page.id, true);

      void limit(async () => {
        try {
          // 1. 페이지 이미지 (getPageImage → ensurePageImage fallback)
          // 2. applyRotation
          // 3. detectCropBoxes(rotatedDataUrl)
          // 4. DetectedCrop[] → CropBox[] 매핑 (id=UUID, class="problem", source="ai")
          // 5. setPageCropBoxes
        } catch (err) {
          if (isCancelled(page.id)) return;
          setCropDetectError(page.id, friendlyError(err));
        } finally {
          setCropDetectInflight(page.id, false);
          dispatched.current.delete(page.id);
        }
      });
    });
  }, [pages, ...]);

  return { resetDispatch: (id) => dispatched.current.delete(id) };
};
```

**재사용할 기존 함수**:
- `getPageImage(imageRef)` from `@app/lib/imageStore`
- `ensurePageImage(page, storagePath)` from `@app/lib/imageRestore`
- `getPageStoragePath(pageId)` from `@app/services/api/wizardHydrate`
- `applyRotation(dataUrl, rotation)` from `@app/lib/pdfProcessor`
- `detectCropBoxes(pageBase64)` from `@app/services/ai/cropDetect`
- `friendlyError(err)` from `@app/lib/friendlyError`
- `pLimit(n)` from `@app/lib/concurrency`

**검증**:
- `npx tsc --noEmit` exit 0
- 훅을 *어디서도 호출 안 하는 상태* 라 UI 영향 없음. I-3 (Step1_5CropInspect)
  에서 mount → 검출 시작.

### 23-7. 의사 결정 기록 (사용자 확정)

| # | 결정 | 답 | 이유 |
|---|---|---|---|
| 1 | Phase L (출제분석) 포함 | **포함, 자체 학원 자료만** | 외부 DB 비현실, 학원별 use case 는 가치 있음 |
| 2 | Phase I 검수 강제 vs 선택 | **선택 (건너뛰기 가능)** | 빠른 작업 흐름 보존 |
| 3 | Phase 순서 H 와 I | **H 먼저 → I** | I 의 5분+ GPT-5.5 호출이 async 위에서만 안정 |
| ⚠️ | Phase M 우선순위 | **보류** | 시장 피드백 후 |
| ⚠️ | Vercel Pro 결제 | **보류** | Phase I 시점 재결정 |

### 23-8. Meta-lesson — Explore agent 보고 검증 필수

Phase H 검증 시 1차 Explore agent 가 "훅이 fetch 안 함" 으로 잘못 보고. 실제 코드
재확인 결과 USE_API 분기 + fetch wrapper 가 *세 파일 모두* 이미 완성되어 있었음.
**agent 의 negative finding (X 가 없다) 는 항상 직접 grep 으로 재검증**. False
negative 가 큰 시간 손실 (이 경우 3-4주 추정 → 실제 1주).

특히 코드가 "scaffolded but not wired" 같은 미묘한 상태일 때 agent 가 표면만 보고
오판할 가능성 높음. *실제 동작 경로* (PROD 빌드에서 어느 함수가 실행되는가?) 를
파일 단위로 grep 으로 추적.

**참고**: §23-3 절의 USE_API 분기 패턴 — `export const X: typeof XDirect = USE_API
? XViaApi : XDirect` — 이 한 줄이 마이그레이션의 핵심. import 측은 무변경, 실제
호출이 빌드 환경에 따라 자동 전환. *훅이 fetch 를 직접 안 부른다*는 표면 관찰이
정확하지만 결론 (마이그레이션 미완) 은 틀림.

---

## 24. Phase I-7b — Pass 2 per-box cropped OCR 함정 카탈로그 (commit `d8771c7`)

usePageOcr Pass 2 워커를 *전체 페이지 image* 에서 *Step 1.5 에서 검증한
cropBox 별 cropped image* 로 전환하면서 부딪힌 함정 + 패턴. 다음 *fan-out
hook 의 sub-call 단위화* 작업 시 첫번째로 읽을 섹션.

### 24-1. 기존 util 재사용 — 새 cropImage.ts 신설 금지

처음에는 `lib/cropImage.ts` 신설 계획 (Canvas API + bbox 변환 + dataURL 입출
력). 그러나 `lib/pdfProcessor.ts` 의 **`cropPageImageData`** 가 이미 동일
시그니처 + degeneracy / area-ratio 안전 검사까지 갖춤:

```ts
export const cropPageImageData = async (
  dataUrl: string,
  bbox: [number, number, number, number], // [yMin, xMin, yMax, xMax] 0-1000
  opts: { margin?: number } = {},
): Promise<string> => { ... };
```

**원칙**: 새 util 신설 전 *반드시* 기존 `lib/`, `services/` grep — 동일
기능의 util 이 이미 있을 가능성 높음. mathg-gen 은 `cropTestScreen` /
`Step5Export` / `OCRItem` 가 모두 이 함수를 사용 중. *내가 모르고 있던*
공유 인프라가 거의 항상 있다. 새로 짜기 전 5 분 grep.

cropPageImageData 의 `margin` 기본값은 4% (`opts.margin ?? 0.04`). 우리
case (Step 1.5 user-padded bbox + cropDetect 의 LEFT_PAD/RIGHT_PAD 추가
적용된 박스) 는 **이미 패딩이 충분** — `margin: 0.02` (2%) 명시로 *추가
오버크롭* 만 안전망 수준으로 더함.

### 24-2. closure 변수 `page` 의 stale snapshot 정책 (의도된 동작)

Pass 2 워커는 `pages.forEach((page) => { ... void pass2Limit(async () => {
... }); })` 패턴. 워커 안에서 outer `page` 는 *워커 시작 시점의 snapshot*
— `setPageOCR` 가 store 의 pages 를 갱신해도 closure 의 `page` 는 그대로.

```ts
const pass1Items = page.ocrResult; // ← 워커 시작 시점의 Pass 1 결과 capture
// ... 워커 도중 다른 곳에서 setPageOCR 호출돼도 pass1Items 는 안 바뀜.
```

**왜 의도된가**:
- *원본* Pass 1 결과를 안전히 보존. Pass 2 결과 merge 시 비교 baseline.
- 워커 도중 사용자가 OCR item 을 reviewed=true 로 만지면? — 그건
  *eligibility filter* 가 사전에 막음 (`!page.ocrResult.some(it =>
  it.reviewed)`). 워커 시작 후에는 사용자 편집이 *덮어쓰지* 않음 (워커가
  setPageOCR 으로 merged 를 write). 사용자 보고가 발생하면 그때 별도 정책
  검토.

**원칙**: fan-out hook 의 워커 안 closure 변수는 *snapshot* 으로 취급.
*최신 store state 필요* 시 `useWizardStore.getState()` 명시적 호출. 둘을
혼동하면 silent stale read.

### 24-3. per-box for-loop 의 *부분 실패 정책* — 한 box 실패는 fatal X

새 패턴:
```ts
for (const figItem of figureItems) {
  // ... matching box 찾기 + crop + 모델 체인 시도
  if (!upgradedByNumber.has(figItem.number) && lastErr) {
    console.warn(`item ${figItem.number} 전 체인 실패 — Pass 1 유지`);
    // continue — 다음 box 처리
  }
}
```

**원칙 정리**:
- *한 box 실패* → 그 item 만 Pass 1 결과 보존, 다음 box 시도.
- *모든 box 실패* → page.ocrModel 도 Pass 1 모델 유지 (lastModelUsed === null).
- *outer 전체 실패* (이미지 로드 X 등) → upgrading=false 로 spinner 해제,
  Pass 1 결과 그대로.

이전 페이지 단위 Pass 2 는 *전체 페이지 결과 replace*. 한 페이지가 실패하면
전체 페이지가 영향. per-box 로 바꾸며 *granular 실패* 가능 — 사용자 관점에서
"5 박스 중 4 개만 upgrade 됨" 같은 부분 성공이 자연스럽게 처리됨.

### 24-4. number 매칭 우선 + fallback items[0] — 모델 misread 방어

크롭된 이미지 = 1 문제. 모델이 `items: [{number: 5, ...}]` 로 emit 하면
matching by number 가 자연스럽다. 하지만 모델이 *박스 안 인쇄된 번호* 를
잘못 읽을 가능성:
- 박스 안 "5." 가 잘림 → 모델은 number=1 으로 추측
- 박스에 번호가 안 보임 (헤더만 잘림) → 모델 임의 number 부여

**해결**: 두 단계 매칭:
```ts
const matched =
  result.items.find((it) => it.number === figItem.number) ??
  result.items[0];
if (matched) {
  upgradedByNumber.set(figItem.number, {
    ...matched,
    number: figItem.number, // ← 원래 번호 강제 (모델 misread 정정)
    ocrModel: model,
  });
}
```

`number: figItem.number` 으로 *원래 번호 강제 재할당*. merge 시 일관성 보장.

### 24-5. legacy v2 fallback 정책 — silent no-op + 자연스러운 마이그레이션 경로

legacy v2 세션은 `cropBoxes === undefined` (Step 1.5 미경유). eligibility 의
`cropInspectionOK` 는 `cropInspected === undefined || === true` 라 통과.
하지만 워커 안에서 problemBoxes 가 빈 배열 → 각 figureItem 의 matching
box 조회 실패 → `continue` → upgradedByNumber 비어있음 → 모든 item Pass 1
유지.

**효과**: legacy 세션은 *Pass 2 효과 없이 워커가 완료* (silent no-op). 사용자
입장에서 "Pass 1 결과 그대로" — 회귀로 보일 수 있다.

**왜 명시적 fallback (전체 페이지 Pass 2) path 를 추가하지 않았나**:
- 코드 복잡도 증가 (두 path 유지)
- legacy 세션 hydrate 흐름: 사용자가 wizard 진입 → 자동으로 Step 1.5 mount
  → useCropDetect 가 자동 populate → 한 번 검수 통과하면 새 path 활성
- 사실상 *legacy 세션은 1-time 마이그레이션 후 v3 path 로 자연 흡수*

**원칙**: 마이그레이션 brace path 가 *사용자 워크플로* (Step 1.5 자동 방문)
에 의해 자연스럽게 해소되면, 코드에 별도 fallback 안 만든다. 명시적 fallback
은 *사용자 워크플로로 해결 불가능* 한 경우만 (legacy DB schema 변환 등).

### 24-6. textLayer hint 의 cropped call 에서 empty string 정책

기존 Pass 1 은 `extractPageProblems` 에 `textLayer: page.textLayer` (전체
페이지 PDF text layer) 전달. cropped Pass 2 에서는?

**선택**: `textLayer: ""` 전달 (빈 hint).

**이유**:
- page.textLayer 는 *전체 페이지* 텍스트 concat. 박스 영역만 추출하는
  정밀 매칭 없음 (textLayer 는 PDF 의 text-coordinate 정보 X, 단순 concat).
- 전체 page text 를 cropped image OCR call 에 넣으면 모델이 *다른 문제의
  텍스트* 까지 보고 hallucination 위험 (예: 박스 #5 OCR 인데 텍스트
  hint 에 #6 의 식이 보임 → 식 혼동).
- 박스 안 텍스트는 *cropped image 안에* 이미 존재 — 모델이 vision 으로
  직접 OCR. text hint 없어도 충분.

**원칙**: cropped 영역 OCR 시 *영역 외 text hint 는 노이즈*. 정밀 매칭이
없으면 empty 가 안전. 향후 PDF 의 text-coordinate 정보 (예: pdfjs 의
`page.getTextContent()` 의 transform matrix) 로 박스와 overlap 되는 텍스트만
추출하는 헬퍼 가능 — 후속 phase 검토.

### 24-7. dev 환경에서 API 키 미노출 → SDK 호출 hang 가능성 (CRITICAL, 검증 중)

**증상** (Chrome MCP 일회성 관찰): dev (USE_API=false) 에서 Step 1.5 일괄
완료 → Pass 2 트리거 → `extractPageProblems` 호출. 브라우저 renderer 가
**30+ 초** 동안 unresponsive. CDP `Input.dispatchMouseEvent` / `Runtime.evaluate`
모두 45s 타임아웃. Fresh tab 로딩은 정상 (일회성).

**의심 원인**: `vite.config.ts` 의 보안 조치 (`command === "serve"` 분기로
AI key define 제거 — CLAUDE.md §13 / task #69 참고). dev 빌드에서
`VITE_OPENAI_API_KEY` / `VITE_GEMINI_API_KEY` 미노출 → SDK 가 *키 없이*
fetch 시도 → 401 응답 또는 *별도 path* (SDK 내부의 키 검증 throw / 무한
재시도 / response 파싱 hang?) 에서 main thread block.

**가능성**:
1. OpenAI SDK 의 `messages.stream({...}).finalMessage()` 가 키 없이 호출되면
   *동기 throw 가 아니라* 비동기 promise resolution 으로 처리되며, 어떤
   상태에서 promise 가 settle 안 되고 main thread 미세 task 가 누적.
2. `withRetry` 의 `isRetryable` 패턴 (`429|529|503|...`) 에 401 매칭 안 되어
   바로 throw. catch 에서 다음 model 시도. Gemini 도 마찬가지. 그 뒤에서
   뭔가 무한 루프 가능성.
3. 다른 fan-out hook 의 setState cascade + setPageOCR 의 ocrStartedAt
   (Date.now() — 매 호출 다른 값) 로 React 가 *정상 commit* 만 반복하지만
   누적 work 가 30s 분 main thread 점유.

**검증 갭 (사용자 위임)**:
- **API 키 활성 환경에서 검증** — Vercel preview 배포 또는 dev 에 `VITE_*_API_KEY`
  명시. 그러면 SDK 가 정상 API call 하고 fail 안 함. 실제 cropped Pass 2
  동작 시간 / token 절감 측정.
- **CLAUDE.md §22-6 에 기록** — production 환경에서 검증 후 함정 확정 시
  여기 update.

**원칙**: dev 환경의 *API 키 노출 정책* (vite define 제거) 으로 *AI 호출
경로* 의 *모든* 직접 SDK call 이 *production 에서만* 동작. dev 에서는
USE_API=true 강제 (`VITE_USE_API=true`) + Vercel function path 사용 권장.
또는 dev 에서도 *최소 한 키* 명시해 fail-fast — Pass 1 호출 자체가 401 로
빠르게 종료. *fail-fast 가 silent hang 보다 압도적으로 낫다*.

### 24-8. 한 page 의 figureItems vs problemBoxes 매핑 정책

Pass 2 의 핵심 매칭: *Pass 1 figureItems* (도형 검출된 item) ↔ *problemBoxes*
(Step 1.5 사용자 검증 박스). 매칭 key = `number`.

**왜 problemBoxes (class="problem") 만**:
- Step 1.5 에는 3 class 가능: `problem` / `figure` / `table`
- `figure` / `table` 은 *문제 내부* 의 sub-region 마크 (단순 참조용, 후속
  Phase K 에서 활용)
- *OCR 결과의 한 item* = *한 문항* = `class="problem"` box 1 개. 1:1 매핑.

**verified 필드는 사용 안 함** (CLAUDE.md §I-1 — `verified` 는 후속 phase
reserved). 페이지 단위 `cropInspected=true` 가 검수 완료 신호. *모든*
class="problem" + `typeof number === "number"` 박스가 매칭 대상.

```ts
const problemBoxes = (page.cropBoxes ?? []).filter(
  (b) => b.class === "problem" && typeof b.number === "number",
);
```

`typeof number === "number"` 체크는 새 박스가 *number 없이* 추가됐을 때
방어선. cropDetect 결과는 모두 number 부여 — 사용자가 Step 1.5 에서 *수동
추가* 한 박스는 number 부여 UX 가 후속 phase. 그때까지 numberless box 는
Pass 2 skip (안전).

### 24-9. 워커의 setPageOCR 빈도 — *spinner 단위 정확도* 우선

내가 짠 코드는 worker 안에서 `setPageOCR` 를 다음 4 곳에서 호출:
1. `{ upgrading: true }` — worker 시작
2. `{ imageRef: restored.ref }` — Storage 복원 후 (조건부)
3. `{ ocrInflightModel: model, ocrStartedAt: Date.now() }` — 각 모델 chain
   attempt 시작 (per-box × per-model)
4. `{ ocrInflightModel: undefined, ocrStartedAt: undefined }` — 각 box 끝
5. `{ ocrResult: merged, ocrModel, upgrading: false }` — 최종

**총 호출**: 1 (upgrading) + (0~1 imageRef) + N×M (inflightModel set) +
N (inflightModel clear) + 1 (final) ≈ 6~12 회 (N=figureItems, M=pass2Chain).

각 호출 = 1 store update + 1 re-render queue. React batch 와 microtask 로
*수십 ms* 안에 commit 완료. 30+초 hang 의 원인이 *이 빈도* 만으로 설명되진
않음.

**원칙**: spinner / inflight UI 의 *반응성* 우선. setPageOCR 빈도 자체보다는
*각 setPageOCR 의 새 reference* (Date.now() 변경) 가 *components 의 *제대로
된 메모화* 가 안 돼있을 때 비효율*. 새 fan-out hook 추가 시 *어느
컴포넌트가 setPageOCR 마다 re-render 되는지* 한 번 확인 (React DevTools
Profiler) — render count 가 비정상이면 selector / useMemo 보강.

### 24-10. 회귀 방지 checklist — fan-out hook 의 Pass N 화

새 fan-out hook 도입 시 (Pass 3 / 별도 분석 단계 등):
- [ ] `dispatched` Set membership 만 cancel 신호 (no AbortController — CLAUDE.md §1-6-b)
- [ ] `pLimit(N)` 으로 concurrency 제한 — N 은 모델 RPM / TPM 한도 보수적으로
- [ ] eligibility check 의 `!page.upgrading` (또는 동등) 으로 *self-skip 무한 dispatch* 방지
- [ ] worker 내부 await 직후마다 `isCancelled(id)` 재체크
- [ ] `finally` 에서 dispatched 마커 + inflightModel 양쪽 clear
- [ ] `resetDispatch(pageId)` callback export — 사용자 명시적 재시도 path
- [ ] partialize 에서 휘발성 필드 (inflight / startedAt) strip — 새로고침 후 stuck 방지
- [ ] DEV-only console.debug 로 시작 / 완료 / 경과 시간 로그 — 사용자 보고 시 추적
- [ ] 회귀 테스트: tsc + Chrome MCP fresh tab (Maximum update depth 없음)
- [ ] API 키 활성 환경에서 *실제 호출* 검증 — dev key 미노출 환경 hang 가능성
  (§24-7) 회피

---

## 25. 2026-05-27 세션 함정 카탈로그 — 사용자 보고 폭발 + Phase #12-#16

이번 세션은 사용자가 **20+ 종 보고**를 *반복적으로* 던지는 형태. UX/OCR/렌더링/
DB/AI 새 feature 까지 광범위. 다음 세션이 무난하도록 *반복된 함정 패턴* +
*시간 잡아먹은 영역* 카탈로그.

### 25-1. **사용자 1-line 보고 → 거대 작업 변환** 패턴

사용자가 "X 됐는데 사라짐", "Y 가 이상함", "Z 더 강력하게" 같이 *한 줄로*
보고하면 *실제로는 multi-file refactor + DB schema 변경 + Vercel function +
UI overhaul* 가 동반되는 케이스가 다수.

대표 예 (이번 세션):
- "검출 완료된 거 재검출 함" → pages 테이블 컬럼 + mappers + sync + fallback
  4-fix (Phase #14)
- "모든 프로세스 결과 db화" → diagram_params / solution_auto_retried 컬럼 +
  OPTIONAL_COLUMNS 확장 + sync diff (Phase #15)
- "도형 confidence 낮으면 직접 그릴 수 있게" → 5 신규 파일 + OCRImage shape
  확장 + DALL-E function + Storage upload (Phase #12-#13, ~950 줄)
- "완료된 항목 이전 누르면 풀려버림" → furthestStep store 필드 + Stepper
  prop + WizardScreen integration

**대응**: 사용자 보고는 *언제나 처음 보이는 것보다 크다*. 답하기 전에:
1. *root cause* 식별 — 화면 동작이 아니라 데이터 흐름 또는 schema 부재
2. *블래스트 radius* 측정 — mapper/sync/fallback 까지 다 점검
3. *plan agent 1-shot* — Phase 큰 변경은 plan agent 호출 후 사용자 결정
   거치는 게 빠름 (사용자가 trigger / 모델 / 저장 정책 등 결정)

### 25-2. **DB schema 마이그레이션 graceful fallback 패턴** (재사용 표준)

새 컬럼 추가 시 사용자가 SQL 마이그레이션 안 한 상태에서 코드 deploy 되면
PGRST204 (schema cache miss) → 모든 insert/update fail.

**해결 표준** (이번 세션 *3 회* 재사용):
```ts
const SCHEMA_CACHE_MISS_RE = /(PGRST204|schema cache)/i;
const isSchemaCacheMiss = (msg: string) => SCHEMA_CACHE_MISS_RE.test(msg);

const OPTIONAL_COLUMNS = ["new_col_1", "new_col_2"] as const;
const stripOptionalColumns = (row) => {
  const clone = { ...row };
  for (const col of OPTIONAL_COLUMNS) delete clone[col];
  return clone;
};

let warnedSchema = false;
const warnSchemaMigration = () => {
  if (warnedSchema) return;
  warnedSchema = true;
  console.warn("[api/...] column 없음 — ALTER TABLE 마이그레이션 안내...");
};

// insert/update 호출부:
if (error) {
  if (isSchemaCacheMiss(error.message)) {
    warnSchemaMigration();
    const stripped = stripOptionalColumns(payload);
    const { error: retryErr } = await supabase.from(...).insert(stripped);
    if (retryErr) { /* 최종 fail */ }
    return;
  }
  // 기존 error 처리
}
```

**적용 위치 (이번 세션 3 곳)**:
- `src/services/api/problems.ts` (choices_layout / diagram_params / solution_auto_retried)
- `src/services/api/pages.ts` (crop_boxes / crop_inspected)
- 기타 미래 컬럼 추가 시 동일 패턴

새 컬럼 추가는 *항상* 이 패턴 묶음 (schema + mappers + service fallback + sync diff)
으로 가야 사용자 SQL 적용 전후 모두 안전.

### 25-3. **mappers 양방향 매핑 누락** — 가장 자주 빠진 함정

사용자 보고 "보관함 재열기 시 X 사라짐" 의 root cause 가 거의 *mappers 매핑
누락*. OCRImage / OCRProblem / WizardPage 의 새 필드 추가 시:

```
□ Type 확장 (src/stores/wizardStore.ts)
□ DB schema 컬럼 추가 (supabase/schema.sql + ALTER TABLE IF NOT EXISTS)
□ Row type 확장 (src/services/api/mappers.ts 의 OcrProblemRow / PageRow)
□ Insert mapping (wizardPageToPageInsert / ocrProblemToInsert)
□ Hydrate mapping (pageRowToWizard / ocrProblemRowToWizard)
□ Service fallback (PGRST204 retry — OPTIONAL_COLUMNS)
□ wizardSync diff (syncItemDiff / syncPageDiff)
```

**7 단계 체크리스트** — 하나라도 빠지면 hydrate 후 *그 필드만 사라짐*. 다음
세션은 이 checklist 를 *항상* 따라가면 됨.

이번 세션 누락 발견 사례:
- `diagramParams` — type 있는데 DB / mapper / sync 전부 없음 (Phase #15 에서 fix)
- `cropBoxes` — type / store 있는데 DB / mapper / sync 없음 (Phase #14 에서 fix)
- `images` 의 새 필드들 — wizardSync diff 누락 (Phase #12-#13 에서 fix)

### 25-4. **백틱 함정 — prompts.ts 편집 시 *반복* 발견**

CLAUDE.md §4-6 의 백틱 함정. 이번 세션 *2 회* 발생:
- 사례 A: `[단답형 N]` 처럼 backtick 안 한국어 본문에 외부 backtick 사용
- 사례 B: ``\`<line>\``` 같은 escape backtick + 본문 backtick 혼용

**원칙 재확인**: `prompts.ts` 같은 *큰 template literal 안에 한국어 본문* 일
때, **모든 backtick 을 *피해라*** — 큰따옴표 또는 single quote 사용. 본인이
한국어 본문 작성 시 자동으로 `` `xxx` `` 형태를 쓰는 경향이 있는데 *반드시*
`"xxx"` 로 작성. 이걸 명심.

검증: prompts.ts edit 후 *반드시 즉시* `npx tsc --noEmit` — 백틱 에러는
컴파일 단계에서만 잡힘.

### 25-5. **Stepper / furthestStep 패턴** (사용자 보고 — 완료 체크 풀림)

Stepper 의 `done` 상태가 `s.index < current` 로만 결정되면 사용자가 *prev
로 돌아갔을 때* 미래 step 이 future 로 reset. 사용자 보고: "완료된 항목 이전
누르면 풀려버림".

**해결 (이번 세션)**: `furthestStep` 추적 — store 에 monotonic 증가 필드.
- `setStep` / `next` 시 `furthest = max(furthest, newStep)`
- `prev` 는 furthest 영향 X
- `startWizard` / `hydrateFromTest` / `reset` 시 `furthest = step` (재초기화)
- Stepper 가 `state = s.index < current ? "done" : s.index === current ? "active"
  : s.index < furthest ? "done" : "future"`

**패턴 일반화**: 사용자 navigation 동작 (이전/다음 버튼) 으로 *진행 표시* 가
풀리면 안 됨 — 별도 *monotonic high-water-mark* 필요. wizardStore 외 다른
multi-step UI 도 같은 패턴.

### 25-6. **Phase F (diagramParams) 의 진짜 표시 위치**

이번 세션 처음 발견: `OCRProblem.diagramParams` 가 *Phase F 부터 존재*했는데
DB 매핑 전체 누락. → 보관함 재열기 시 도형 사라짐. *Phase F (OCR Tier 2)
구현 시* 이 부분이 통째 빠진 채로 commit 됐다는 의미.

**원칙**: AI emit 결과 (vector spec, ocr text, solution 등) 는 *언제나*
DB 영구 저장. 새 AI 결과 필드 추가 시 §25-3 의 7-단계 checklist 따름.
*type 만 추가하고 sync 못 한 필드* 는 다음 세션의 사용자 보고 1순위.

### 25-7. **OCRImage.source 의 backward-compatible default**

이번 세션에 추가한 OCRImage.source ("ai-crop" | "user-crop" | "ai-gen") —
옛 row 는 source 없음. reader 가 *항상* `source ?? "ai-crop"` 으로 default
적용해야. 직접 비교 (`source === "ai-crop"`) 는 옛 row 의 undefined 와 mismatch.

**일반 원칙**: 새 union enum 필드 추가 시 *옛 데이터 default* 를 *type 안*
에 코멘트로 명시 + reader 코드에 fallback 명시. SQL DEFAULT 만으로는 부족
(기존 row 의 NULL 유지). hydrate path 에서 명시적 ?? .

### 25-8. **viewport-fixed overlay vs container-absolute overlay**

이번 세션 사용자 보고: "AI가 문항을 검출하고 있어요" 가 *이미지 영역 안* 만
중앙. 사용자가 시험지 이미지를 스크롤하면 overlay 가 *viewport 밖* 으로.

**해결**: overlay 분리 — *위치 신호 (shimmer)* 는 container absolute, *카드
본체* 는 viewport `position: fixed`. 사용자가 어디 보고 있어도 카드는 viewport
중앙.

**원칙**: progress indicator 의 *위치* 는 *작업 위치* 와 별개. 작업이 어디서
일어나는지 시각 표시는 *해당 영역 안 (container-absolute)*, 사용자 인지용
*중앙 카드 / toast* 는 *viewport-fixed* — 두 개 분리.

### 25-9. **dev 환경 API 키 미노출 정책의 함정** (§24-7 재확인)

이번 세션 *#13 AI 이미지 생성* 구현 후 dev 검증 불가 — `vite.config.ts` 의
보안 조치로 API 키 strip. `vercel dev` 도 미지원 (Vite 호환 X).

**원칙**: 새 Vercel function (`api/*.ts`) 구현 시 *검증은 항상 Vercel preview*.
사용자가 dev 환경에서 검증 시도하면 *반드시* 안내:
> dev 환경 API 키 미노출 정책 (CLAUDE.md §24-7). 검증은 `vercel deploy --yes`
> 후 preview URL 에서.

### 25-10. **Plan mode 의 Phase 5-스텝 워크플로우** — Plan agent 활용

이번 세션의 #12-#13 통합 plan 작성에서 Phase 1 (Explore agent 3 개 병렬) →
Phase 2 (Plan agent 1 개) → Phase 3 (AskUserQuestion 4 결정) → Phase 4
(plan 파일 §25 추가) → Phase 5 (ExitPlanMode) 흐름 사용.

**효율적**: explore agent 가 *3 영역 분담* (도형 흐름 / EditableCropBox
재사용 / AI SDK) — 30 초 안에 충분한 컨텍스트. Plan agent 결과를 그대로
ExitPlanMode 까지.

**미래 큰 작업 시 패턴**: 사용자 보고가 "이거 + 저거 + ..." 묶음이면 *즉시*
plan mode 추천. 1-line 처리는 즉시, multi-file 변경은 plan + approve.

### 25-11. **TaskCreate / TaskUpdate 사용 패턴** (이번 세션)

이번 세션 15+ task 생성. 사용자가 *long-running* (multi-step) 으로 인식되면
TaskCreate 가 progress 표시에 효과적. 짧은 작업 (1-line fix) 은 TaskCreate
오버헤드 안 줄. 가이드라인:
- 3+ step 또는 multi-file 변경 → TaskCreate
- 1-line edit + immediate test → 그냥 진행
- task `in_progress` → `completed` 빠르게 cycling — 사용자가 "지금 뭐 하고 있나"
  실시간 인지 가능

### 25-12. **다음 세션 시작 시 추천 sequence**

이번 세션 commits 가 많아 다음 세션 시작 시 (1) recent commits 확인 +
(2) §25 카탈로그 읽기 + (3) 사용자 보고 → root cause 식별 → 7-단계 checklist
적용 순서가 효율적.

특히 *Phase #12-#13 (AI 이미지 생성)* 은 Vercel preview 검증 필요 — 사용자가
다음 세션에 "검증 결과 X 안 됨" 보고 시 즉시 `/api/ai-image` Vercel function
로그 + ai_usage 테이블 query 부터.

---

## 26. Artwork class + 손글씨 폰트 특성 방어 (2026-05-27 추가)

### 26-1. 한 문항 안의 시각 요소 *2 종 공존* 케이스 (사용자 [서술형 4] 보고)

한 문항이 *두 가지 시각 요소를 동시에 referencing* 할 수 있음:
- **Geometric** (vectorize 가능): 정사각형·삼각형·좌표축·그래프 → SVG emit
- **Artwork** (vectorize 불가능): 회화 작품 thumbnail (예: 반 고흐 "고흐의 의자"),
  실사 사진, 풍경 → image crop 만, SVG 시도 X

사용자 [서술형 4] 케이스: 작품 reference + 작도 도형 동시 referencing. OCR 모델이
"작품 thumbnail" 의 bbox 를 *옆 문항의 빨간 마커 손글씨 영역* 에 잘못 emit → OCRItem
카드에 "고흐의 의자" 라벨로 *완전히 다른 문항의 학생 풀이* 표시.

**근본 원인**: 모델이 "vectorize 불가능한 실사 reference" 와 "학생 손글씨" 를 구별
못 함 (둘 다 *texture 가 균일하지 않은 시각 영역*). 그래서 작품 위치가 모호하면 *가장
가까운 잉크 영역* 으로 fallback.

### 26-2. CropBox.class 4-way 확장 — `artwork` 신설

```ts
class: "problem" | "figure" | "table" | "artwork";
```

- **problem** (99% default): 한 문항 전체. 내부 시각 요소 모두 포함.
- **figure**: standalone 기하 도형 (페이지에서 문제 외 분리됐을 때만).
- **table**: standalone 표.
- **artwork**: standalone 실사 reference. SVG 시도 안 함, image only.

**색상**: 보라 #A855F7 (EditableCropBox CLASS_COLORS), 라벨 "작품".

**원칙**: 한 문항 안에서 작품을 *referencing* 만 하면 박스 class 는 여전히
"problem" (전체 포함). artwork class 는 *standalone* 작품 페이지 (cover, gallery)
또는 *user manual override* 시점에만.

### 26-3. 손글씨 vs 인쇄 — *글자체·획 특성* 카탈로그 (사용자 결정)

사용자가 *명시적으로 결정*: "손글씨는 분명히 글자체, 폰트가 일반적이지 않을텐데 그걸
기준으로 방어로직짜면 안되나?" → bbox 위치보다 *시각적 character traits* 가 더 강한
신호. CROP_DETECT_PROMPT + OCR_PAGE_PROMPT 양쪽에 동일 카탈로그 박음:

**PRINTED (인쇄)** — crop box 안에 OK:
- Stroke uniformity: 같은 stroke 내 굵기 변동 ≤ 10% (typeset 폰트)
- Color: pure black, 빨강/파랑 안료 없음
- Geometry: 직립 baseline grid, geometric/repeatable letterforms (모든 "5"가
  동일 모양)
- Alignment: 직선 column wrap, crisp clean line art

**HANDWRITING (손글씨)** — crop box 에서 *반드시 제외*:
- Stroke variability: 굵기가 *들쭉날쭉* (pen pressure), 1px ↔ 3px 변동, taper/blob ends
- Color: red marker (답안 동그라미), blue ballpoint (풀이식), 또는 *얼룩진* 검정
- Irregular shape: 같은 "x" 가 매번 다름, slanted baseline, 크기 변동
- Free-form curves: 동그라미 (사용자 답 표시), 화살표, factor tree 대각선, freehand
  "=" 또는 check mark
- Location: (N점) 마커 *아래 빈 풀이 영역* 또는 *문항 사이* 빈 공간

**효과 측정**: prompt 만으로 100% 차단 어려움. 사용자가 Step 1.5 검수에서 빠르게
박스 줄이거나 (artwork 면) 박스 자체 삭제 가능. 후속 — *Pass 2 OCR 호출 시 cropped
이미지의 빨간/파란 픽셀 비율 휴리스틱* 자동 detect.

### 26-4. cropDetect schema 확장 — `class` field required + 사용자 [서술형 4] 사례 인용

CROP_DETECT_SCHEMA 의 items 에 `class` enum field 추가 (required). 모델이 1차
자동 분류 → useCropDetect 가 `ALLOWED_CLASSES` whitelist 검증 후 store 에 저장.
누락 또는 invalid 면 "problem" default.

CROP_DETECT_PROMPT 의 *서술형 4* 케이스 인용:
- 원본: [서술형 4] (인쇄 도형 + 회화 reference) + 빨간 마커 학생 풀이 (옆 문항 [3])
- 잘못된 출력: 박스 bottom 이 학생 손글씨까지 늘어남
- 올바른 출력: 박스 bottom = 인쇄된 마지막 도형 줄. **빨간 마커 색상 보이면 즉시
  bottom 끌어올림.**

원칙: 사용자 보고 *실제 케이스* 를 prompt 에 그대로 인용하는 게 일반 룰보다 효과적
(CLAUDE.md §7-5 패턴 재확인).

### 26-5. 변경 파일 정리 + 다음 세션 sequence

이번 PR 변경 파일 (5):
- `src/stores/wizardStore.ts` — CropBox.class union 확장
- `src/components/wizard/EditableCropBox.tsx` — CLASS_COLORS 에 artwork
- `src/services/ai/cropDetect.ts` — DetectedCrop.class + schema + prompt 강화
- `src/hooks/useCropDetect.ts` — detectedToCropBox 가 model.class 사용 + whitelist
- `src/services/ai/prompts.ts` — OCR_PAGE_PROMPT Tier 4 (images bbox) 손글씨 카탈로그

DB schema **변경 없음** — `cropBoxes JSONB` 가 새 class 값 자동 통과 (backward
compatible). 옛 row 의 class="problem" 또는 누락 모두 정상 hydrate.

**다음 세션** 동일 패턴이 OCRImage.box 의 *문항 안 image bbox* 영역에서 발견되면:
- 같은 프롬프트 카탈로그 (font/character traits) 를 SOLUTION_PROMPT / VARIANT_PROMPT
  에도 박을 것 — 해설/변형 모델이 시험지 이미지 직접 보는 경우는 없지만, 사용자
  업로드 시 도형 hint 로 사용될 가능성.
- *DiagramFallbackPanel* 의 "AI 생성" path (DALL-E 3) 가 *artwork class* 박스에서는
  생성 시도 *경고* — 회화 reference 는 저작권 + 정확도 문제. confirm modal 에 별도
  warn banner 추가.

### 26-6. 인접 박스 행 패턴 — `\boxed{ABCD}` → `\boxed{A}\boxed{B}\boxed{C}\boxed{D}`

**사용자 보고 (2026-05-27)**: 원본은 4 개 *분리* 박스 `[A][B][C][D]` (순열 / 배치
/ 자리 표시 문제) 인데 OCR 이 한 박스 `\boxed{ABCD}` 로 합침. KaTeX `\boxed{}` 가
content 통째로 한 박스에 감싸기 때문에 4 글자가 한 박스로 렌더.

**원인**: 모델이 *시각적 분리* (박스 사이 내부 border) 를 인지 못하고 일반적인
`\boxed{}` 표기로 합침. Korean 교과서의 *칸당 1 글자* 표기 관행 미숙지.

**이중 방어선 (CLAUDE.md §7-5 패턴)**:

**(1) OCR_PAGE_PROMPT 4d-2 룰** (`src/services/ai/prompts.ts`):
```
인접 박스 행 (Row of separate small boxes):
  잘못된 출력: $\boxed{ABCD}$
  올바른 출력: $\boxed{A}\boxed{B}\boxed{C}\boxed{D}$

  판단 기준: 박스 사이 내부 구분선 (border 가 칸마다 따로) → 분리 박스 → 칸당
  \boxed{}. 외곽선만 하나 → \boxed{전체}.
```

**(2) Runtime auto-split harness** (`src/lib/textPreprocess.ts`, §26-7).

### 26-7. Runtime auto-split harness — `splitMultiLetterBoxed`

prompt 룰만으로 *100% 차단 불가* — 모델이 가끔 한 박스로 합쳐서 emit. 후처리에서
*보수적 자동 분리* 로 안전망:

```ts
const splitMultiLetterBoxed = (math: string): string =>
  math.replace(/\\boxed\{([A-Z]{2,6})\}/g, (_match, letters: string) =>
    letters.split("").map((ch) => `\\boxed{${ch}}`).join(""),
  );
```

**보수적 휴리스틱** (false positive 회피 우선):
- ✅ `\boxed{ABCD}` → 4 박스 분리 (순수 2-6 대문자 라틴)
- ✅ `\boxed{XY}` → 2 박스 분리
- ❌ `\boxed{42}` → 미적용 (단일 숫자 답 — false positive 위험)
- ❌ `\boxed{xy}` → 미적용 (소문자 = 변수 곱)
- ❌ `\boxed{\phantom{0}}` → 미적용 (LaTeX 명령어 포함)
- ❌ `\boxed{ABCDEFGH}` → 미적용 (7+ = 단어/약자 가능성)
- ❌ `\boxed{A+B}` → 미적용 (연산자 포함)

**호출 순서 — 중요**: `applyMathInnerNormalization` 안에서 `improperToMixed` 이후,
`uprightGeometryLabels` *이전* 에 호출. uprightGeometry 가 `\boxed{A}` 의 단일 A 를
`\mathrm{A}` 로 wrap 한 후엔 정규식 `\\boxed\{([A-Z]{2,6})\}` 매치 안 됨.

```ts
// applyMathInnerNormalization 순서:
//   1. cleanMalformedLatex
//   2. UNICODE_MATH_MAP
//   3. improperToMixed (가분수 → 대분수)
//   4. splitMultiLetterBoxed  ← NEW (uprightGeometryLabels 이전)
//   5. uprightGeometryLabels (점 라벨 직립)
//   6. autoSizeBrackets
//   7. \frac → \dfrac
//   8. injectDisplayStyle
```

**원칙 — 시각 패턴 분리는 prompt + runtime 이중 방어선** (CLAUDE.md §2-17, §16-1
패턴과 동일):
- prompt 만 → 모델 컨디션 변동으로 leak 가능
- runtime 만 → false positive 위험 (보수적 휴리스틱 필요)
- 둘 다 → prompt 가 *대다수 케이스* 차단 + runtime 이 *최종 안전망* 으로 leak 케이스
  복구

새 시각 패턴 (예: 6각형 배치 `[A][B][C]\n[D][E][F]`, 표 형식 박스 등) 발견 시
같은 *prompt 룰 + runtime auto-split* 이중 방어선 패턴 따를 것.

### 26-8. 이번 PR + 후속 PR 변경 파일 통합 정리

이번 세션의 *artwork class + 손글씨 폰트 방어 + 인접 박스 행* 통합 (commits
`fbaa3dc`, `eba282f`):

| 파일 | 변경 | 영역 |
|---|---|---|
| `src/stores/wizardStore.ts` | CropBox.class union 4-way | artwork |
| `src/components/wizard/EditableCropBox.tsx` | CLASS_COLORS + artwork 보라 | artwork |
| `src/services/ai/cropDetect.ts` | DetectedCrop.class + schema + prompt | artwork + 손글씨 |
| `src/hooks/useCropDetect.ts` | model.class whitelist | artwork |
| `src/services/ai/prompts.ts` | OCR_PAGE_PROMPT Tier 4 + 4d-2 | 손글씨 + 인접 박스 |
| `src/lib/textPreprocess.ts` | splitMultiLetterBoxed harness | 인접 박스 (runtime) |
| `CLAUDE.md` | §26 카탈로그 8 sub-section | 문서화 |

DB schema 변경 0. 옛 row 모두 backward compatible.

**검증 체크리스트**:
- [x] tsc exit 0 (api/export-pdf 제외)
- [x] CropBox.class 옛 enum (problem/figure/table) 모두 정상 처리
- [x] splitMultiLetterBoxed false positive 휴리스틱 (\boxed{42} 보존)
- [x] uprightGeometryLabels 호출 순서 (splitMultiLetterBoxed 가 *이전*)
- [ ] Chrome MCP 시각 검증 — `\boxed{ABCD}` 가 4 박스로 렌더 (사용자 위임)
- [ ] 실 시험지 OCR end-to-end (artwork class + 손글씨 방어) — 사용자 위임

---

## 27. cropDetect complexity routing — Gemini Flash → GPT-5.5 second pass (2026-05-27)

### 27-1. 동기

사용자 보고 [서술형 4] (반 고흐 작품 + 작도 도형) 케이스에서 *cropDetect 자체*
가 잘못된 bbox 를 emit. Gemini Flash 단일 모델로는 *다중 시각 요소 + 손글씨
인접* 같은 *복합 reasoning* 케이스 정확도 부족.

사용자 요청: "어려운 문제는 gpt 5.5로 할 수 있도록 따로 분류 가능한가?"
→ Gemini Flash 가 complexity 1차 분류 → complex 문항은 GPT-5.5 second pass.

### 27-2. 아키텍처 — 2-tier dispatch (사용자 결정 반영)

```
[Step 1.5 mount]
  ↓
useCropDetect.ts (page 단위 fan-out, pLimit(2))
  ↓
Gemini 3 Flash detectCropBoxes (~2-3s, ~$0.001/page)
  ↓ items[*].complexity 분류 — 모두 emit
  ↓
hasComplex? ───── No ────→ setPageCropBoxes (1차 결과)
  │
  Yes
  ↓
refineCropBoxesWithGpt55 (GPT-5.5 Pro, Responses API, ~30s-5min, ~$0.05/page)
  ↓ complex 문항만 bbox 재검출 + JSON merge
  ↓
setPageCropBoxes (final merged 결과)
```

**핵심 결정**:
- **트리거 자동** — Gemini 가 complexity flag emit, 사용자 조작 0
- **개별 교체** — complex 문항의 bbox 만 GPT-5.5 로 교체, simple 은 Gemini 그대로
- **Best-effort** — GPT-5.5 실패 / 빈 응답 → Gemini 결과 유지 (silent fallback)

### 27-3. "complex" 판단 기준 (CROP_DETECT_PROMPT 카탈로그)

Gemini Flash 가 다음 둘 중 하나라도 해당하면 `complexity = "complex"` emit:

**(a) 다중 시각 요소** — 한 문항 안에 *2 종 이상 시각 요소* 공존:
- artwork + figure (회화 + 작도 — 서술형 4 사례)
- figure + table (도형 + 표)
- 다중 figure (서로 다른 도형 2 개 이상)
- 도형 + 손글씨 인접 (학생 풀이 영역과 겹침)

**(b) 긴 서술형** — 본문 200자+ 또는 (1)(2) sub-parts 분할:
- 풀이 단계 / 조건 분석 명시 서술 문항
- sub-part 끝 boundary reasoning 필요

**보수적 default**: 의심 시 "simple" → 불필요한 GPT-5.5 호출 (~$0.05/page) 회피.

### 27-4. GPT-5.5 refine 프롬프트 — 핵심 룰 재진술

refineCropBoxesWithGpt55 의 `REFINE_PROMPT_PREFIX` 는 1차 prompt 의 핵심 룰을
*재진술* 한다 (모델이 1차 출력만 보고 추론하면 root rule 누락 위험):

1. **손글씨 배제** — visual character traits (uniform vs variable stroke, color)
2. **다중 시각 요소 wrapping** — 한 문항 box 가 artwork + figure 모두 포함
3. **긴 서술형 boundary** — last printed sub-part 까지만, post-(2) blank X
4. **서술형 4 사례 인용** — 반 고흐 작품 + 작도 도형 + 빨간 마커 손글씨 케이스

GPT-5.5 출력은 *complex 문항만* (전체 X) — 호출자가 1차 결과와 merge.

### 27-5. 비용 / 속도 트레이드오프

| 모델 | 페이지당 | 30 문항 시험지 | 속도 |
|---|---|---|---|
| Gemini 3 Flash (default) | ~$0.001 | ~$0.005 | 2-3초/페이지 |
| GPT-5.5 refine (complex only) | ~$0.05 | (1-2 페이지) ~$0.10 | 30초-5분/페이지 |

→ 보통 시험지 3-5 페이지 중 1-2 페이지가 complex → 추가 비용 ~$0.10, 시간 ~1분.

**Vercel function timeout 주의**: 현재 `vercel.json` 의 `api/*.ts` = 60s 한도.
cropDetect 는 *클라이언트 SDK 직접 호출* 이라 timeout 영향 X (브라우저 fetch 는
TTL 없음). 단 *Vercel function 으로 마이그레이션* 시 GPT-5.5 5분 가능성을 위해
Vercel Pro ($20/월, 300s timeout) 필요.

### 27-6. 구현 위치 + 호출 순서

**`src/services/ai/cropDetect.ts`**:
- `DetectedCrop.complexity?: "simple" | "complex"` — schema required field
- `CROP_DETECT_SCHEMA.items.complexity` enum + description
- `CROP_DETECT_PROMPT` 의 *complexity catalog* 섹션 (서술형 4 사례 포함)
- 신규 export `refineCropBoxesWithGpt55(pageBase64, initialResults, signal)`:
  - complex 문항 없으면 즉시 return (no-op)
  - GPT-5.5 Responses API 호출 (`gpt-5.5-pro`, `max_output_tokens: 8192`,
    `reasoning: { effort: "low" }`)
  - output_text fallback 패턴 (CLAUDE.md §1-3)
  - JSON parse → number 기준 merge (개별 교체)
  - column-aware padding 재적용
  - catch (AbortError 제외) → initialResults fallback

**`src/hooks/useCropDetect.ts`**:
- Gemini Flash 호출 후 `hasComplex` check
- `refineCropBoxesWithGpt55` await → final merged 결과
- `setPageCropBoxes` 1 회 호출 (refined 결과로)

### 27-7. 실패 mode + 안전망

GPT-5.5 호출은 *best-effort enhancement* — 실패해도 Gemini 결과로 진행:

- **빈 응답** (output_text === "") — reasoning 토큰 소진. fallback.
- **API 에러** (rate limit / quota / network) — fallback.
- **AbortError** — 사용자 cancel — 그대로 throw (useCropDetect 가 처리).
- **TypeScript 에러 — `as any` 캐스트** — Responses API 타입 정의 불안정해서
  `as any` 1 회 사용 (eslint-disable). SDK 업데이트 시 정리.

### 27-8. 다음 세션 — 가능 확장

- **수동 override 버튼** — Step 1.5 에 "이 페이지 정밀 재검출" 버튼 (사용자가
  simple 페이지도 강제 GPT-5.5)
- **UI badge** — page thumbnail 에 "정밀 분석" chip (complex 페이지 표시)
- **cropDetectModel 필드** — 어느 모델이 마지막 emit 했는지 기록 (디버그)
- **다른 시각 패턴 추가** — 6각형 배치, 표 형식 박스 등 새 패턴 발견 시
  complexity 기준 확장

---

## 28. 인식률 향상 종합 카탈로그 (2026-05-27)

사용자 보고 "여전히 인식도가 별로네. 인식률 상승에 대해 동원할 수 있는 방법
검토" — 가능한 모든 접근법 + 우선순위 + 측정.

### 28-0. 현재 pipeline 한계 진단

```
[Upload] → [cropDetect: Gemini Flash → GPT-5.5 complex] → [Step 1.5 검수]
        → [Pass 1 OCR: Gemini Flash Lite, page 전체]
        → [Pass 2 OCR: GPT-5.5, cropped per problem]
        → [diagramParams / images bbox / inline SVG]
```

**측정된 약점** (사용자 반복 보고):
- 손글씨 인접 영역 → bbox bleed (서술형 4 케이스)
- 다중 시각 요소 (artwork + figure) → 한쪽 정확도 ↓
- 도형 vector spec → dashed arc / 다중 라벨 일부 누락
- 손글씨 잉크 텍스처 → 인쇄 텍스트로 오인식

### 28-1. Tier 1 — 즉시 적용 (비용 0, 큰 효과)

| 방법 | 효과 | 구현 |
|---|---|---|
| **이미지 전처리** (upscaling + color filter + contrast) | 손글씨 잉크 제거, 작은 글자 부스트 | Canvas 기반 ~200줄 |
| **Pre-handwriting mask** (red/blue 픽셀 자동 식별 → 흰색 replace) | bbox bleed 완전 차단 | Canvas 픽셀 분석 ~200줄 |
| **PDF text layer cross-check** | OCR 출력 vs PDF 임베디드 텍스트 비교 → 큰 차이 시 stronger model 재시도 | PDF.js getTextContent ~150줄 |
| **Per-type specialized prompt** (객관식 / 서술형 / 도형) | cropDetect type 으로 분기, 타입별 룰 강조 | prompts.ts ~300줄 |

**원칙**: 모델 호출 추가 X — 기존 모델 + 더 좋은 입력 / 더 정밀한 prompt 로 정확도 ↑.

### 28-2. Tier 2 — 중기 (1-2 주, 비용 ↑)

| 방법 | 효과 | 비용 |
|---|---|---|
| **Sonnet 4.6 vision Pass 1 전환** | 한국어 수학 컨텍스트 강함, 도형 라벨 정확 | 5x ($0.003 → $0.015/page) |
| **Multi-model ensemble** (Gemini + Sonnet 병렬 후 vote) | 모델 disagree → warn flag → 사용자 검수 우선 | 2x 비용 + 2x 시간 |
| **Confidence-based 자동 재시도** | Pass 1 confidence=low → stronger model 자동 호출 | 케이스별 추가 |

### 28-3. Tier 3 — 장기 (구조적 변경)

| 방법 | 효과 | 노력 |
|---|---|---|
| **User correction learning** | 사용자 편집 패턴 저장 → 다음 prompt 에 inject | DB row + ~500줄 |
| **Side-by-side UI** (원본 crop ↔ OCR 텍스트) | 사용자 검수 속도 ↑ | ~400줄 UI |
| **Drag region selector** | 사용자가 "이 영역 재 OCR" 박스 | ~250줄 |
| **Curriculum template DB** | 중1/중2/중3 알려진 패턴 캐시 | DB + ~600줄 |

### 28-4. 사용자 결정 (2026-05-27)

| Tier | 적용 | 이유 |
|---|---|---|
| Tier 1 (4 항목 모두) | ✅ 전체 다 적용 (효과 클 것 같다는 직관) | 비용 0 + safe |
| Tier 2 | ✅ Sonnet 전환 + ensemble (측정 후 결정) | Tier 1 결과 측정 후 |
| Tier 3 | 🟡 후속 | 구조 변경 큰 작업 |

### 28-5. 구현 순서 + 위치

**Step 1**: `src/lib/imagePreprocess.ts` (NEW) — Canvas 기반 전처리 함수
- `upscaleImage(dataUrl, factor=2)` — Lanczos resampling 으로 2x
- `removeColorInk(dataUrl)` — red/blue 픽셀 → 흰색 (HSL 기반)
- `boostContrast(dataUrl, factor=1.2)` — 자동 contrast
- `preprocessForOcr(dataUrl)` — 위 3 단계 chain (`applyRotation` 직후 호출)

**Step 2**: `src/hooks/usePageOcr.ts` — preprocessForOcr 통합
- Pass 1 호출 직전: `const ocrInput = await preprocessForOcr(rotatedDataUrl)`
- Pass 2 (cropped) 도 동일

**Step 3**: `src/services/ai/handwritingMask.ts` (NEW) — pre-detect handwriting regions
- Canvas pixel histogram — red/blue dominant 영역 식별
- 결과: `handwritingRegions: BBox[]` array
- OCR prompt 에 inject: "다음 영역은 학생 손글씨 — 절대 무시"

**Step 4**: `src/lib/textLayerValidator.ts` (NEW) — PDF cross-check
- `validateOcrAgainstTextLayer(ocrText, pdfTextLayer)` → similarity score
- < 70% → warn + 자동 stronger model 재시도

**Step 5**: `prompts.ts` 분기 — `buildOcrPrompt(type)` 헬퍼
- `OCR_CHOICE_PROMPT` (보기 정확도 위주)
- `OCR_ESSAY_PROMPT` (배점·sub-parts boundary 위주)
- `OCR_DIAGRAM_PROMPT` (SVG vector spec 위주)

### 28-6. 측정 방법 (Tier 1 → Tier 2 결정 기준)

**측정 데이터셋**: 사용자 보유 실 시험지 10 종 (현재 + 새 업로드).
- 객관식 페이지 5, 서술형 페이지 5, 도형 페이지 5

**측정 지표**:
- **Pass 1 정확도** — OCR 결과 vs 정답 (수동 검수) 일치율 (%)
- **bbox precision** — Step 1.5 에서 사용자 수동 수정 박스 수 (낮을수록 좋음)
- **figure rendering accuracy** — SVG / image 가 원본과 같은가 (binary)
- **end-to-end success rate** — 사용자가 *편집 없이* "확정" 누른 비율

**Tier 1 적용 후 측정**:
- 정확도 90%+ → Tier 1 으로 충분, Tier 2 보류
- 정확도 80~90% → Tier 2 (Sonnet 전환) 도입 검토
- 정확도 80% 미만 → 다른 접근 필요 (모델 자체 한계)

### 28-7. 회귀 방지 — Tier 1 적용 시 확인

각 단계마다:
- [ ] `npx tsc --noEmit` exit 0
- [ ] 옛 시험지 (preprocessing 전) 도 정상 처리
- [ ] applyRotation 뒤 preprocessForOcr 호출 — 회전 + 전처리 양립
- [ ] Chrome MCP 시각 검증 — 전처리 전후 비교 가능 (DEV 모드 toggle 권장)
- [ ] `?croptest` 하니스 회귀 없음

### 28-8. 후속 — 분기점 결정

Tier 1 측정 후 사용자 보고:
- "여전히 별로" → Tier 2 즉시 진입 (Sonnet 전환 + ensemble)
- "괜찮아짐" → Tier 1 으로 stable, Tier 3 (UX) 검토
- "케이스별로 다름" → confidence-based 자동 재시도 추가

---

## 29. 2026-05-27 세션 종합 요약 + 다음 세션 roadmap

### 29-1. 이번 세션 commits (8 개, 시간순)

| # | Commit | 영역 | 핵심 변경 |
|---|---|---|---|
| 1 | `fbaa3dc` | artwork class + 손글씨 폰트 방어 | CropBox.class 4-way, OCR_PAGE_PROMPT Tier 4 강화, cropDetect schema/prompt |
| 2 | `eba282f` | 인접 박스 prompt 룰 | OCR_PAGE_PROMPT 4d-2 룰 (`\boxed{ABCD}` → 칸당 분리) |
| 3 | `25d2cc1` | runtime auto-split harness | `splitMultiLetterBoxed` 자동 분리 + CLAUDE.md §26-6~8 |
| 4 | `e0f9671` | GPT-5.5 complexity routing | DetectedCrop.complexity + `refineCropBoxesWithGpt55` + §27 |
| 5 | `dc12ac4` | UI 3 fixes | DALL-E 비용 표시 제거 + 박스크기 px + [그림N] inline 이미지 |
| 6 | `4c2eaf7` | 이미지 전처리 + §28 | `imagePreprocess.ts` (removeColorInk + contrast + 2x) + 인식률 카탈로그 |
| 7 | (이번 세션 마무리 commit) | fresh detection + §29 | GPT-5.5 Gemini bias 제거 + 세션 요약 |

### 29-2. 미완 작업 — 다음 세션 우선순위

**Tier 1 인식률 향상 (§28-1 사용자 결정 "전체 적용")** — 1/4 완료:

```
[Step 1] 이미지 전처리 (removeColorInk + contrast + upscale)  ✅ 완료 (4c2eaf7)
[Step 2] Pre-handwriting mask (red/blue 영역 위치 prompt 에 inject)  ⏳ 다음
[Step 3] PDF text layer cross-check (OCR vs PDF 임베디드 비교)  ⏳ 다음
[Step 4] Per-type specialized prompt (객관식 / 서술형 / 도형)  ⏳ 다음
```

**Tier 2 (측정 후 결정)** — §28-2:
- Sonnet 4.6 vision Pass 1 전환 ($0.015/page, 5x)
- Multi-model ensemble (Gemini + Sonnet vote)

**진행 권장**: Tier 1 전체 4 항목 완료 → 사용자 실 시험지 측정 → "여전히 별로" 면 Tier 2 진입.

### 29-3. 이번 세션 사용자 결정 카탈로그

| 카테고리 | 결정 | 출처 |
|---|---|---|
| Artwork 처리 | "별도 'artwork' class 신설" — 4-way (problem/figure/table/artwork) | AskUserQuestion 1차 |
| 손글씨 방어 | "글자체 / 폰트 일반적이지 않을테니 그걸 기준으로 방어로직" → 글자체·획 특성 카탈로그 | AskUserQuestion 1차 |
| Triage 시점 | "처음에 업로드하면 문항을 크롭하잖아. 크롭하면서 분류하면 안되나?" | AskUserQuestion 2차 |
| Dispatch 단위 | 문항 단위 (페이지 안 혼합 OK) | AskUserQuestion 2차 |
| GPT-5.5 prompt | 페이지 이미지 + complex 문항 번호 명시 (**fresh, no Gemini bias**) | AskUserQuestion 2차 |
| UI 비용 표시 | "사용자에게 예상 비용까지 보여줄 필요는 없고, 필요한 정보만" | 직접 보고 |
| [그림N] 처리 | "크롭된 그림이 있는데 [그림1] 본문 잔류 X" → SVG 또는 image inline | 직접 보고 |
| 박스크기 표시 | "% 말고 픽셀 크기" | 직접 보고 |
| 인식률 Tier 1 | "전체 다 적용" (4 방법 모두) | AskUserQuestion 3차 |
| 인식률 Tier 2 | "Sonnet 전환 + ensemble" (측정 후) | AskUserQuestion 3차 |
| CLAUDE.md 문서화 | "§28 으로 추가" (장기 보존) | AskUserQuestion 3차 |

### 29-4. 다음 세션 시작 시 추천 sequence

다음 세션 (또는 새 사용자 보고 시):

```
1. git log --oneline -10  → 최근 commits 확인
2. §29 (이번 세션) + §28 (인식률 카탈로그) + §27 (GPT-5.5 routing) 읽기
3. 사용자 측정 보고 듣기 — Tier 1 (이미지 전처리) 적용 후 정확도 어떤가?
4. 분기:
   (a) "여전히 별로" → Tier 1 나머지 3 항목 (§28-5 Step 2-4) 즉시 진행
   (b) "괜찮아짐" → Tier 1 stable, Tier 3 UX overhaul 검토
   (c) "특정 케이스만 문제" → 해당 케이스 root cause 분석 + 새 prompt 룰
```

### 29-5. 다음 세션이 빠르게 컨텍스트 잡을 핵심 인사이트

**이 5 가지를 우선 이해할 것**:

1. **Triage architecture** (§27-2): cropDetect (Gemini Flash) 가 *bbox + complexity 동시 분류* → complex 문항만 GPT-5.5 *fresh detection* (no Gemini bias). 사용자 결정에 따라 GPT-5.5 prompt 는 페이지 이미지 + 문항 번호만 받음.

2. **4-class CropBox** (§26-2): problem/figure/table/artwork. 99% 는 problem. artwork = vectorize 불가능 실사 reference.

3. **이중 방어선 패턴** (§26-6): 시각 패턴 분리는 *prompt + runtime* 양쪽. prompt 가 대다수 차단 + runtime 이 leak 케이스 안전망. (예: `\boxed{ABCD}` → 4d-2 룰 + `splitMultiLetterBoxed`).

4. **DB schema 변경 최소화 정책**: `cropBoxes JSONB`, `ai_usage.endpoint TEXT` 등이 backward-compatible. 새 필드 추가 시 *graceful fallback* (PGRST204 retry, §25-2).

5. **사용자 보고 사례 인용 패턴** (§7-5, §7-6): 일반 룰보다 *사용자 실제 보고 케이스* 를 prompt 에 그대로 박는 게 효과적. 이번 세션 추가된 사례: 서술형 4 (반 고흐 + 작도), 인접 박스 행 [A][B][C][D].

### 29-6. 검증 — 다음 세션 시작 전

```bash
cd D:\mathg-gen
npx tsc --noEmit 2>&1 | grep -v "export-pdf"  # exit 0 확인
git log --oneline -10                          # 최근 commits 확인
git status --short                             # 클린 확인
```

dev 서버 띄우려면:
```bash
npm run dev -- --port 3001 --strictPort
```

(Windows 3000 port 충돌 — 다른 프로젝트 MathLAB 이 점유 가능성, §18-1.)

### 29-7. 알려진 함정 / 제약 (다음 세션 회피용)

- **dev 환경 API 키 미노출** (§24-7): `vite.config.ts` 의 보안 조치로 dev 빌드는 SDK 호출 시 401. 실제 검증은 Vercel preview (`vercel deploy --yes`).
- **`vercel dev` 불가** (§23-4): Vite + vercel-dev 호환 안 됨. preview 배포로 우회.
- **백틱 함정** (§4-6, §25-4): `prompts.ts` 같은 큰 template literal 안 한국어 본문에 backtick 사용 시 parse error. 큰따옴표 또는 escape.
- **api/export-pdf.ts pre-existing error**: Puppeteer deps 미설치. 이번 세션 관여 X — 무시.

---

## 30. 2026-05-27 후속 세션 — 사용자 보고 "처리 실패" 디버그 (3 함정)

이번 세션 §25-29 작업 직후 사용자가 PDF 업로드 → Step 1.5 검수 단계에서 **"처리 실패 — 재시도해주세요"** 보고. 추가로 콘솔에 `ocr_feedback` 404 noise 다수. 디버그 과정에서 *세 가지 새로운 함정* 발견 + 카탈로그화.

### 30-1. schema required field 추가 → maxOutputTokens 한도 함정 (CRITICAL)

**증상**: Step 1.5 의 cropDetect 가 모든 페이지에서 *처리 실패*. dev console 의 진짜 에러는 prod 빌드에서 strip 됨 (§30-3 함정).

**Root cause**: §26-2 (artwork class) + §27-3 (complexity 분류) 작업으로 `CROP_DETECT_SCHEMA` 의 `items[*]` required field 가 5 → 7 개로 증가:

```
이전: number, type, cropBox, endMarkerKind, note
신규: number, type, class, complexity, cropBox, endMarkerKind, note
```

한 페이지에 5-7 문항이면 schema 출력이 ~1500 토큰. 그러나 `cropDetect.ts` 의 `maxOutputTokens: 8192` 가 prompt + reasoning 토큰까지 포함이라 부족. → 응답 잘림 → invalid JSON → `parseJsonOrThrow` throw → friendly 변환 → UI "처리 실패".

**해결**: callGemini 와 동일한 `maxOutputTokens: 65536` + `finishReason === "MAX_TOKENS"` 명시적 처리 (CLAUDE.md §1-2 의 OCR 적용 패턴을 cropDetect 에도 동일하게):

```ts
const finishReason = (response as { candidates?: Array<{ finishReason?: string }> })
  .candidates?.[0]?.finishReason;
if (finishReason === "MAX_TOKENS") {
  throw new Error(
    `Gemini 토큰 한도 초과 (페이지 분석 실패) — 손글씨/문항 과다. 재시도하세요.`,
  );
}
// 빈 응답 시 finishReason 진단 (SAFETY / RECITATION / OTHER)
const rawJson = typeof response.text === "string" ? response.text : "";
if (!rawJson) {
  const reason = finishReason ?? "unknown";
  throw new Error(`Gemini 빈 응답 (finishReason=${reason}) — 재시도하세요.`);
}
```

GPT-5.5 refine (`refineCropBoxesWithGpt55`) 도 8192 → 16384 안전 마진 (reasoning.effort="low" 가 reasoning 토큰을 max_output_tokens 안에서 소진).

**원칙 — schema required field 추가 시 *4 단 체크***:

| □ | 항목 |
|---|---|
| □ | 모든 호출 사이트의 `maxOutputTokens` / `max_output_tokens` 가 *충분*한지 재측정 (`(field 수) × 문항 수 × ~30 tokens` minimum) |
| □ | `finishReason === "MAX_TOKENS"` 명시적 처리 — 없으면 silent invalid JSON throw |
| □ | 빈 응답 (`response.text === ""`) 시 `finishReason` 으로 진단 메시지 |
| □ | callGemini / callOpenAI / cropDetect 등 *모든 비슷한 호출 경로* 가 *같은* MAX_TOKENS 처리 (한 곳만 fix 하면 다른 path 에서 같은 함정 재발) |

§1-2 의 함정이 cropDetect 까지 *전염* 됐는데 호출 경로가 다르다는 이유로 같은 fix 적용을 누락. *새로운 AI 호출 path 추가 시* 반드시 callGemini 의 함정 처리 패턴을 *복사*.

### 30-2. friendlyError 한국어 메시지 길이 fallback 함정 (CRITICAL)

**증상**: cropDetect 가 진단 정보 포함한 한국어 에러 ("Gemini 토큰 한도 초과...") 를 throw 해도 *UI 에 "처리 실패 — 재시도해주세요." fallback* 만 표시 → 진단 가치 0 → 사용자가 root cause 추적 불가능.

**Root cause**: `friendlyError.ts` 의 한국어 통과 룰:
```ts
if (hangulCount > 0 && hangulCount / msg.length > 0.3 && msg.length < 100) {
  return msg;  // 통과
}
```
길이 한도 `< 100` 자가 너무 보수적. 우리 자체 한국어 에러 메시지가 *진단 정보* (모델 이름, 토큰 한도, finishReason 등) 포함해 100-200자 되는 케이스 정상. 그런데 한도 초과 → fallback (msg.length > 80 → "처리 실패") 으로 떨어짐.

**해결**: 길이 한도 100 → 200 으로 확대. 자체 한국어 메시지는 항상 통과시키되, 외부 영문 raw error 는 여전히 짧게 변환.

```ts
if (hangulCount > 0 && hangulCount / msg.length > 0.3 && msg.length < 200) {
  return msg;
}
```

**원칙**: friendly 변환 layer 가 *자체 진단 메시지를 fallback 으로 덮어쓰는* 함정. 우리 *자체 throw* 의 한국어 메시지는 *항상 그대로 통과* 시키는 게 정답. 길이 한도는 외부 영문 raw 만 적용 (또는 한국어는 길이 무관 통과).

후속 검토 — friendlyError 에 *prefix 기반 통과* 패턴 검토 가능:
```ts
// 자체 throw 의 식별 prefix → 길이 무관 통과
if (msg.startsWith("[cropDetect]") || msg.startsWith("[useSolutionGen]") || ...) {
  return msg.replace(/^\[[^\]]+\]\s*/, ""); // prefix strip
}
```
현재는 길이 200 으로 안전 영역 충분. 추가 prefix 패턴은 사용자 보고 발생 시.

### 30-3. prod 빌드의 console.warn strip 함정 — dev console 진단 불가

**증상**: 사용자가 *Vercel preview* (`index-CwNVid7e.js` minified bundle) 에서 보고 있을 때, `useCropDetect.ts` 의 `console.warn` 이 모두 *invisible*:

```ts
} catch (err) {
  ...
  setCropDetectError(page.id, friendlyError(err));
  if (import.meta.env?.DEV) {  // ← prod 에서 false → console.warn 안 찍힘
    console.warn(`[useCropDetect] page ${page.id}:`, (err as Error).message);
  }
}
```

prod 에서 fan-out hook 의 *진짜 에러 메시지* 가 console 에 *전혀* 안 보임. 사용자는 UI 의 friendly 메시지 + 콘솔의 *무관한* 에러 (예: ocr_feedback 404) 만 본다. 디버깅 시 *근본 원인 추적 불가능*.

**해결책 — 3 layer 진단**:

1. **UI friendly 메시지를 *진단 가치 있게*** (§30-2 길이 한도 확대 + §30-1 명확한 한국어 에러).
2. **prod 빌드에서도 첫 발생 console.warn 1 회 emit** — 단 사용자 데이터 leak 방지를 위해 *짧고 익명* 한 메시지만:
   ```ts
   if (import.meta.env?.DEV) {
     console.warn(`[useCropDetect] page ${page.id}: ${(err as Error).message}`);
   } else {
     // prod 도 진단 가치 있게 — page id 와 짧은 메시지만 (PII 없음)
     console.warn(`[useCropDetect] cropDetect failed: ${(err as Error).message.slice(0, 200)}`);
   }
   ```
3. **dev 환경 사용 권장** — 사용자가 prod 에서 보고 시 *우선 dev 재현* 안내. dev console 에 full 진단 가능.

이번 세션은 layer 1 (UI friendly 메시지 명확화) + layer 3 (dev 사용 안내) 만 적용. layer 2 (prod console.warn 활성화) 는 *후속 검토* — PII leak 위험 vs 디버깅 편의성 trade-off.

**원칙**: prod 빌드의 console.warn 모든 strip 정책이 *디버깅 가치* 와 충돌. fan-out hook 의 catch 에서 *익명·짧은* warn 은 prod 에도 emit 하는 게 합리적. 새 fan-out hook 추가 시 *처음부터* prod-safe warn 패턴 사용.

### 30-4. ocr_feedback 테이블 미마이그레이션 — 404 noise 함정 (CLAUDE.md §25-2 적용)

**증상**: 콘솔에 `GET .../rest/v1/ocr_feedback?... 404 (Not Found)` 가 *문항당 1 회씩* 폭주. PostgREST 의 404 는 *테이블 자체가 schema cache 에 없음* 의미 (Phase #6 의 ocr_feedback 테이블이 production Supabase 에 ALTER TABLE / CREATE TABLE 마이그레이션 안 됨).

**Root cause**: schema.sql L321-388 의 `CREATE TABLE IF NOT EXISTS ocr_feedback` 가 *코드는 commit 됐지만* 사용자가 Supabase SQL editor 에서 실행 안 함. 클라이언트 코드는 *테이블 존재 가정* 으로 fetch → 404.

**해결** (CLAUDE.md §25-2 graceful fallback 패턴 적용):

```ts
const TABLE_MISSING_RE = /(PGRST20[45]|schema cache|relation .* does not exist|404)/i;
const isTableMissing = (err): boolean => {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "PGRST204") return true;
  if (err.status === 404) return true;
  return TABLE_MISSING_RE.test(err.message ?? "");
};

let warnedMissingTable = false;
const warnSchemaMigration = (): void => {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  console.warn("[ocrFeedback] ocr_feedback 테이블이 Supabase 에 없습니다 — schema.sql §8 블록 실행 필요. 마이그레이션 전까지 👍/👎 기능 비활성.");
};
```

`ocrFeedback.ts` 의 모든 호출 (submit / getMy / listByTest / delete / listScrapped / resolve / unresolve / loadSummary) 의 catch 에 `isTableMissing(error) → warnSchemaMigration + silent return` 추가. 404 noise → 1 회 warn → fallback (👍/👎 비활성, OCR 자체 영향 0).

**원칙 — schema 변경 → 마이그레이션 강제 정책의 한계**:
- Supabase 는 *자동 마이그레이션* 안 함 (대시보드 SQL editor 수동)
- `schema.sql` 커밋만으로 *production* 반영 X
- 사용자가 잊거나, *다른 환경* (Vercel preview vs production) 적용 안 함
- → 클라이언트 코드의 *graceful fallback 이 필수* — schema 변경 의존성 0 으로 동작

새 테이블 추가 PR 시 *반드시* §25-2 패턴 묶음 (isTableMissing + warnSchemaMigration + 모든 호출 catch) 동시 적용. 마이그레이션 안내 한 번이 사용자에게 *충분* (warnedMissingTable 한 번 set).

### 30-5. 이번 세션 변경 파일 + 후속 액션

**변경 파일 (3)**:

| 파일 | 변경 | 영역 |
|---|---|---|
| `src/services/ai/cropDetect.ts` | maxOutputTokens 8192→65536, MAX_TOKENS finishReason 처리, refine 8192→16384 | §30-1 |
| `src/lib/friendlyError.ts` | 한국어 메시지 길이 한도 100→200 | §30-2 |
| `src/services/api/ocrFeedback.ts` | 모든 호출 graceful 404 fallback | §30-4 |

**후속 액션 — 사용자 위임**:
- 🚨 **Supabase SQL editor 에서 `schema.sql` §8 (ocr_feedback) 블록 실행** — 👍/👎 기능 활성화. 코드 fallback 으로 404 noise 는 차단되지만 실제 기능 사용 위해 필요.
- 🟢 **Vercel preview deploy** — `vercel deploy --yes`. prod 빌드에 이번 fix 반영.
- 🟢 **dev 에서 직접 재현** — `npm run dev` (3001 포트). PDF 업로드 → Step 1.5 진입 → cropDetect 동작 확인. dev console 의 `[useCropDetect]` warn 으로 진짜 에러 추적 가능.

**다음 세션 시작 시 추천 sequence** (§29-4 보강):
1. `git log --oneline -10` — 이번 세션 commits 확인
2. §30 (4 함정 카탈로그) + §29 (이번 세션 종합) + §25-2 (graceful fallback 패턴) 읽기
3. 사용자 보고 들으면:
   - **"prod 에서 또 X 안 됨"** → 우선 *dev 재현* 안내 (§30-3 함정). 사용자 보고 우선 dev 환경에서.
   - **"Supabase 404"** → schema.sql 의 새 테이블이 마이그레이션 안 된 케이스. §30-4 패턴 즉시 적용.
   - **"AI 호출 실패"** → §30-1 의 4 단 체크리스트로 토큰 한도 / finishReason / friendly 메시지 길이 검증.

### 30-6. 메타 원칙 — *함정의 전염* (cross-cutting concern)

이번 세션의 4 함정 모두 *기존 카탈로그된 함정의 새 발현*:

| 새 함정 | 원형 (이미 카탈로그된) | 차이 |
|---|---|---|
| §30-1 cropDetect maxOutputTokens | §1-2 callGemini MAX_TOKENS | 호출 *경로* 다름 — 동일 fix 누락 |
| §30-2 friendlyError 길이 fallback | (없음 — 신규 함정) | friendly 변환 layer 의 가려짐 효과 |
| §30-3 prod console.warn strip | (없음 — 신규 함정) | DEV-only 로깅의 prod 진단 부재 |
| §30-4 ocr_feedback 404 | §25-2 PGRST204 컬럼 fallback | 컬럼 → 테이블 단위 확장 |

**일반 원칙**: 함정 카탈로그 (CLAUDE.md) 의 *원형* 을 따라가되, *호출 경로 / layer / 단위가 다르면* 동일 함정이 *다른 옷* 입고 재발. 새 코드 추가 시 *체크리스트 형태* 로 모든 비슷한 path 검토:
- AI 호출 추가 → §1-2 MAX_TOKENS 처리 + maxOutputTokens 검증
- 새 Supabase 테이블 → §25-2 graceful fallback 동시 적용
- 친구 메시지 변환 → 자체 한국어는 무조건 통과
- prod 빌드 사용자 보고 → 우선 dev 재현 안내

§30 의 4 함정은 *모두* 이미 알려진 패턴이었지만 새 path 에서 미적용. 새 PR 시 *CLAUDE.md 의 모든 §* 를 *전수 검색* 하는 도구·습관이 필요. 사용자 보고 → 즉시 grep 으로 *비슷한 함정* 카탈로그 매치.

---

## 31. 2026-05-29 세션 — Phase N+ (시험지 분석 화면 확장) + 함정 카탈로그

mathlab 시험지 분석 기능을 mathg-gen 의 *통계 탭* 으로 carry-over (Phase N+1~N+4)
하면서 부딪힌 *차트/폰트/렌더링 함정 + recharts/KaTeX 전역 CSS 충돌* 카탈로그.
이 세션의 함정은 대부분 *전역 CSS 룰 (globals.css) 이 새 컴포넌트를 의도치 않게
잡는* cross-cutting 형태 (§30-6 의 "함정의 전염" 변형).

### 31-1. recharts 차트가 작게 그려짐 — globals.css `svg max-width: 360px` 룰 (CRITICAL)

**증상** (사용자 4 차 반복 보고): 통계 탭의 *문항별 배점* (ComposedChart) 만
카드 폭의 ~40% 로 작게 그려짐. 다른 차트 (도넛/막대/레이더) 는 정상.

**잘못된 가설들** (모두 실패 — 시간 낭비):
- ResponsiveContainer width 측정 실패 → `aspect` prop / `debounce={0}` / 직접
  `useRef + ResizeObserver` measurement → *전부 무효*
- `height="100%"` fallback 0 → pixel `height={280}` → *무효*

**진짜 근본 원인** (Chrome DevTools DOM inspect 로 확정):
```js
// .recharts-surface 측정
surfaceAttrWidth: "837"   // SVG width 속성 — recharts 정상 측정 ✓
surfaceClientWidth: 360   // 실제 표시 폭 — CSS 가 360 으로 압축 ❌
```
→ `globals.css` 의 `.prose svg / .text-body svg / .text-text svg { max-width:
360px }` (수학 도형 SVG 카드 크기 제한 의도) 이 *recharts 차트 SVG 도* 잡음.
다른 차트는 grid 2-col 안 < 360px 라 영향 없었고, 문항별 배점만 837px →
360px 축소.

**Fix**: KaTeX 처럼 recharts 도 `:not()` 제외.
```css
.prose svg:not(:where(.katex *)):not(:where(.recharts-wrapper *)):not(.recharts-surface), ...
```

**교훈**: "차트가 작다" 류 증상은 *컴포넌트 코드* 가 아니라 *전역 CSS* 가 범인일
수 있다. 추측성 코드 수정 전에 **Chrome DevTools 로 `getBoundingClientRect().width`
(실제 표시) vs SVG `width` attribute (측정값) 를 직접 비교** — 둘이 다르면
*CSS 압축*, 같으면 *측정 실패*. DOM inspect 없이는 영원히 못 찾는다.

### 31-2. 차트 글자 italic + serif — globals.css `svg text` 전역 룰

**증상**: recharts 차트의 축 라벨 / tick / legend 가 *이탤릭 + Times serif +
흰 stroke*. 컴포넌트의 `fontFamily` prop 무시.

**원인**: `globals.css` 의 `svg text { font-family: "Times New Roman" serif;
font-style: italic; stroke: #fff 3px }` (수학 도형 변수 italic 의도) 이 *모든
SVG text* → recharts tick 도 적용. 컴포넌트 inline style 은 전역 CSS 우선순위에
밀림.

**Fix**: `.recharts-wrapper text` / `.recharts-cartesian-axis-tick` 등 9 selector
override — `font-family sans-serif !important; font-style normal !important;
stroke none !important`.

**교훈**: §31-1 과 동일 원형 — *수학 도형용 전역 svg 룰* 이 recharts 도 잡음.
새 SVG-기반 라이브러리 (recharts/d3 등) 추가 시 globals.css 의 `svg`, `svg text`
전역 룰 충돌 *반드시* 확인.

### 31-3. KaTeX 다중 인스턴스 frozen — MarkdownRenderer 무거움 (CRITICAL)

**증상**: AI 코멘트 탭의 ai_comment 22 문항을 *MarkdownRenderer* 로 렌더 →
화면 frozen (CDP screenshot 30s timeout, renderer unresponsive).

**원인**: MarkdownRenderer 는 SVG 추출 + placeholder + ReactMarkdown + rehype
*full pipeline*. 한 화면 *44 인스턴스* (22 문항 × ai_comment + 난이도근거)
동시 mount → main thread block (§21-10 무거운 reflow 변형).

**Fix**: 경량 `KaTeXInline` 컴포넌트 신설 (`src/components/math/KaTeXInline.tsx`).
- `katex.renderToString` 만으로 `$...$` 치환 — ReactMarkdown/SVG pipeline 없음
- `applyMathInnerNormalization` (cleanMalformedLatex + 가분수→대분수 +
  uprightGeometryLabels + dfrac) 통과 — MarkdownRenderer 와 동일 정규화
- 44 인스턴스도 가볍게 동작

**교훈**: *짧은 인라인 수식* (코멘트/라벨) 을 *표/리스트에 수십 개* 렌더할 땐
MarkdownRenderer (무거운 블록) 대신 *KaTeXInline* (경량). MarkdownRenderer 는
*문제 본문/해설 같은 긴 블록 1~수개* 용.

### 31-4. KaTeXInline 도 도형 라벨 직립 필요 — applyMathInnerNormalization export

KaTeXInline 이 처음 `cleanMalformedLatex` 만 거쳐 *uprightGeometryLabels 누락*
→ 도형 점 라벨 ($ABCD$ 등) 이 italic (§2-10 위반: 점·선·면은 직립 Roman,
변수만 italic). `applyMathInnerNormalization` 을 export 화 (textPreprocess.ts)
해서 KaTeXInline 이 사용 → MarkdownRenderer 와 *동일 정규화 묶음*.

**교훈**: 새 경량 렌더러 만들 때 *정규화 묶음을 빠뜨리지 말 것*. MarkdownRenderer
의 `applyMathInnerNormalization` 이 *단일 source of truth* — 모든 KaTeX 렌더
경로가 이걸 통과해야 일관 (도형 직립 / 가분수 / dfrac / typo 정상화).

### 31-5. KaTeX 분수 가독성 — `.mfrac` 폰트 보정

분자·분모가 본문 대비 작게 보임 (KaTeX 조판 관행). `\dfrac` 강제로도 완전
해결 안 됨. `globals.css` 의 `.katex .mfrac { font-size: 1.07em }` + 중첩
분수 누적 방지 (`.mfrac .mfrac { 1em }`). *전역* — OCR/해설/변형/분석 모든 분수.

### 31-6. Phase N+ 카탈로그 (분석 화면 기능)

- **차트 4종** (DifficultyDonut/UnitBarChart/DomainRadar + 문항형식) — grid 2x2.
  DomainRadar 의 `PolarRadiusAxis tick={false} axisLine={false}` (내부 0/2/4
  눈금 라벨 제거).
- **derived 분석** (schema 무변경): Level chip (가중평균) / 신뢰도 (confidence
  평균) / 서술형 집중 / 문항별 배점 (recharts ComposedChart) / 변별력 (4-bucket).
- **commentary** (Sonnet 4.6 + caching): examCommentaryPrompts.ts (mathlab
  buildPrompt) + examCommentary.ts + api/ai-exam-commentary.ts. exam_analyses.
  commentary JSONB (graceful fallback §25-2). V3 블로그 X, V4 학원블로그 N+5 비활성.
- **학습대책 8섹션**: TopicAnalysis (대단원 그룹핑) + Learning (teaching_rec) +
  Level (score_strategies) + Killer (notable) + Essay (체크리스트) + TimeAllocation
  (배점 derived) + Mistakes (영역 제네릭) + Timeline (4주 고정). mathlab 10 중
  Personalized (학생 답안) / GradeConnections (curriculum 322줄) 제외.
- **3 sub-tab** (Segmented): 기본 분석 / AI 코멘트 / 학습 대책.

### 31-7. Library 정렬/삭제 (사용자 보고)

- **sortTests recent no-op** → `TestPaper.createdAt` (ISO) 추가 + mapper 매핑
  (기존엔 `time` 상대문자열만 보존) + createdAt desc 정렬. "최근 작업" 고정
  헤더 → `SORT_META` 동적 라벨 (정렬 안 되는 인상 제거).
- **삭제**: `libraryStore.removeTest` (DB+Storage cascade 완비) 를 UI 연결.
  TestCard hover 좌상단 trash + window.confirm. TestList row 는 `<button>` →
  `<div role=button>` (nested button 회피 §3-5).

### 31-8. 세션 메타 — DOM inspect 우선 + mathlab 벤치마크

사용자가 *"근본 원인 찾아라 / mathlab 벤치마킹"* 강조한 함정 (§31-1) 은 결국
*Chrome DevTools DOM 측정* 으로 해결. 추측성 코드 수정 (ResponsiveContainer /
aspect / measurement) 을 4 회 반복하며 시간 낭비. **시각 증상 (크기/위치/폰트)
은 코드보다 *전역 CSS* 가 범인인 경우가 많고, DOM computed style 직접 측정이
유일한 확정 수단**. "mathlab 은 되는데 우리는 안 됨" → mathlab 의 *해당 컴포넌트
+ 부모 wrapper + 전역 CSS* 3 층 모두 비교.

---

## 32. 2026-06-02 세션 — 중복 로컬 hook drift + Supabase 잘못된 프로젝트 (2 함정)

이번 세션 사용자 보고: "여전히 이미지가 안보이는데 체크" (고흐의 의자 작품 미표시)
+ `furthest_step` SQL 마이그레이션이 `42P01: relation "tests" does not exist` 로
실패. 두 함정 모두 *표면 증상* 과 *근본 원인* 이 멀리 떨어진 케이스.

### 32-1. 공용 hook 의 *로컬 복사본 drift* — 특정 경로에서만 깨짐 (CRITICAL)

**증상** (사용자 3 차 반복 보고): OCRItem 의 ai-crop 이미지 (작품 / 도형) 가
*해설(Step3)·검토(Step4) 화면에서만* 안 보임. OCR(Step2) 에서는 정상. 특히
*"이어서 작업"으로 hydrate 한 세션* 에서 재현.

**Root cause**: `usePageImageDataUrl` 이 **4 군데** 에 존재 —
- `src/hooks/usePageImageDataUrl.ts` (공용, `WizardPage` 받음, **3-layer:
  IndexedDB → Storage fallback → rotation**)
- `Step2OCRReview.tsx` 로컬 (`WizardPage` 받음, Storage fallback **있음** — 정상)
- `Step3SolutionReview.tsx` 로컬 (`imageRef: string` 받음, **IndexedDB 만** — 결함)
- `Step4Review.tsx` 로컬 (`imageRef: string` 받음, **IndexedDB 만** — 결함)

Step3/4 의 로컬 hook 은 Storage fallback 이 없어서, hydrate 세션 (페이지
이미지가 IndexedDB 아니라 Supabase Storage 에만 존재) 에서 `getPageImage` miss →
`pageImage = null` → OCRItem 의 `cropPageImageData(pageImageDataUrl, ...)` 가
*null 입력* → 크롭 실패 → 작품/도형 silently 사라짐.

**Fix** (commit `3b1e83c`): Step3/4 의 로컬 hook 제거 → 공용
`@app/hooks/usePageImageDataUrl(activePage)` import. 미사용 import (`getPageImage`,
`useState`/`useEffect`) 도 정리.

**원칙 — 공용 hook 이 있으면 *로컬 복사본 절대 금지***:
- 복사본은 *원본이 진화할 때 (Storage fallback 추가 등) 같이 안 바뀜* → drift.
- drift 한 복사본은 *특정 경로에서만* 깨짐 (여기선 hydrate 세션) → 디버깅 최악.
  일반 dev (IndexedDB 캐시 있음) 에서는 재현 안 돼서 "내 환경에선 되는데" 함정.
- 새 화면이 페이지 이미지 필요 시 *반드시* `@app/hooks/usePageImageDataUrl` 사용.
  로컬 `const usePageImageDataUrl = ...` 패턴 발견 즉시 공용으로 교체.

**찾는 법**: `grep -rn "const usePageImageDataUrl\|usePageImageDataUrl =" src/` —
공용 export 외에 로컬 정의가 있으면 전부 drift 후보. 같은 패턴이 다른 공용 hook
(`usePageImageDataUrl`, `useCroppedImages` 등) 에도 적용.

**참고**: `src/hooks/usePageImageDataUrl.ts` (공용 — 단일 source of truth),
`src/components/wizard/Step3SolutionReview.tsx` / `Step4Review.tsx`.

### 32-2. tsc 가 *타입 발산 (divergence)* 을 드러내는 진단 도구

처음에 Step3 의 호출을 `usePageImageDataUrl(activePage)` (WizardPage 객체) 로
바꿨더니 tsc 가 `error TS2345: Argument of type 'WizardPage' is not assignable
to parameter of type 'string'` 를 emit. 이 에러가 *결정적 단서* — Step3 의 hook
param 이 `string` 인데 Step2 는 `WizardPage` → **두 hook 이 서로 다른 시그니처
= 로컬 복사본 drift** 임을 즉시 확정.

**원칙**: 같은 이름의 hook/함수 호출이 *한 화면에선 type OK, 다른 화면에선
type error* 면 → *서로 다른 정의* (로컬 복사본 또는 import 경로 차이) 를 쓰고
있다는 강한 신호. tsc 를 *버그 진단 도구* 로 활용 — 에러 메시지의 *기대 타입*
(여기선 `string`) 이 어느 정의를 가리키는지 역추적.

**연계** (§4-6 / 작업 흐름): tsc 는 *git 앞 게이트* — 절대 `tsc && git` 으로
체이닝하지 말 것. 이번에도 잘못된 1 차 수정 (string param hook 에 객체 전달) 을
tsc 가 commit 전에 차단. 통과 확인 *후에만* 커밋.

### 32-3. Supabase `42P01 relation does not exist` — 잘못된 프로젝트 함정

**증상**: 사용자가 SQL editor 에서 `ALTER TABLE tests ADD COLUMN ...` 실행 →
`42P01: relation "tests" does not exist`. 그러나 앱 코드 (`tests.ts` 의
`.from("tests")`) 와 `schema.sql` (`CREATE TABLE IF NOT EXISTS tests`) 둘 다
*tests* 테이블을 명백히 사용 → 테이블은 존재함.

**Root cause**: 사용자의 SQL editor 가 *다른 Supabase 프로젝트* 에 연결돼 있었음
(이 앱 스키마가 없는 프로젝트). 사용자 확인: "다른 supabase 에서 했었어".

**진단 절차 (재사용)**:
1. 앱이 실제 연결하는 프로젝트 ref 확인 — `.env.local` 의 `VITE_SUPABASE_URL`
   (`https://<ref>.supabase.co`). 이 ref 는 *공개 값* (클라이언트 번들에 포함) →
   surface 해도 안전 (anon key 와 다름).
2. 사용자에게 *그 ref 의* SQL editor 를 열라고 안내.
3. 프로젝트 확인 쿼리:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' ORDER BY table_name;
   ```
   `tests`, `pages`, `ocr_problems` ... 가 보이면 올바른 프로젝트.
4. 멱등 ALTER + 검증:
   ```sql
   ALTER TABLE tests ADD COLUMN IF NOT EXISTS furthest_step SMALLINT DEFAULT 0;
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'tests' AND column_name = 'furthest_step';  -- 1행 = 성공
   ```

**원칙**: `42P01` 인데 *코드상 테이블이 분명히 존재* 하면 → 테이블 이름 오타가
아니라 *연결 프로젝트* 의심. `VITE_SUPABASE_URL` 의 ref 를 사용자에게 알려
정확한 프로젝트로 유도. (이번 앱 ref: `sfclzyusmpavhuegqvcu`.)

**연계** (§25-2 / §30-4): graceful fallback 덕분에 *마이그레이션 전에도 앱은
정상 동작* — `tests.ts` 의 PGRST204 retry 가 `furthest_step` strip. 마이그레이션은
*진행단계 칩 영속화* 만을 위한 것. 즉 "SQL 안 됐다" 보고를 받아도 *기능 자체는
안 막혀 있음* 을 먼저 안내.

**마이그레이션 직후 주의**: 기존 행은 `furthest_step` 기본값 `0` → 칩 숨김
(commit `298fd97` — `furthestStep === 0` 이면 "업로드 단계" 오표시 방지). 해당
시험지 재진행 시 `wizardSync` 가 올바른 값 동기화 → 칩 표시. 신규 시험지는 처음부터 정확.

### 32-4. 메타 — 함정의 전염 (§30-6 재확인)

이번 2 함정도 *기존 카탈로그 원형의 새 발현*:

| 새 함정 | 원형 | 차이 |
|---|---|---|
| §32-1 로컬 hook drift | §16-3 / §11-2 (공유 헬퍼 단일 source) | 헬퍼/prompt → React hook 으로 확장 |
| §32-3 잘못된 프로젝트 | §25-2 / §30-4 (schema fallback) | 미마이그레이션 → 잘못된 프로젝트로 확장 |

**일반 원칙 (§7-1 / §16-3 재확인)**: *복사-붙여넣기 금지, 단일 source of truth*
는 prompt prefix·sanitize 함수뿐 아니라 *React hook* 에도 동일 적용. 공용 hook
존재 시 로컬 변형 만들지 말 것 — drift 가 *특정 런타임 경로* (hydrate 세션) 에서만
터져서 가장 추적하기 어렵다.

**참고**: commit `3b1e83c` (Step3/4 공용 hook 교체).

## 33. 변형(Variant) 기능 비활성 + 부활 조건 (2026-06-04 세션)

> **⚠️ 상태 갱신 (2026-06-23): §33-1·§33-2 재오픈됨.** 사용자 요청으로 변형 출력 옵션
> (변형만/원본+변형, `EXPORT_SOURCE_OPTIONS` disabled 제거)과 변형 이력
> (`VARIANT_HISTORY_ENABLED = true`)을 다시 켰다. 생성 파이프라인은 §33대로 계속 intact.
> *재비활성* 필요 시 아래 플래그 복구. 단 §33-2의 비활성 사유(읽기전용 카드·digitize 노이즈)는
> 미해소 상태 — actionable 재설계는 후속. 자세한 내용 §38.

변형 생성·출력의 품질/완성도가 아직 미달이라 사용자 결정으로 *내보내기 출력 대상*
과 *변형 이력 UI* 를 비활성화. **데이터 레이어 (variant_history 적재, 변형 생성
파이프라인 Step3/4) 는 그대로 유지** — 아래 플래그/코드만 되돌리면 복구된다.
관련 패턴: V4 블로그의 `V4_BLOG_ENABLED = false` (V4BlogView.tsx) 와 동일한 플래그
게이팅 정책.

### 33-1. 변형 출력 (내보내기 "출력 대상") 비활성 — commit `3ec8655`

**현재 상태**: 출력 대상이 *원본만 / 변형만 / 원본+변형* 순서, **원본만 기본 선택**,
*변형만·원본+변형 은 비활성* (회색 + 클릭 불가 + "준비 중" 툴팁).

**코드 위치**:
- `src/components/print/PrintOptionsPanel.tsx` `EXPORT_SOURCE_OPTIONS` — `variant`/
  `both` 에 `disabled: true`. `ENABLED_EXPORT_SOURCES` 로 비활성 값이면 useEffect 가
  `original` 로 coerce (옛 세션 보호).
- `src/stores/wizardStore.ts` `exportSource` 기본값 = `"original"` (initialState +
  `onRehydrateStorage` fallback 둘 다).
- `src/components/ui/Segmented.tsx` — per-option `disabled`(+`title`) 지원 추가.

**부활 절차**:
1. `EXPORT_SOURCE_OPTIONS` 의 `variant`/`both` 에서 `disabled`/`title` 제거.
2. (선택) `exportSource` 기본값을 `"original"` 유지할지 `"variant"` 로 되돌릴지
   재결정 — wizardStore initialState + rehydrate fallback 두 곳 동시.
3. Segmented 의 `disabled` 지원은 그대로 둬도 무방 (다른 곳에서 재사용 가능).
4. coerce useEffect 는 비활성 옵션이 없으면 no-op 이라 그대로 둬도 안전.

### 33-2. 변형 이력 섹션 숨김 — commit (이번 세션)

**현재 상태**: DetailScreen 우측 사이드바의 *변형 이력* 섹션 **완전 숨김**.

**코드 위치**: `src/components/detail/DetailMetaSidebar.tsx` `VARIANT_HISTORY_ENABLED
= false` 플래그로 섹션 전체 게이팅. *최근 N개 + 더보기/접기* 렌더 로직
(`VARIANT_PREVIEW_COUNT`, `showAllVariants`) 은 플래그 안에 **그대로 보존**.

**데이터는 계속 쌓임**: `wizardSync.ts` 가 Step4 첫 seed 때 `insertVariantBatch`
호출 → `variant_history` 적재. `loadVariantHistory` 도 그대로. 즉 플래그만 켜면
과거 이력이 온전히 복구된다.

**비활성 사유 (부활 시 판단 기준 — 재발 방지)**:
1. **non-actionable** — 이력 카드가 `<div>` (onClick 없음). 클릭해도 과거 변형
   *열기/재출력/비교/복원* 불가 → 읽기 전용 로그라 가치 낮음.
2. **digitize 노이즈** — `goal === "digitize"`(원본 유지) 도 `insertVariantBatch`
   로 기록 (intensity 0, "디지털화만 · 원본 유지"). 실제 변형이 아닌데 "변형
   이력" 에 떠서 의미 어긋남.
3. **변형 출력 자체 비활성** (§33-1) — 내보낼 수 없는 변형을 추적할 실익 적음.

**부활 절차 (옵션 C — actionable 재설계 권장)**:
- *최소* 복구: `VARIANT_HISTORY_ENABLED = true` 만 → 읽기 전용 그대로 부활.
- *권장* 복구: 카드를 **actionable** 하게 — onClick → 해당 변형 배치 열기 / 재출력
  / 원본 대비 비교. 핸들러 + 라우팅 추가 필요.
- digitize(intensity 0) 이력은 "변형 이력" 에서 **제외하거나 별도 라벨** (위 사유 2).

### 33-3. 부활 통합 체크리스트 (변형 기능 본격 출시 시)

- [ ] 변형 생성 품질 검증 (Step3 옵션 → Step4 변형 결과 — similar/variant/targeted).
- [ ] §33-1: `EXPORT_SOURCE_OPTIONS` 의 `disabled` 제거 (+ 기본값 정책 재결정).
- [ ] §33-2: `VARIANT_HISTORY_ENABLED = true` (+ 가능하면 actionable 재설계).
- [ ] digitize 이력을 "변형 이력" 에서 분리 or 별도 라벨.
- [ ] 변형 출력 PDF/DOCX 실제 산출물 검증 (원본+변형 1단 layout 포함).

**원칙**: "준비 중" 기능은 *삭제하지 말고 플래그 게이팅* — 데이터/스캐폴드 보존 +
한 줄로 복구. 단 부활 시 *왜 껐었는지* (위 사유) 를 먼저 해소했는지 확인.

## 34. 보안 검수 패치 기준선 (2026-06-09, commit `4fa6722`)

이번 섹션은 과거 메모 중 `api/export-pdf.ts deps missing`, `tsc exit 0 (api/export-pdf 제외)`,
브라우저 직접 AI 호출 전제, 개발 라우트 운영 노출 전제를 **대체**한다. 이후 검수는 아래
상태를 기준으로 진행한다.

### 34-1. Vite env 로딩: `loadEnv(..., "")` 금지

`vite.config.ts` 에서 Vite `loadEnv(mode, cwd, "")` 를 쓰면 shell/Vercel env 전체가
resolved config 로 들어가고, `vite --debug` 계열 로그에 provider key 또는 Supabase
service-role key 가 찍힐 수 있다.

현재 기준:
- shell env 는 `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ENABLED` 만 읽는다.
- `.env.example` placeholder 는 fallback 에만 쓰고, placeholder 값은 strip 한다.
- production build 에서는 AI provider key define 을 주입하지 않는다.
- Supabase anon key 는 공개 가능하지만 service-role key 는 절대 `VITE_*` 로 두지 않는다.

운영 조치: 2026-06-09 검수 중 과거 build debug 로그에 실제 키가 출력된 정황이 있었으므로
provider key 와 Supabase service-role key 는 배포 전에 회전한다.

### 34-2. 비용 API 는 `requireAuth` 를 통과해야 한다

`api/_jwt.ts` 의 `requireAuth(req, res)` 가 `resolveAuth` 결과에 `userId` 가 없으면
401 을 반환한다. 비용이 발생하는 서버 함수는 익명 호출을 허용하지 않는다.

현재 적용 대상:
- `api/ai-ocr.ts`
- `api/ai-solution.ts`
- `api/ai-variant.ts`
- `api/ai-cropdetect.ts`
- `api/ai-exam-analysis.ts`
- `api/ai-exam-commentary.ts`
- `api/ai-exam-v4.ts`
- `api/ai-image.ts`
- `api/export-pdf.ts`

새 AI/PDF endpoint 를 추가하면 `resolveAuth` 만 호출하지 말고 `requireAuth` 를 먼저 적용한다.

### 34-3. 개발 라우트는 운영에서 닫혀 있어야 한다

`?bench`, `?croptest`, `?katex`, `?legacy`, `?ui` 는 개발/검증 도구다. 특히 `?bench`,
`?croptest` 는 AI 비용이 발생할 수 있으므로 production 에서 기본 차단한다.

현재 기준:
- `import.meta.env.DEV` 또는 `VITE_ENABLE_DEV_TOOLS=true` 일 때만 dev tool route 허용.
- `admin` 포함 모든 route 는 `AuthGate` 뒤에서 렌더링한다.
- `AdminScreen` 은 `AuthGate` 초기화 없이 직접 열리지 않는다.

### 34-4. `/api/export-pdf` 보안 경계

서버 PDF endpoint 는 더 이상 미설치/미검증 상태가 아니다. `@sparticuz/chromium-min`
`149.0.0` 과 `puppeteer-core` 가 package dependency 에 추가되어 있고, Chromium pack URL 도
`v149.0.0` 으로 맞춰져 있다.

현재 방어선:
- POST only
- `requireAuth` 필수
- HTML 최대 길이 제한
- CSS URL 개수 제한
- same-origin `.css` 만 `<link>` 로 주입
- Puppeteer request interception 으로 `about:blank`, `data:`, `blob:`, same-origin
  document/stylesheet/font/image 만 허용
- title / Content-Disposition filename sanitize
- error log 는 인증된 `userId`, `tenantId` 기준으로 기록

프론트 호출부(`PrintActionPanel`)는 서버 PDF 호출 시 `currentAccessToken()` 으로 Bearer
토큰을 붙인다. 버튼은 아직 UX 상 비활성 상태지만, 재활성화할 때 인증 헤더 경로를 유지한다.

### 34-5. `expr-eval` 제거 및 audit 기준

`expr-eval@2.0.2` 는 prototype pollution / evaluate function 제한 문제 advisory 가 있고
공식 fix 가 없어 제거했다. `src/lib/diagram/eval-expr.ts` 는 제한된 수식 파서로 대체했다.

지원 범위:
- 숫자, `x`, `pi`/`PI`, `e`/`E`
- `+ - * / % ^`, 괄호, 암시적 곱셈(`2x`, `2(x+1)`)
- 허용된 Math 함수: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sqrt`,
  `abs`, `log`, `ln`, `log2`, `log10`, `exp`, `ceil`, `floor`, `round`, `min`, `max`, `pow`

`jspdf` 는 `^4.2.1` 로 올렸고 `dompurify` advisory 도 함께 해소했다.

### 34-6. 2차 검증 명령

2026-06-09 2차 검증에서 아래를 모두 통과하고 `origin/main` 에 push 했다.

```bash
npx.cmd tsc --noEmit --pretty false
npm.cmd audit --omit=dev
npm.cmd run build
```

결과:
- TypeScript: exit 0
- npm audit: `found 0 vulnerabilities`
- production build: exit 0
- dist secret scan: `sk-ant=0`, `sk-proj=0`, `AIza=0`, `SUPABASE_SERVICE_ROLE=0`,
  `long-sk-token=0`

남은 경고:
- Anthropic SDK 의 Node built-in externalization warning 이 production build 에 남아 있다.
- main chunk / `pdfExporter` chunk 가 500 kB 를 넘는다.

둘 다 현재 실패 조건은 아니지만, 다음 성능/번들 최적화 작업의 우선 후보로 둔다.

---

## 35. content_parser 정규화 웹 이식 — 미리보기 HWP 일치 (2026-06-21, 커밋 `543b827`)

옵션 B(네이티브 typed-block) 에서 **웹 미리보기가 HWP 출력과 달랐던 근본 원인**과 그
해결(testchange `content_parser.py` 의 display-영향 정규화를 TS 로 이식)을 정리한다. 다음
*OCR 블록 정규화 / 웹↔HWP 일치* 작업 시 첫 번째로 읽을 섹션.

### 35-1. 근본 원인 — 커넥터는 content_parser 재실행, 웹은 직렬화만 (CRITICAL)

HWP 커넥터(`F:\시험지변환기\server\adapter.py` `_adapt_native_problem`)는 Math-Gen 네이티브
블록을 **그대로** `parse_ocr_response → _parse_question → _finalize_contents` 에 넘긴다 →
.hwp 출력은 content_parser **전체 파이프라인을 거쳐 정규화**됨. 반면 웹은
`blocksToMarkdown` 으로 블록을 **직렬화만** 해 그 정규화를 못 받았다.

→ 같은 네이티브 블록인데 **HWP = 정규화됨 / 웹 = 정규화 안 됨** → 발산. 사용자 보고 증상:
- `eq("x")+text("=")+eq("-2y+3")` 가 `$x$=$-2y+3$` (KaTeX 3 조각 + 평문 `=`) 로 렌더
- 멀티블록 보기 박스(`<보기>` text + equation + `ㄴ.` text…)가 **마커 블록만 박스화**되고
  나머지 항목 유출 = "박스 미완"

**원칙**: 웹↔HWP 일치 문제는 *어느 쪽이 어떤 후처리를 하는가* 를 먼저 확인. 커넥터가
content_parser 를 재실행한다는 사실이 핵심 — 웹도 *같은 정규화* 를 거쳐야 일치한다.

### 35-2. 이식 범위 — display-영향 + 웹 미보유만 (`contentParser.ts` 신규)

`src/services/ai/contentParser.ts` (≈930줄). testchange content_parser 중 **display 영향 +
웹이 아직 안 하던** 변환만 이식:

- **`_finalize_contents` 값 변환 체인 15 단계 (순서 보존 CRITICAL)**: splitTrailingDomain →
  splitCommaEquations → mergeOperatorSplitEquations → mergeTextEqFragments →
  mergeEmptyGroupSubscript → mergeDegreeTempUnits → mergeParenRange → stripScoreText →
  italicizeStatOperators → romanizePointNames → italicizeNongeoSingleLetters →
  romanizeAngleLetters → romanizeContextUnits → spaceHangulBeforeEq → rstripLastText.
  (Python `_finalize_contents` 는 **16 단계** — spaceHangulBeforeEq↔rstripLastText 사이에
  `_emphasize_negation`(부정문 "옳지 않은 것" 볼드+밑줄 플래그)이 더 있으나, web 렌더가
  bold/underline 플래그를 미사용해 **의도적 제외**(15 단계 이식). 유지 15 단계의 *상대 순서*
  는 Python 과 100% 일치. golden 25/25 로 검증된 결정.)
- **박스경계**: `rawBoxEnd` / `trailingQuestionSplit` / `dropDuplicateBoxFragments` +
  `tagBoxRun`(box_member 태깅).
- **`_parse_choice` 선택지 체인**(다른 순서/부분집합 + `force_geo` 전파) — `normalizeChoice`.
- **경량 per-block**(`lightParseBlock`): 선두 박스 마커 분리(`_split_box_marker_prefix`) +
  box circles(ㅇ→○) + cases 강등(equation_block + `\begin{cases}` → equation).

**forward-split 은 의도적 제외**(`_split_inline_latex`/`_split_latex_commands`/
`_split_mixed_text_equation`/`_split_underline_markup`) — markdown→블록 *역방향* 파싱으로,
Math-Gen OCR 모델이 이미 typed-block 으로 분리 emit(OCR_PAGE_PROMPT 규칙 1)하므로 불필요.
feasibility 의 "essential port set" 밖. 모델이 *계약 위반*(text 블록에 수식 혼입) 시에만
web↔HWP 미세 차이 — 드물고, 그땐 커넥터가 HWP 쪽만 forward-split. 필요 시 golden 하니스로
안전하게 추가 이식 가능.

### 35-3. 통합 지점 — `blocksToMarkdown` 내부, wire 는 네이티브 (이중정규화 0)

`blocksToMarkdown`(src/lib/blocksToMarkdown.ts) 이 *파생 시점에* `normalizeContents` 적용.
**저장 `OCRProblem.blocks` 와 wire payload 는 네이티브 그대로** — 커넥터가 단독으로
content_parser 를 재실행하므로(35-1), 웹에서도 정규화한 블록을 wire 에 실으면 **이중정규화**
(web 선정규화 → 커넥터 재정규화). 대부분 idempotent 라 정확성은 안 깨지나 비-idempotent
변환 drift 위험. → **변환은 wire 경계의 *웹 렌더 쪽에만*** 둔다.

선택지 `force_geo` = 본문(정규화 후) 기하 문맥 → `hasGeometryContext(norm)` 산출해 전달
(`_parse_question` 의 `q_geo = _has_geometry_context(question.contents)` 미러, 대륜중 #1 점
좌표 선택지 로만+이탤릭).

### 35-4. box_member 그룹핑 — 멀티블록 박스 미완 fix + web-only 편차

`blocksToMarkdown` 이 연속 `boxMember` 블록을 **한 blockquote 로 그룹핑**(인라인 직렬화 후
`boxToBlockquote`) → 멀티블록 박스 항목 유출("박스 미완") 차단.

testchange `_parse_question` 은 box_member 를 *box_end≠null 일 때만* 태깅(HWP writer 가
`<보기>` 마커로 박스 식별, box_member 는 발문 연속 제외용). 그러나 웹은 box_member run 으로
박스를 *그룹핑* 하므로, `normalizeContents` 는 **box_end===null 케이스(박스가 끝까지
이어지는 멀티블록)도 `tagBoxRun`** 한다 — 안 그러면 항목 유출. **box_member 는 웹 전용**
(wire 무관, 커넥터가 자체 계산)이라 이 편차는 안전.

### 35-5. golden-file 하니스 — Python 원본 vs TS 포팅본 byte 동치 (회귀 방지)

`scripts/contentParserGolden*` — 이식본이 testchange content_parser 와 *블록 byte 동치* 인지
검증. **API 비용 0 순수 로직 테스트**.

- `contentParserGolden.fixtures.json` — 25 픽스처(각 변환 + 상호작용 + 박스경계 + choice).
- `contentParserGolden.baseline.json` — Python content_parser 출력(**커밋됨 = golden truth**).
- `contentParserGolden.py` — baseline 재생성기(testchange 필요, `TESTCHANGE_DIR` 환경변수
  기본 `F:\시험지변환기`).
- `contentParserGoldenHarness.mts` — TS 포팅본 실행 후 baseline 대조(**testchange 불필요**,
  커밋된 baseline 과 standalone 비교).

```bash
# 회귀 확인 (어느 컴퓨터든, mathgen repo 만):
npx tsx scripts/contentParserGoldenHarness.mts          # 25/25 기대, 실패 시 exit 1
# baseline 재생성 (이식본/원본 변경 시, testchange 체크아웃 필요):
set TESTCHANGE_DIR=...path\to\시험지변환기 && python scripts/contentParserGolden.py
```

비교는 **type/value 만**(box_member 제외 — 35-4 의 web-only 편차). 새 변환/픽스처 추가 시
baseline 재생성 후 두 파일 함께 커밋.

### 35-6. Python `re` → JS RegExp 포팅 함정

- **g-flag stateful (CRITICAL)**: g 정규식의 `.test()`/`.exec()` 는 `lastIndex` 가 누적돼
  반복 호출 시 버그. `INNER_LABEL_ANY_RE`(test 용, no-g) 와 `INNER_LABEL_ANY_G`(matchAll 용,
  g) 로 **분리**. `.replace(re, ...)` 만 쓰는 정규식은 g 안전.
- **named group**: Python `(?P<body>…)` → JS `(?<body>…)`, `m.groups?.body`.
- **DOTALL**: Python `re.DOTALL` → JS `s` 플래그.
- **lookbehind**: JS V8 지원(`(?<![A-Za-z\\{])`). 가변길이도 V8 OK.
- **str 메서드**: Python `.strip()/.rstrip()/.lstrip()` → JS `.trim()` + `rstrip`/`lstrip`
  헬퍼(`/\s+$/u`, `/^\s+/u`). `re.match`(앵커 start) → 패턴에 `^` 명시 + `.test()`/`.exec()`.
- **lightParseBlock 은 NBlock[] 반환**(마커 분리로 1~2 블록) → 호출부 `.flatMap`(`.map` 쓰면
  NBlock[][] 중첩 → `type:null` 버그).

### 35-7. 회귀 방지 체크리스트 (content_parser 정규화 수정 시)

- [ ] `npx tsx scripts/contentParserGoldenHarness.mts` → 25/25 (실패면 발산 — 픽스처가
  잡아낸 것).
- [ ] 새 변환 추가 시: 픽스처에 케이스 추가 → `python scripts/contentParserGolden.py` 로
  baseline 재생성 → fixtures + baseline 함께 커밋.
- [ ] `_finalize_contents` 순서(35-2) 변경 금지 — 단계 간 의존(예: stripScoreText 가
  기하 판정 *앞* — "점"(배점) vs "점"(point) 충돌).
- [ ] wire payload·저장 블록은 네이티브 유지(35-3) — 정규화는 `blocksToMarkdown` 안에서만.
- [ ] `npx tsc --noEmit` exit 0 + 브라우저 콘솔 에러 0(순환 import 없음 — contentParser 는
  ocrBlocks 타입만 import).

---

## 36. HWP 도우미(.exe) 릴리스 — 웹 URL 자동 동기화 (2026-06-22)

한글-only PC 배포용 트레이 도우미(memory `hwp-export-com-only`)의 릴리스·업데이트 런북.
웹앱 다운로드 버튼이 **버전 무관 `latest` URL** 을 쓰므로, 새 버전을 *latest 로* 올리면
**웹 코드 수정·재배포 없이 자동 반영**된다.

### 36-1. 불변 규약 (어기면 자동 동기화 깨짐 — CRITICAL)
- **에셋 파일명은 항상 `MathGenHWP.zip`** — `latest/download/MathGenHWP.zip` 가 *파일명* 으로 해석.
- 새 릴리스는 **반드시 latest** (`gh release create` 기본값 = latest; `--latest=false` 금지).
- 웹 URL 상수 `HWP_AGENT_DOWNLOAD_URL` (`src/components/print/PrintActionPanel.tsx`) =
  `https://github.com/BIGSHOL/Math-Gen/releases/latest/download/MathGenHWP.zip` — **수정 불필요**.
- 릴리스 repo 는 **BIGSHOL/Math-Gen (public)**. Math-Gen 은 GitHub 릴리스를 *앱* 배포에 안 씀
  (Vercel) → latest = 항상 도우미라 안전. *만약 앱 릴리스를 도입하면* latest 충돌 → 그땐
  도우미를 별도 public repo 또는 고정 태그(`hwp-agent`)로 분리할 것.

### 36-2. 새 버전 릴리스 절차 (엔진 `D:\시험지 한글화`)
1. 소스 수정(`agent.py` / `server/connector.py` 등) → testchange(**BIGSHOL**, `git push testchange master`) 커밋. (origin 은 soseon203 — 권한 없음, push 금지.)
2. 빌드: `python -m PyInstaller agent.spec --noconfirm --clean --distpath dist_agent --workpath build_agent`
   (`pyinstaller`·`pystray`·`pillow`·`pywin32` 필요. agent.spec 은 변환경로만 — GUI/OCR/figure 제외 → 39MB.)
3. 안내문 갱신 시 `dist_agent/MathGenHWP/사용안내.txt` 수정.
4. 압축(이름 **고정**): `Compress-Archive -Path dist_agent/MathGenHWP -DestinationPath dist_agent/MathGenHWP.zip -Force`
5. 릴리스(새 태그, latest 기본):
   `gh release create hwp-agent-vX.Y.Z dist_agent/MathGenHWP.zip --repo BIGSHOL/Math-Gen --title "..." --notes-file ...`
   → 자동 latest → 웹 URL 자동 반영. **웹 코드/재배포 불필요.**
   (또는 같은 태그 자산만 교체: `gh release upload <tag> dist_agent/MathGenHWP.zip --clobber`.)
6. 검증: `curl -I https://github.com/BIGSHOL/Math-Gen/releases/latest/download/MathGenHWP.zip` → `302` + Location 이 새 태그.

### 36-3. 핵심 동작 (재현/디버그)
- 도우미: PyInstaller **onedir** 트레이 앱. 커넥터(8765) 백그라운드 데몬 스레드 + 부팅 자동시작
  (HKCU `…\Run\MathGenHWP`) + 변환은 자기 자신을 `--convert-worker` 로 재호출(COM 격리;
  connector 가 `getattr(sys,"frozen")` 분기, payload 는 `--in` 파일 — windowed exe stdin None 회피).
- 웹: 커넥터 미감지(`detectConnector()` null) 시 throw 대신 `connectorMissing` → 다운로드 카드.
  **카드는 도우미가 *실행 안 될 때만* 노출** — 실행 중이면 안 보임(정상). 프로덕션(HTTPS)에선
  커넥터의 CORS allowlist(`https://mathgen.para-x.co.kr`) + PNA 헤더가 있어야 감지됨(memory 참고).
- 서명 없음 → SmartScreen "추가 정보→실행" (사용안내.txt + 릴리스 노트에 명시). 코드서명은 보류.

---

## 37. 연립방정식 인라인 — 두 레이어 충돌 함정 (2026-06-22, CRITICAL)

**증상**(사용자 반복 보고): 발문 중간 연립방정식이 *가운데정렬 display 블록*으로 떠
"멘트 / 식 / 멘트 / 식" 으로 세로 토막남. 우측 가로공간 비고 줄바꿈 폭발. **재OCR 해도
안 고쳐짐.**

**근본 원인 — 두 후처리 레이어가 서로 반대로 작동**:
1. `contentParser.ts` `lightParseBlock` (§35): `equation_block` + `\begin{cases}` → 인라인
   `equation` 으로 강등 (블록 흐름 위해). item.text 는 `…$\begin{cases}…$…` (인라인).
2. `textPreprocess.ts` `preprocessMathText` 의 **승격 단계**: 인라인 `$…$` 안에 `MULTILINE_ENV`
   (`cases|align|aligned|array|…`) 있으면 `$$…$$` display 로 *승격*. → **1 의 인라인 연립을
   곧장 다시 display 블록으로 되돌림.** 이게 재OCR 로도 안 고쳐지던 진짜 이유.

**해결**(`textPreprocess.ts`, 렌더 시점 — §35/Python/golden 무관):
- `SYSTEM_ENV = /\\begin\{cases\}|\\left\\{|\\left\\lbrace/` 신설.
- `inlineEquationSystems()` — display 연립식(`$$sys$$`)을 인라인(`$sys$`)으로 당기고,
  문장 사이 `\n\n` 도 공백으로 합쳐 흐름 복원. 승격 단계 *직전* 에 호출.
- 승격 조건에 `&& !SYSTEM_ENV.test(inner)` 추가 — 연립(cases/`\left\{`)은 인라인 유지,
  align/aligned/gather 등 *진짜 display 환경* 은 그대로 승격(회귀 없음).
- **렌더 시점 후처리라 *이미 파생된 item.text 도 재OCR 없이* 교정**. blocksToMarkdown
  /wire/HWP 는 무영향(§35 golden 그대로).

**원칙(§2-17 재확인)**: "인라인으로 만들었는데 화면은 블록" = *다른 레이어가 되돌리는지*
의심. contentParser(파생) ↔ preprocessMathText(렌더) 가 같은 대상에 반대 변환을 하면
사용자에겐 "안 고쳐짐" 으로만 보임. 새 math 정규화 추가 시 *양 레이어의 방향* 을 맞출 것.
빠른 진단: `npx tsx` 로 `preprocessMathText("…$\\begin{cases}…$…")` 출력이 `$$` 로 바뀌는지 확인.


---

## 38. 2026-06-23 세션 — 버그 2건 + 인식률 Step3 + 변형 재오픈 + testchange 이식

전체 점검 후 사용자 보고 버그 수정 + 비활성 기능 재오픈 + testchange 파서 픽스 이식.
하니스 4종(golden 25 · port 8 · ocrJson 5 · textLayer 6) + tsc + build 전부 green.

### 38-1. 버그 — 서술형 소문항 `(1) (1)` 중복
`blocksToMarkdown.ts` 소문항 직렬화가 `(${sub.number}) ` 를 prepend 하는데 OCR 본문이
이미 인쇄된 `(1)` 까지 전사 → 중복. **fix**: body 선두 `/^\s*\(\d+\)\s*/` 1회 strip 후
prepend. 좌표쌍 `(1, 2)` 는 콤마에서 끊겨 미매칭(안전). §26-6 `\boxed{ABCD}` 분리와 동류.

### 38-2. 버그 — 문항별 재인식 `/api/ai-ocr` 500 (깨진 JSON)
**증상**: 서답형(지문 포함) 재인식 시 500. 서버 stack: `parseJsonOrThrow` ← `callAnthropic`,
`Expected ',' or '}' after property value`. Sonnet 이 서술형 지문(아라비안 나이트)의 *대사
큰따옴표를 escape 안 함* → `recoverJson` 5단계가 복구 실패.

**근본 한계**: `recoverJson` stage 4(`repairJsonStrings`)가 산문 value 안의 `"` 뒤에
구조문자(`,}]`)가 오면 *진짜 끝*으로 오인해 조기 종료.

**fix — `ocrJsonRecovery.ts` stage 6 추가(`repairValueStrings`)**: 문자열이 *값 위치*(직전
의미 구조문자 `:`)인지 추적해, 값이면 "진짜 끝"을 더 엄격히 판정(`"` 뒤가 `}`/`]` 거나, `,`
인데 그 뒤가 *새 키*(`"...":`)·새 원소·EOF). 그 외 내부 `"`·줄바꿈은 escape. **stage 1-5가
모두 실패할 때만 진입 → 기존 동작 회귀 0**. 하니스 `ocrJsonRecoveryHarness.mts` 5/5.

**원칙**: 모델 깨진 JSON 복구 강화는 *additive 단계*로. 기존 단계가 파싱하는 입력은 새 단계에
도달 못 하므로 회귀 불가능 — 가장 안전한 확장 패턴.

### 38-3. 인식률 Step 3 — born-digital text-layer 대조 경고
`textLayerValidator.ts` 신규(순수). born-digital PDF 임베디드 텍스트(정답)와 OCR 조립
텍스트의 *anchor recall*(한글 2자+ / 정수 3자리+ 토큰) 측정 → 임계 미만이면 누락 의심.
**비파괴**(§18-5 solutionValidator 동일 — 답 무효화 X, 검토 배너만). `usePageOcr` Pass1
완료 후 산출 → 휘발성 `ocrTextLayerWarning` 페이지 필드(partialize strip) → Step2 접이식
배너. 스캔(textLayer 빈값)·짧은 페이지는 skip. 하니스 6/6. (§28 Tier1 측정 키스톤 — D01
픽셀 전처리와 무충돌, 측정 기반 후속 Step1/2/4 게이팅용.)

**주의 — imagePreprocess.ts 는 dead code**: §29-2가 "Step1 완료"로 적었으나 `preprocessForOcr`
등은 OCR 경로에서 *호출 안 됨*(`usePageOcr.ts:194` D01 — testchange 파리티 + 손글씨는
프롬프트가 담당). storage 헬퍼(`compressForStorage`)만 사용. Step1/2/4는 측정 후 게이팅.

### 38-4. 변형 기능 재오픈 (§33-1·§33-2)
`PrintOptionsPanel` `EXPORT_SOURCE_OPTIONS` 의 variant/both `disabled` 제거 +
`DetailMetaSidebar` `VARIANT_HISTORY_ENABLED = true`. `ENABLED_EXPORT_SOURCES`(단일 소스)가
Step5Export 가드(L78)·`buildHwpPayload(…, exportSource)` 로 cascade → 미리보기·HWP 가
변형 반영. 생성 파이프라인 intact. **품질·actionable 이력은 미해소** — §33 부활 체크리스트 참조.

### 38-5. testchange 파서 픽스 4건 이식 (§35 parity)
testchange 신규 커밋 3건(`99d2ff1`·`8126286`·`dbe8143`)의 `content_parser.py` 픽스를 웹
`contentParser.ts` 로 이식(전부 display 영향 + 웹 누락):

| 이식 | testchange | 웹 대상 |
|---|---|---|
| 선택지 `① ①` 이중마커 제거 | dbe8143 `_parse_choice` | `normalizeChoiceGroups` + `stripSelfChoiceMarker` |
| 값나열 쉼표 보존(has_rel 게이트·√atom·`\,` 가드) | 99d2ff1 | `splitOneEqCommas`·`isAtomItem`·`splitAtTopLevelCommas` |
| mid-block 박스마커 분리 | 8126286 `_split_embedded_box_markers` | `splitEmbeddedBoxMarkers`(신규) + `normalizeContents` |
| 라벨없는 박스 trailing question 분리 | dbe8143 `_trailing_question_split` | `trailingQuestionSplit` label-less 분기 |

**제외**: `_move_trailing_figure_before_box`(웹 contents 엔 image/`※그림자리` 블록 없음 —
figure는 별도 필드) · `latex_to_hwpeq.py`(HWP 수식 전용, KaTeX 처리). §35-2 정책대로.

**검증**: golden 25/25(회귀 0 — 기존 픽스처 신규경로 미접촉) + `contentParserPortHarness.mts`
8/8. **원칙**: testchange `content_parser.py` 수정 시 §35-5 골든 + 신규 픽스는 port 하니스로
회귀 방지. 선택지 `① ①`는 §38-1 서술형 `(1)(1)`와 같은 클래스(마커 중복 prepend).

### 38-6. 보안 — npm 취약점 2건
protobufjs(high)·dompurify(moderate) 신규 advisory(§34-6 "0건" 이후 회귀) → `npm audit fix`
→ 0 vulnerabilities. build 정상.

---

## 39. 2026-06-23 후속 — HWP 내보내기 마무리 + 파일명 자동입력

§38 직후, *HWP 내보내기 = 모든 것의 기준* 정책(미리보기를 HWP 출력에 맞춤) 마무리 +
정확 미리보기 제거 + 내보내기 피드백 + 파일명 자동입력. 다음 *Step5 내보내기 / 파일명 /
HWP 미리보기* 작업 시 첫 번째로 읽을 섹션.

### 39-0. 세션 커밋 (웹 + 엔진)

| commit | repo | 내용 |
|---|---|---|
| `25d95a0` | 웹 | 시험지 정보 입력 UI + payload meta/style 확장 (plan Part A/B 마무리) |
| `a75f9bf` | 웹 | 정통 미리보기를 HWP 출력에 맞춤 (번호+배점 인라인·compact 본문) |
| `4310e3e` | 웹 | HWP 정확 미리보기 제거 → 안내 경고 + 내보내기 품질 피드백 |
| `9164379` | 엔진(testchange) | connector 변환 1회 재시도 — 한글 COM 간헐 실패 회복 |
| `6ebc25f` | 웹 | 파일명 자동 입력 + 내보내기 파일명 단일 소스화 |

### 39-1. 미리보기를 HWP 출력에 맞춤 — *HWP 가 기준* (사용자 결정)

두 레이아웃 엔진(웹 CSS vs HWP COM)이 근본적으로 달라 픽셀 일치는 불가. 사용자 결정:
*HWP 가 기준, 미리보기를 HWP 에 맞춘다*. JeongtongTemplate 의 `toHwpPreview` 헬퍼가
번호(볼드)+발문 *인라인* + `[배점]` 발문 끝으로 변환 — testchange writer 의
`_write_question` 흐름과 동일. `ProblemBody` 에 `compact` prop(좁은 줄높이·보기 간격)
추가. jeongtong gap 18→8, lineHeight 1.8→1.5.

**단 도형은 미리보기/PDF 에서 그대로 렌더**(완성 시험지). HWP 는 도형을 못 그려 "그림
자리" 가 되지만 그 차이는 §39-2 의 안내 경고로 커버. `compact` 기본 false 라 다른 5
템플릿 무영향.

**참고**: `src/components/print/templates/JeongtongTemplate.tsx` `toHwpPreview`,
`ProblemBody.tsx` `compact`.

### 39-2. HWP 정확 미리보기(온디맨드 COM PDF) — *만들었다가 제거* (사용자 결정)

처음엔 "빠른 React 미리보기 + 온디맨드 HWP 정확 미리보기(실제 .hwpx 를 COM 으로 PDF
렌더)" 하이브리드를 *완성·검증* 했으나, 사용자 통찰: *"렌더링하는거랑 다운로드하는거랑
시간이 같으면 그냥 다운로드가 낫다(비용도 0)"*. 실제로 정확 미리보기는 COM 세션 2회라
다운로드보다 *느리고* 읽기전용 → 가치 낮음. → **제거**.

대신 HWP 내보내기 버튼 아래 **안내 경고**(`PrintActionPanel`): "쪽 나눔·간격이 미리보기와
다를 수 있고, 도형은 한글에서 직접 붙여넣어야 함. PDF·인쇄는 미리보기와 동일."

**엔진 리버트 (중요 — 미커밋 스캐폴딩은 HEAD 환원이 깔끔)**: `convert_cli.py --pdf` +
`connector.py` 의 `want_pdf`/`?format=pdf`/`convert-pdf` capability/PDF content-type 는
*working tree 에만 있고 커밋된 적 없음* → 해당 파일을 HEAD 로 되돌리니 net 변경 0.
웹 `hwpConnector.ts` 의 `convertToHwpPdf` 도 미커밋이라 동일하게 환원. **단 connector 의
1회 재시도 루프는 유지·커밋**(`9164379`) — 한글 COM SaveAs/Quit 간헐 실패(hwp_com.py:268)
회복용. 각 시도마다 *이번 변환이 띄운 고아 Hwp.exe 만* 정리(기존 인스턴스 보존).

**원칙**: "준비 중/폐기" 기능이 *아직 커밋 안 된 working-tree 변경* 이면, 부분 Edit 으로
한 줄씩 지우지 말고 `git checkout -- <file>` 로 HEAD 환원이 가장 안전(§33 의 *커밋된*
기능 플래그 게이팅과 구분). 검증: 커넥터 소스 재시작 후 `/health` 의 `capabilities` 가
`["convert-json"]` (convert-pdf 빠짐) + `/convert-json` 실변환 200·유효 .hwpx(PK zip).

### 39-3. 내보내기 품질 피드백 버튼 — content_feedback 재사용

OCR(§Phase E)과 *동일* `content_feedback` 인프라로 내보내기 품질 👍/👎. `FeedbackBar`
(재사용 컴포넌트, `!supabase||!user` 면 숨김)를 `PrintActionPanel` 액션 영역에 배치.
`feedback.ts` `FeedbackTargetKind` 에 `"export"` 추가. `targetId = testId || filename ||
"export"`, context `{ template, columns, problemCount }`. RLS `feedback_insert_own` 가
`user_id = auth.uid()` 강제(비로그인 차단).

**참고**: `src/components/print/PrintActionPanel.tsx`(FeedbackBar 배치),
`src/services/api/feedback.ts`(export target kind).

### 39-4. 파일명 자동 입력 + 내보내기 파일명 *단일 소스화* (CRITICAL — 사용자 보고)

**증상**: 내보내기의 *파일명 칸* 이 기본값 "변형시험지" placeholder 인데, 실제 HWP
다운로드는 *원본 업로드 파일명* 을 씀(`handleHWP` 가 `uploadedFileName` 우선) → **박스에
보이는 이름 ≠ 실제 내보내는 이름**. 사용자: "파일명 자동 입력 + 그 파일명에 따라
내보내기 파일명 결정되도록."

**근본 구조 (조사 워크플로 확정)**:
- `filename`(Step5 내보내기용, 기본값 `"변형시험지"`, `setExport` 로만 변경, partialize
  포함=세션 유지)과 `uploadedFileName`(원본 PDF명, `setUploadedFile`, hydrate 시 복원)은
  *별개 필드*. `setUploadedFile(filename)` 의 *인자명이 filename* 이지만 set 대상은
  uploadedFileName — 혼동 주의.
- **`hydrateFromTest`("이어서 작업"/보관함 직접)는 `WizardHydrateSnapshot` 에 filename 이
  없어 항상 기본값으로 리셋**(`...initialState, ...snapshot` 스프레드). uploadedFileName 은
  snapshot 에 있어 복원됨 → *자동입력 로직은 업로드 시점이 아니라 Step5 마운트에 둬야*
  새 업로드·hydrate 두 경로 모두 커버.

**해결 — 3 지점**:
1. `wizardStore.ts` 에 `export const DEFAULT_EXPORT_FILENAME = "변형시험지"` 추출(자동입력
   판별·폴백의 단일 기준; initialState 도 이 상수 사용).
2. `Step5Export.tsx` 의 *기존 bundle.answers 시드 effect 에 합류* — `filename ===
   DEFAULT_EXPORT_FILENAME` 일 때만 `uploadedFileName(.pdf 제거)` → `sourceTest?.title`
   순으로 자동 입력. **seedRef + 빈 deps + 단일 setExport patch** 구조(§3-7 setState 루프
   회피). 기본값 가드라 사용자가 고친 값은 절대 덮어쓰지 않음(persist 된 입력도 보존).
3. `PrintActionPanel.tsx` `handleHWP` baseName 을 `filename || uploadedFileName(.pdf 제거)
   || DEFAULT_EXPORT_FILENAME` 로 *재정렬*(filename 우선) → PDF 경로(이미 filename 기반)와
   일치. 파일명 칸 = 내보내기 파일명의 단일 소스.

**함정/원칙**:
- `uploadedFileName` 은 *실제 파일명* 이라 이미 OS-legal → 자동입력 시점에 sanitize 불필요.
  각 내보내기 경로가 download 시점에 `sanitizeFilename` 적용(이중 안전). 자동입력 값에
  `pdfExporter`(jspdf 의존)를 static import 하면 번들 비용 → 안 함.
- StrictMode 이중 마운트: seedRef 는 remount 마다 새 ref(false)지만, 첫 fill 후 filename
  ≠ 기본값 → 두 번째 마운트 effect 가 *기본값 가드* 로 skip. ref+가드 이중 방어.
- selector 는 단순 property access(`(s) => s.uploadedFileName`) — §3-6 inline-object 금지.

**참고**: `src/stores/wizardStore.ts` `DEFAULT_EXPORT_FILENAME`,
`src/components/wizard/Step5Export.tsx`(마운트 effect),
`src/components/print/PrintActionPanel.tsx` `handleHWP`.

### 39-5. Chrome MCP 자동검증 환경 제약 (2 함정 — 재발 방지)

이번 세션 브라우저 검증에서 부딪힌 2 함정(메모 `browser-verification-tooling` 에도 기록):

1. **연결된 Chrome 이 dev 머신과 *다른 호스트*** — 브라우저에서 `localhost`/
   `127.0.0.1:3001` 은 *error page*(curl 은 200). dev 머신 **LAN IP**(`Get-NetIPAddress
   -AddressFamily IPv4`, 예 `192.168.101.18:3001`)로 접속해야 함. + vite 는 기본 `localhost`
   (::1, IPv6) 만 바인딩 → LAN 접근하려면 `npm run dev -- --port 3001 --strictPort --host
   0.0.0.0`. 새 origin(LAN IP) 탭은 기존 로그인 세션 미공유(localStorage origin 별).
2. **AuthGate 로그인 게이트** — Step5 등 인증 화면은 비밀번호 입력 불가(정책)라 자동검증
   불가. 사용자 직접 로그인 필요. 안 되면 *tsc 0 + 부팅 콘솔 에러 0 + 로직 리뷰(기존
   검증된 패턴과 동일 구조 확인)* 로 대체하고 시각 확인은 사용자 위임.

**원칙**: 마법사 깊은 화면(내보내기 등) 자동 시각검증은 위 2 제약으로 종종 불가 →
*tsc + 콘솔 부팅에러 0 + 기존 검증 패턴 대비 구조 동일성* 을 1차 게이트로, 실물은 사용자
위임. 새 마운트 effect+setState 는 *기존 동작하는 effect 와 동일 구조인지* 가 렌더 루프
없음의 강한 증거(§3-6/§3-7).

---

## 40. 2026-06-24 — 인쇄 6 템플릿 HWP 헤더 완성 + accent 색 인프라 (엔진)

§39 까지 jeongtong 만 HWP 헤더가 구현돼 있었고(나머지 5 종은 *제목만* 출력), 사용자
요청으로 6 종 전부의 HWP 헤더를 *웹 미리보기 디자인에 맞춰* 구현. 엔진 레포(testchange)
작업. 다음 *HWP 템플릿 헤더 / accent 색 / COM 렌더 검증* 작업 시 첫 번째로 읽을 섹션.

### 40-0. 조사로 확정한 핵심 사실 (2 워크플로)

- **HWP 본문(번호·배점·내용)은 100% template-agnostic** — `hwp_com_writer._write_question`
  에 template 분기 0. 6 종 모두 평문 `N.` 볼드 + `[N점]` 인라인 + 보기 길이기준 단. 즉
  *본문은 손댈 필요 없고*, 템플릿 차이는 **헤더에만** 존재.
- **헤더는 jeongtong 만 구현**돼 있었음: `forms/jeongtong.hwpx` 폼 파일 + `_header_jeongtong`
  COM 함수. 나머지 5 종 `_header_*` 는 전부 `_header_default`(제목만) 한 줄 stub.
- **변환 경로 분기**: `convert_cli` → `resolve_form_path(template)` → `forms/<t>.hwpx` 있으면
  폼 모드(픽셀완벽), 없으면 COM 헤더(`_header_<t>`). jeongtong 만 폼 있음 → 나머지는 COM 헤더.
- 따라서 *5 종은 COM 헤더 함수를 채우면* 변환 출력에 헤더가 나옴(폼 파일 불필요).

### 40-1. pyeongga (무채색) — COM 헤더만으로 충분 (commit `550e735`)

수능 클론 양식: 1×2 제목 박스(`수학 영역` | `제 1 교시`) + `5지 선다형 · 다음 물음에
답하시오` 안내. 시험정보표 없음(고정 양식). 무채색(ink)이라 **색 불필요** → `_grid`/table
프리미티브만으로 구현. `_header_pyeongga` 채움. 렌더 검증 완료.

### 40-2. accent 색 인프라 — PUA 센티넬 (CRITICAL, commit `b4cfc50`)

나머지 4 종(modern/workbook/jaseup/yuhyung)은 accent 색 필요. **걸림돌**: `hwp_com.set_char_shape`
에 *색 인자가 없음*(pt·bold 만) — COM 한계. 글자색·배경색은 *저장 후 XML 후처리*로만 가능.
또한 jeongtong 의 색 후처리(`_shade_header_labels`/`_style_header_runs`/`_thicken`)는 *스타터
폼 생성에서만* 돌고 *변환 경로엔 없으며*, 매칭이 jeongtong 라벨(학교/학년/점수)에 하드코딩.

**해결 — PUA 센티넬 마커 + 변환 경로 후처리** (`hwp_com_writer._apply_accent_header`):
- `template_headers` 가 3 마커 정의(producer): `ACCENT_WHITE_INK`(U+E010, 흰글자+검정 ink 배너) /
  `ACCENT_TEXT_MARK`(U+E011, accent 글자) / `ACCENT_WHITE_FILL`(U+E012, 흰글자+accent 배너).
  헤더 함수가 `s.text(MARK + "텍스트")` 로 셀/런에 마커를 박음.
- `_apply_accent_header(hwpx, accent_rgb)`: section XML 스캔 → (1) 마커 든 *셀*의
  `borderFillIDRef` 를 faceColor 채운 borderFill 로 교체(`_append_borderfills` 재사용, 테두리도
  같은 색=솔리드 배너), (2) 마커 든 *런*의 charPr 복제 → `textColor` 흰/accent(`_clone_charpr`
  재사용), (3) **모든 마커 strip(tofu 방지)**. 마커 없으면 no-op → jeongtong/pyeongga 무영향.
- `write_exam_to_hwp` 변환 후처리(`_fit_header_tables` 다음)에 배선. accent_rgb 는
  `resolve_accent_rgb(template, accent_color)`.
- **순환 import 주의**: `hwp_com_writer` 가 `template_headers` 를 import(단방향) → 마커 상수는
  *template_headers(producer)*에 정의하고 hwp_com_writer 가 import. 반대로 정의하면 순환.

**함정**: 마커는 PUA(본문 미사용 코드포인트)라 충돌 0. 단 *후처리가 strip 실패하면 tofu(□)*
노출 → step 3 에서 모든 section 의 모든 마커를 무조건 `.replace(mk,"")`. 마커는 `chr(0xE010)`
*표현식*으로 정의(CLAUDE.md §4-1 — 리터럴 PUA 는 Edit 에서 안 보임).

### 40-3. 4 accent 헤더 (commits `b4cfc50` yuhyung, `02be9eb` workbook/modern/jaseup)

- **yuhyung** (slate): 검정 유형 배너(1×1, `ACCENT_WHITE_INK` → 흰글자) `PATTERN + 유형명` +
  accent 핵심전략 라인(`ACCENT_TEXT_MARK`).
- **workbook** (red): accent 로고(■, `ACCENT_TEXT_MARK`) + 학원명 라인 + 검정 단원 배너(흰 title).
- **modern** (navy): semester(accent) + 학교명(큰) + 일시 라인 + 학생정보표(1×12, accent 라벨).
- **jaseup** (gold): SELF-STUDY(accent) + 제목 + 오늘의 목표(accent) + 개념정리 박스(테두리).

**accent 테두리는 COM 한계로 미구현**(검정 근사) — 웹의 3px accent 하단선·박스 테두리는
검정으로 나오지만 *글자/배너 색*이 식별 캐리. faceColor(배너)+textColor(글자)만 색 입힘.

### 40-4. 렌더 검증 루프 (재사용)

`scripts/render_to_png.py <hwpx> <prefix>` (HWP COM → PDF) + `fitz`(PyMuPDF) → PNG → Read 로
육안. payload(template) → `server.convert_cli` .hwpx → render → PNG. `D:\tmp\render_tpl.py`
가 이 흐름 묶음(template 인자). **각 변환·렌더는 COM 직렬**이라 `taskkill /F /IM Hwp.exe` 로
이전 인스턴스 정리 후 진행(커넥터 떠 있어도 변환 중 아니면 무관). 6 종 전부 + jeongtong
회귀(no-marker no-op) 렌더 확인 완료.

### 40-5. 회귀 안전

- `_apply_accent_header` 는 마커 없으면 *즉시 return 0* → jeongtong(폼)·pyeongga(무채색) 무영향
  (jeongtong 회귀 렌더로 확인 — 헤더·음영·테두리 그대로).
- 본문 렌더 무변경(template-agnostic) → content_parser golden 영향 0.
- 6 종 헤더는 각자 `_header_<t>` 안에만 — dispatcher/본문/타 템플릿 격리.

**원칙**: COM 으로 색을 직접 못 넣으면(set_char_shape 한계) *PUA 센티넬 + 저장 후 XML 후처리*
가 표준 패턴. faceColor=`_append_borderfills`, textColor=`_clone_charpr` 재사용. 새 accent 헤더
추가 시 마커만 박으면 색 후처리가 자동 처리(헤더 함수는 색 신경 안 씀).

---

## 41. 내보내기 설정 → HWP 반영 매트릭스 + UI 안내 (2026-06-24, 감사)

사용자 질문 "내보내기 틀 설정이 HWP 에 전부 반영되나?" 에 대한 *전수 감사*(워크플로 3 갈래,
file:line 검증) 결과 + 사용자 결정("되는 것만 반영, 안 되는 것은 멘트"). 다음 *내보내기 옵션
구현 / payload 확장 / HWP 반영 범위* 작업 시 첫 번째로 읽을 섹션.

### 41-1. 반영 매트릭스 (현재 상태)

| 설정 | HWP 반영 | 근거 |
|---|---|---|
| **template** (6종) | ✅ | 헤더 분기 (§40) |
| **시험지 정보** (제목·학교·학년·과목·시험일·시간·출제자·총점 + 템플릿전용) | ✅ *템플릿이 쓰는 것만* | meta → 헤더. 단 템플릿마다 사용 필드 다름(아래) |
| **여백** (marginPreset) | ✅ | `_set_page_margins` |
| **파일명** | ✅ | filename (§39-4) |
| **배점 `[N점]`·보기·소문항** | ✅ | 본문(template-agnostic) |
| **강조색** (color) | 🟡 글자·배너만, 테두리 검정 | `_apply_accent_header`; 테두리 COM 한계 (§40-3) |
| **단 수 (1/2단)** | ❌ 본문 항상 1단 | `self._columns` 저장만, 본문 read 0 (단나누기 COM 호출 전무) |
| **정답·해설 페이지** | ❌ | payload 에 정답지 플래그 없음 |
| **세로 간격(spacing)·빠른정답·난이도·구분선·폰트팩·배치모드·날짜·단원명** | ❌ | `buildHwpPayload` 시그니처가 `Pick<PrintOptions,'template'\|'color'\|'columns'\|'marginPreset'>` 로 좁혀짐 — 전달 자체 불가 |
| **labelType (서답형)** | ❌ 본문 렌더 | hwp_com_writer 가 read 안 함(정답/폼 동기화용) |
| **도형/그림** | ❌ (의도) | adapter `_clean_contents` 가 text/equation/table 만 통과 → "※ 그림 자리" 노트 치환(D8) |

**근본 원인 2 가지**: (1) `buildHwpPayload(... printOptions: Pick<..4개>)` 가 4 옵션만 받음 →
나머지 PrintOptions 는 *payload 에 닿지도 못함*. (2) columns 는 전달되나 *엔진 본문이 안 읽음*.

**템플릿별 meta 사용** (헤더가 실제 쓰는 것): jeongtong=학교/학년/과목/시험일/시간/출제자/총점
(폼 토큰 8개 — 학기/학원명/개념 등은 *jeongtong 폼이 토큰 미사용*해 미반영), modern=학기/학교/
학년/시험일/시간/총점, workbook=학원명/강사명/시험일/제목, jaseup=제목/목표/개념정리,
yuhyung=유형명/전략, pyeongga=고정(제목·시간만 미리보기, 정보 미반영).

### 41-2. 사용자 결정 + 이번 조치 (commit `de90563`)

"안 되는 것은 *멘트 달아놓기*" — `PrintOptionsPanel` 에 `HwpNote`(amber ⓘ) 추가로 각 미반영/
부분반영 옵션에 "미리보기 전용 — HWP 미반영" 안내. 단 수/폰트/세로배치/표시옵션/정답해설/강조색/
시험지정보(per-template) 7 곳. 하단 chip "인쇄·PDF 같은 layout"(구현중 거짓) → "HWP 내보내기만
지원" 으로 정정. **미반영 기능 구현은 후속** — 사용자: "하나씩 차근차근".

### 41-3. 후속 구현 우선순위 (미반영 닫기)

큰 것부터: (1) **2단 본문** — 엔진에 HWP 구역 단(MultiColumn/ColDef COM) 적용 + `buildHwpPayload`
columns 이미 전달됨 → 엔진만. 중간 규모. (2) **정답지** — payload 에 showAnswers/quickAnswerOnly
플래그 + 엔진이 정답 섹션 append. 중간. (3) **나머지(폰트/간격/토글)** — `buildHwpPayload` 의
Pick 확장(payload 에 싣기) + 엔진 소비 각각. 폰트=한글 폰트 매핑, 간격=본문 문단 간격 주입.

**원칙**: payload 시그니처가 `Pick<>` 로 좁혀져 있으면 *UI 에서 옵션을 만져도 엔진에 안 닿는다* —
새 옵션 HWP 반영 시 (a) `buildHwpPayload` Pick 확장 + payload 필드 추가, (b) adapter 추림,
(c) 엔진 소비 3 단계 모두 필요. 하나라도 빠지면 "UI 만 동작, 출력 무변화"(이번 감사의 핵심 발견).

---

## 42. 2단 본문 HWP — *시도→블록* 조사 기록 (2026-06-24, CRITICAL 함정)

§41 의 미반영 #1(2단)을 구현 시도했으나 **HWP 단(column) 모델과 우리 헤더 아키텍처가
근본 충돌**해 막혔다. 막다른 길 4 개 + 유일한 우회로를 기록 — *다시 시도하기 전 반드시
읽을 것*(같은 조사 반복 방지, 실측 렌더 검증 완료).

### 42-1. 배경 — columns 는 엔진까지 가지만 본문에서 무시

`style.columns`(1|2)는 payload→adapter→`writer._columns` 까지 전달되나, 본문 작성 경로
(`hwp_com_writer.write`/`_write_question`/`_write_block`)에서 *read 0건* — 단 분할 COM 호출
전무(§41 매트릭스). 그래서 2단을 *추가* 하려 했다.

### 42-2. 막다른 길 4 개 (전부 실측)

1. **COM `MultiColumn` 액션 → `Execute` 항상 False.** `HParameterSet.HColDef` 존재
   (Count/SameSz/SameGap/LineType), `CreateAction("MultiColumn")`+`CreateSet`+`ColInfo`
   ItemArray(count 2 생성됨)까지 해도 Execute False — 적용 안 됨. 선택 영역(MoveSelDocEnd)
   후에도 False. *COM 으로 단 설정 불가*(probe `_probe_cols*.py`).
2. **섹션 colPr `colCount=1→2` XML 패치 → 헤더 깨짐.** 단은 `<hp:secPr>` 안 `<hp:colPr
   type="NEWSPAPER" colCount=N sameGap=N>` *섹션 전역* 속성. 2 로 바꾸면 본문에 그린 헤더
   (제목 배너·정보표)까지 단 흐름에 들어가 — 표는 전폭 유지되나 *col-2 문항이 페이지
   최상단(헤더 위)에 겹쳐* 출력. 신문형 단은 col-1 의 전폭 헤더를 "col-1 콘텐츠"로 보고
   col-2 를 페이지 top 부터 채우기 때문.
3. **본문 첫 문단에 mid-document colPr ctrl 주입 → HWP 무시.** `</hp:tbl>` 뒤 본문 첫 run 에
   `<hp:ctrl><hp:colPr colCount=2/></hp:ctrl>` 삽입해도 본문 1단 그대로. HWP 는 *섹션 첫
   문단의 colPr 만* 인식, 중간 colPr 컨트롤은 단 구역 변경으로 처리 안 함(probe `_midcol`).
4. **구역 나누기 = 새 쪽.** 헤더 구역(1단)+본문 구역(2단)으로 나누면 본문이 *page 2* 로
   밀림. HWP 구역 나누기는 쪽 단위(연속 구역=Word 식이 없음) — 헤더·본문 같은 쪽 불가.

### 42-3. 유일한 우회로 + 충돌

코드베이스의 *작동하는 2단*(`hwp_form_writer` + 대수회 폼, `.testkit/*.hwpx`)은 전부
**header 를 페이지 머릿말(running header)에 + 본문 섹션 colCount=2**. 머릿말은 단 흐름 밖
전폭이라 1단 헤더 + 2단 본문이 같은 쪽에 공존. **단 머릿말은 매 쪽 반복** — 우리의 *풍부한
page-1 전용 헤더*(제목 배너·정보표·accent 배너 §40)는 *본문에 그려진* 1쪽 콘텐츠라 머릿말로
못 옮긴다(머릿말은 높이 제한 + 매쪽 반복). → *2단 본문 vs 풍부한 page-1 헤더* 양립 불가.

### 42-4. 현재 상태 + 진짜 고치려면

- **엔진 변경 전부 revert**(set_columns/write 배선 — 작동 안 함). 웹은 무변경(columns 는
  이미 payload 에 있고 엔진이 무시). UI 는 §41-2 의 HwpNote "2단은 미리보기 전용" 로 이미
  정직하게 안내 — *미구현이 사용자에게 거짓말 안 함*.
- **진짜 2단 구현 옵션**(후속, 사용자 결정 필요): (A) page-1 헤더를 *간소화해 머릿말로*
  이동 + 섹션 2단 — 헤더 디자인 희생(방금 만든 풍부한 헤더와 상충). (B) 헤더를 *전폭 floating
  개체*(글자처럼취급 해제 + 자리차지)로 만들어 2단 위에 띄움 — 본문 표 헤더를 floating 으로
  재구성하는 큰 작업, 미검증. (C) 2단 포기, 미리보기 전용 유지(현재).

**원칙**: HWP 다단은 *섹션 전역 + 머릿말 헤더* 패턴만 안정. 본문에 그린 page-1 헤더와
2단 본문은 HWP 모델상 양립 불가 — "맞춤" 류 옵션 구현 전 *엔진 모델의 제약*을 먼저 확인.
COM `MultiColumn` 은 작동 안 하니 재시도 말 것(실측 확정).

### 42-5. 후속 검증 — 머릿말 우회로 *2단 본문은 작동*, 남은 블록은 헤더-본문 겹침

사용자 "감수부터 시작"(헤더 아키텍처 변경 수락) + "1쪽에만 풍부한 헤더" 결정 후, §42-3 의
(A) 머릿말 경로를 POC + 실 변환 경로(convert_cli)로 검증. **핵심 메커니즘 작동 확인** — 단,
*헤더-본문 수직 겹침*이 미해결이라 *revert*(미반영 유지). 다음에 *이것만* 풀면 완성.

**작동한 레시피 (POC + modern 2단 실 렌더 확인)**:
- `write()`: `columns==2 and not form_mode` 면 헤더를 *머릿말*에 그림(`header_begin(0)` →
  `render_template_header` → `region_end`). 본문은 머릿말 밖이라 단 흐름 영향 X.
- 신규 후처리 `_apply_body_columns(hwpx, gap_mm, top_mm)`: section XML 의 `<hp:colPr
  colCount="1"→"2" sameGap=N>` + `<hp:margin top=...>` 패치. `write_exam_to_hwp` 의
  `columns==2 and not use_form` 에서 호출. **결과: 본문이 실제 2단으로 흐름**(1~6 좌단, 7~11
  우단 — modern 렌더 확인). colPr=2 도 top=72mm(20409) 도 XML 에 정상 적용 검증됨.
- **리치 헤더가 머릿말에 그대로 들어감** — 처음 우려한 "헤더 간소화" 불필요(POC 에서 jeongtong
  제목배너+정보표+학생표 전부 머릿말에 렌더됨).

**미해결 블록 (다음 세션 시작점)**:
1. **헤더-본문 수직 겹침** — top 여백을 72mm 로 키워도(XML 확인) *본문이 그 여백을 안 지키고
   ~50mm(헤더 표 높이)에서 시작해 머릿말 헤더와 겹침*. HWP 가 머릿말 콘텐츠가 (top-header)
   초과 시 본문을 아래로 안 밀고 겹치는 레이아웃 동작 의심. → `header`(머릿말 거리) 자체를
   키우거나, 머릿말 높이 고정(`<hp:header>` 영역 높이), 또는 첫 문단에 빈 spacer 로 본문을
   밀어내는 방법 실험 필요.
2. **page-1-only 헤더**(사용자 선택) — 현재 `header_begin(0)`=양쪽이라 매 페이지 반복.
   "첫 쪽 다르게"(secPr visibility/firstHeader) XML 구성 필요 — 미착수.
3. **jeongtong(form 모드)** — 헤더가 폼 파일 body 에 있어 머릿말 경로 안 탐. 2단 form 별도 필요.

**원칙(보강)**: 2단 본문 자체는 *머릿말+colPr=2* 로 가능(검증). 막힌 건 *머릿말 높이 ↔ 본문
시작 위치* 한 점 — COM 으로 못 푼 것(MultiColumn)과 달리 *XML 레이아웃 튜닝* 영역이라 해결
가능성 높음. 재개 시 위 미해결 1번(겹침)부터. POC: `D:\tmp\poc_header_2col.py`(임시).

### 42-6. *해결* — 간단 머릿말 헤더로 2단 작동 (commit `decec15`, 6 템플릿)

§42-5 의 "겹침"은 *머릿말 헤더가 너무 길어서*였다(리치 헤더가 우측 단을 침범). 결정 테스트
(top 여백 100mm)로 *여백을 키워도 우측 단이 헤더 위로 시작*함을 확인 — 머릿말 헤더는 **단
시작점 위에 들어갈 만큼 짧아야** 한다(대수회 폼이 되던 이유 = 한 줄 머릿말). 사용자 결정:
**2단일 때만 간단 헤더**(1단은 리치 그대로).

**구현**:
- `template_headers.compact_header(s, meta)` — 제목(볼드 1줄) + 학교·학년·과목·시험일(작게 1줄).
- `hwp_com_writer.write()`: `columns==2 and not form_mode` 면 `header_begin(0)` → `compact_header`
  → `region_end`(머릿말). 1단은 `render_template_header`(리치) 그대로.
- `_apply_body_columns(hwpx, gap_mm=8, top_mm=30)`: 섹션 colPr colCount=1→2 + 위 여백 30mm
  (컴팩트 헤더 높이). `write_exam_to_hwp` 의 `columns==2 and not use_form` 에서 호출.
- `convert_cli`: `columns==2` 면 `form_path=None`(폼 건너뜀) → **jeongtong 도 COM 컴팩트 경로로
  2단 적용**(폼은 본문에 헤더 박혀 2단 불가).

**검증**: jeongtong·modern 2단 렌더 — 컴팩트 헤더(전폭) + 본문 2단(1~7 좌단/8~14 우단) 깔끔,
겹침 0. modern 1단 회귀 — 리치 헤더 그대로. 웹 UI 안내도 "2단 HWP 반영"으로 갱신.

**남은 것(후속)**: ① 컴팩트 헤더가 *매 페이지 반복*(running header) — page-1-only 는 "첫 쪽
다르게"(secPr) 필요. ② 컬럼 구분선(LineType) 미적용 + payload Pick 에 columnDivider 없음.
③ top_mm 30 고정 — 헤더가 더 길면(학기 등 추가) 미세조정 필요. → **③ 해결 §42-7**.

**원칙**: HWP 2단 = *짧은 머릿말 헤더 + 섹션 colPr=2*. 본문에 그린 헤더는 단과 양립 불가라
2단 전용 컴팩트 헤더로 분기. 리치 헤더가 필요하면 floating 개체(미구현)뿐.

### 42-7. *해결* — 2단 top 여백 동적화 (commit `88ea470`, 엔진)

§42-6 의 남은 디테일 ③ 해결. 폼 조사(testchange `hwp_form_writer` + 대수회 `.testkit/_rawform.hwpx`)
결과 *검증된 패턴 = `margin header == top == 머릿말 textHeight` 정렬* — 머릿말 밴드 끝 = 본문
단 시작이라 빈 공간 0, 겹침 0. 폼은 머릿말 1×3 표 1행이라 높이 예측돼 `header=top=4251`(15mm)
고정. 우리 COM 컴팩트헤더도 *제목(13pt 1줄) + 정보줄(9pt 1줄, subj 기본 "수학"이라 항상)* 로 줄
수가 예측 가능 → DOM 측정 없이 줄 수×폰트로 추정.

**근본 문제**: 과거 `_apply_body_columns` top 42mm 고정이 헤더 실측(~15mm)보다 ~27mm 과대 +
머릿말이 매 페이지 반복(`header_begin(0)`)이라 그 여백이 secPr 전역으로 먹어 2단인데도 페이지
불어남(다사중 20문항 4쪽).

**구현 3 지점**:
- `template_headers.compact_header_height_mm(meta)` 신설 — 줄 수×폰트(1pt≈0.3528mm, 줄간격
  160%) 로 헤더 높이(mm) 추정. `compact_header` 가 이 값 반환(기존 None → float).
- `_apply_body_columns(hwpx, gap_mm, top_mm)` — top_mm 기본 42→15. `<hp:margin>` 의 `top` 과
  `header`(머릿말 밴드 높이) *둘 다* top_mm 으로 패치(폼 정렬 모방). 정규식 2개(top·header 각각).
- `write_exam_to_hwp` 호출부 — `compact_header_height_mm(hdr_meta) + 3mm` 로 top 산정. write()
  와 동일하게 title 없으면 `document.title` 폴백(그려질 줄 수와 일치).

**검증**(실 시험지 다사중 20문항 jeongtong 2단): patched XML `header="4371" top="4371"`(15.4mm,
폼 검증값 15mm과 동일), **페이지 4→3**, 헤더 겹침 0, 본문 단 시작이 헤더 바로 아래. 회귀:
1단 jeongtong 리치 헤더 그대로(게이트 `columns == 2 and not use_form` 안에서만 변경 + compact_header
return 값은 write() L1110 에서 무시 → 1단 무영향). payload 무변경(엔진 전용, 회귀 0).

**원칙**: 머릿말 헤더 ↔ 2단 본문 겹침 방지의 정답은 *top·header 를 헤더 실제 높이로 정렬*(폼 패턴).
고정 추정 금지 — 헤더 줄 수 가변이라 `compact_header_height_mm` 같은 *그려질 줄 수 기반 산정* 필요.
page-1-only(①)·컬럼 구분선(②)은 폼 선례 없어 후속(secPr XML 신규 / payload Pick cascade).

### 42-8. *해결* — 2단 대수회 여백 고정 + 박스/표 칼럼 폭 + COM late-binding 근본 수정 (commits `7d6eb6e`·`4976dec`, 엔진)

사용자 보고(2026-06-24): 2단인데 (1) `<보기>`·조건 박스/표가 *단 폭을 넘어 overflow*, (2) 좌우
여백 30mm 너무 넓음 → "상하좌우여백을 대수회폼으로 해".

**(A) 대수회 여백 고정**: `_DAERYUN_MARGIN` 상수(좌우 5669=20mm·하 5669·꼬릿 2834=10mm·top/header
4251=15mm). `_apply_body_columns` 가 secPr `<hp:margin>` *전체*를 이 한 벌로 교체(섹션당 1개라
`re.sub(r'<hp:margin\b[^>]*/>', …)` 전치환 안전). top/header 는 폼의 `header==top` 정렬을 유지하되
`max(대수회 top 4251, 컴팩트 헤더 실제 높이)` — 보통 정확히 15mm, 헤더 길면 grow. §42-7 의 동적
top 을 흡수(이제 좌우/하/꼬릿까지 대수회 한 벌). 호출부는 raw `compact_header_height_mm`(+3 패드
제거 — max 바닥값이 이미 겹침 방지).

**(B) 박스/표 칼럼 폭** (overflow fix — *경로 2개*, CRITICAL 함정): 2단 박스가 단을 넘는데, 박스
종류마다 *생성 경로가 다르다*:
- **OCR 표·줄기잎·단순 박스** = COM `table_begin(line_width=42000)`(148mm) → `_box_width()` 신설로
  `self._columns==2` 면 `_COL_WIDTH_2COL`(=(A4 59528 − 좌우 5669×2 − 단간격 2268)/2 − 500 ≈ 22461
  units = 79mm) 전달(`_write_equation_table` 2곳 + `_write_condition_box` 1×1 1곳). WidthType=0
  절대폭이라 생성 시 고정.
- **`<보기>`/`<조건>` 라벨 박스** = ⚠️ **COM 아님!** `_inject_bogi_form` 이 `bogi_box_template.py`
  의 *고정 폭 5×5 병합표(`<hp:sz width="29307"`=103mm)* 를 저장 후 XML 주입(레퍼런스 픽셀 동일
  폼). 즉 `_box_width`(table_begin) fix 가 이 박스엔 *무관* — 처음에 "박스 fit" 으로 오판한 원인
  (1×1 박스는 inject 단계에서 5×5 로 치환됨). **해결**: `_scale_bogi_box_width(tbl, target)` — 템플릿
  수치 `width="N"`(`<hp:sz>`+`<hp:cellSz>`)을 29307 기준 ratio 일괄 곱(행별 합·colSpan 병합 보존,
  margin/horzsize/widthRelTo 불변). `_inject_bogi_form(columns)` 가 `columns==2` 면 `_COL_WIDTH_2COL
  − outMargin 566` = 77mm 로 스케일(footprint=표폭+outMargin 가 칼럼 안). 1단은 게이트로 29307 유지.

**원칙(박스 경로)**: 2단/폭 관련 박스 함정은 *생성 경로를 먼저 확인* — `table_begin`(COM) vs
`bogi_box_template`(XML 주입 5×5) vs 헤더 표(`_fit_header_tables`). 시각으로 "fit 됐다" 판단 금지,
*생성 .hwpx 의 `<hp:tbl> <hp:sz width>` 를 units 로 측정*해 확인(다사중 #4 박스: 29307→21895).

**(C) COM late-binding 근본 수정** (CRITICAL — flakiness 해소): 위 검증 중 `header_begin` 이
`HHeaderFooter object has no attribute 'Type'` 로 *간헐* 실패(§39-0/§40-4 의 그 flakiness). 실측
확정: `_dispatch_hwp` 의 `gencache.EnsureDispatch`(early-binding)가 이 HWP 버전 type library 에서
`HParameterSet.HHeaderFooter` 의 `Type`/`Item`/`SetItem` 동적 멤버를 *노출 못 함*(gen_py 정리 후
makepy 재생성해도 동일 — early-binding 래퍼 자체가 불완전). gen_py 캐시 존재 여부로 "됐다 안 됐다"
하던 것. **해결**: `win32com.client.dynamic.Dispatch`(강제 late-binding). DISPID 런타임 해석이라
동적 멤버 정상 + 캐시 손상 무관. 배포 `.exe`(frozen)도 이미 late-binding 으로 가동 중 → 프로덕션
동작과 일치. 이 모듈은 win32com `constants` 미사용(grep 검증)이라 early-binding 의존 0 → 안전.
⚠️ `win32com.client.Dispatch`(non-dynamic)는 gen_py 있으면 early 를 돌려줄 수 있어 `dynamic.Dispatch`
가 필수. **gen_py 를 함부로 `rmtree` 하지 말 것** — 재생성이 불완전 래퍼를 만들어 더 악화(이번에
디버그 중 실수로 정리했다가 late-binding 으로 근본 해결).

**검증**(다사중 20문항 jeongtong 2단): margin `header=top=4251`(15mm)·`left=right=5669`(20mm)·
`bottom=5669`·`footer=2834` = 대수회 정확 일치, `<보기>` 박스가 좌측 단 79mm 폭에 들어가고 우측
단 미침범, 페이지 3. 회귀: 1단 jeongtong 리치 헤더·표 정상(late-binding + `_box_width` 분기 +
`columns==2 and not use_form` 게이트).

**원칙**: HWP COM 은 *late-binding(dynamic.Dispatch)* 이 정답 — early-binding gen_py 는 parameter-set
동적 멤버 노출이 type library 버전 의존이라 flaky. 2단 박스/표는 `table_begin(line_width=칼럼폭)`
으로 단 overflow 방지(절대폭이라 생성 시 확정). 여백은 검증 폼(대수회) 한 벌을 그대로 베끼는 게 정답.

**(D) 문항 번호 중복 "4. 4." 제거** (commit `11626d1`): 사용자 보고 — 일부 문항만 번호가
두 번. 원인: OCR 이 인쇄된 번호를 본문 첫 텍스트 블록에 포함한 경우(다사중 #4: 본문 "4. 연립
방정식…"), `_write_question` 이 번호 접두사("4. ")를 또 붙여 중복. #3·#5·#8 은 본문에 번호 없어
정상 → "일부만". 해결: `_write_question(top_level)` 시작부에서 본문 첫 TEXT 블록이 *자기 문항
번호 + `.`/`)` + 공백*으로 시작하면 strip(`^\s*N\s*[.)]\s+`, 보수적 — "4.5" 소수·타 번호 본문
미발동). §38-1 의 `(1)(1)` 소문항판이 HWP 메인 번호로 재발한 것(§30-6 함정의 전염).
