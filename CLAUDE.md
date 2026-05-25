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
- **Step 5 mathlab 9 templates 풀 import** (large / csat / notebook / formal / bubble)
- **인쇄 프리셋 localStorage** (mathlab `mathlab_print_preset` 패턴)
- **워터마크 / 학원 로고** (인쇄 시 옅게)

### 19-4. 작은 개선
- **task #41 — OCRItem 카드별 모델 선택 + 재실행 메뉴** — item 별 Pass 2 trigger 또는 Sonnet 으로 강제 OCR
- **task #31 — 브라우저 verify (SVG 크기 + 표 줄바꿈)**
- **Windows 콜론 파일명 처리** — `migrated_prompt_history/prompt_*T*Z.json` 같은 ISO timestamp 파일이 Windows 체크아웃 실패. `.gitattributes` 또는 *cross-platform safe naming* 으로 마이그레이션.
- **Step 5 PDF 출력의 KaTeX 깨짐** — html2canvas → jsPDF 경로의 폰트 / SVG 누락. Puppeteer headless print 또는 react-pdf 검토.

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
