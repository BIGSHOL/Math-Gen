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

### 1-6. 모델 체인 fallback 의 `dispatched` Set 마커 함정 (CRITICAL)

`usePageOcr` 같은 fan-out hook 은 `dispatched.current` 가 **컴포넌트 mount
전 기간 살아있는 Set**. 한 번 dispatch 된 페이지 id 는 영원히 박힘.

**증상**: 사용자가 "페이지 재인식" 눌러도, `setPageOCR({ ocrComplete: false })`
는 호출되지만 `dispatched.has(id) === true` 라 effect 가 skip → 페이지가
영원히 진행 안 됨. 새로고침 외엔 해결 불가.

**해결책**: hook 에서 `resetDispatch(pageId)` 콜백을 *반드시* return — 재시도
/ 회전 / 임의 reset 액션의 핸들러가 호출.

```ts
const { resetDispatch } = usePageOcr();
const requestRetry = () => {
  resetDispatch(activePage.id);  // ← 반드시 먼저
  setPageOCR(activePage.id, { ocrComplete: false, ... });
};
```

**참고**: `src/hooks/usePageOcr.ts`, `useSolutionGen.ts`. mathlab 패턴에서
유사한 fan-out hook 만들 때 항상 이 패턴 적용.

### 1-7. Provider fallback chain 설계

사용자 합의된 라우팅 (Phase 후속 작업 시 참고):
- **Pass 1 (텍스트)**: Gemini 3 Flash Preview → 폴백 Gemini 3.5 Flash
- **Pass 2 (도형)**: GPT-5.5 → 폴백 Gemini 3.1 Pro Preview
- **해설 생성**: Sonnet 4.6 단일 (Opus 승급은 품질 평가 후)

폴백 트리거: `non-AbortError` throw → 다음 모델로 자동. AbortError 는 폴백
안 함 (사용자 취소 의도 존중).

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

### 3-3. React useEffect 의 `cleanup` 이 mid-flight API call 을 abort 하는 함정

per-effect AbortController 패턴은 자연스러워 보이지만 — `setState` 가 부른
re-render 가 effect 재실행 → cleanup → 직전에 시작한 fetch 가 abort 됨.
결과: API call 시작은 했지만 한 tick 후 죽음, traffic 0, hang.

**해결책**: AbortController 를 **mount-lifetime ref** 에 보관 + cleanup 은
*unmount-only* 별도 effect 로 분리.

```ts
const ctrlRef = useRef<AbortController | null>(null);
if (ctrlRef.current === null) ctrlRef.current = new AbortController();

useEffect(() => () => ctrlRef.current?.abort(), []);  // unmount only

useEffect(() => {
  const ctrl = ctrlRef.current!;
  // ... use ctrl.signal
}, [pages]);  // 이 effect 의 cleanup 은 정의하지 않음
```

**참고**: `src/hooks/usePageOcr.ts`, `useSolutionGen.ts`.

### 3-4. WizardStepIndex 같은 union type 확장은 next/prev clamp 도 같이 갱신

`type WizardStepIndex = 0|1|2|3|4` → `0|1|2|3|4|5` 로 늘릴 때:
- `next` 액션의 `if (s < 4)` 도 `< 5` 로 바꿔야 함
- `useWizardGuard(step > 0 && step < 4)` 도 `< 5` 로
- `WizardScreen` STEPS 배열도 entry 추가

하나 빠뜨리면 마지막 step 진입 불가 또는 wizard guard 안 걸림.

**참고**: `src/stores/wizardStore.ts`, `src/components/wizard/WizardScreen.tsx`,
`useWizardGuard.ts`.

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
2. **Chrome MCP 콘솔 에러 확인** — `read_console_messages` 로 새 에러 없는지
3. **TaskUpdate completed** — 끝낸 작업은 반드시 completed 마킹

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

## 9. Phase 진행 상황 (참고용)

현재 mathg-gen 은 6단계 wizard:
- **Step 0 (업로드)**: PDF → IndexedDB 이미지 + 자동 회전 감지 ✅
- **Step 1 (OCR)**: 페이지별 multi-problem 추출, 폴백 체인, 회전 적용 ✅
- **Step 2 (해설)**: 단계별 해설 + 정답 자동 생성 (Sonnet 4.6 기본) ✅
- **Step 3 (옵션)**: 변형 옵션 — placeholder 🟡
- **Step 4 (검토)**: 문항별 원본·변형 비교 — placeholder 🟡
- **Step 5 (내보내기)**: PDF / DOCX — placeholder 🟡

다음 작업 시 Phase 4 (옵션) 또는 후속 개선 (in-flight 모델 표시 보강, Step3
회전 동기화 등) 으로.
