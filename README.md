# MathGen 변환 — 시험지 변환 도구

한국 중·고등학교 수학 시험지 PDF를 업로드하면 AI가 OCR로 문제·도형을 추출하고,
단계별 해설과 정답까지 생성하는 7단계 변환 위자드.

## testchange 연결 (2026-09-11)

기존 React/Vite 변환 화면에 `시험지 한글화(testchange)`의 Supabase 기출 자료와
로컬 HWP 엔진을 연결했다. 확인 시점의 원본 자료는 시험지 412편, 문항 9,110개다.

- 같은 Supabase 프로젝트(`pqylrbowrfliicxzurex`)의 이메일 인증을 사용한다.
- `exams`/`questions`는 로그인 후 `/api/testchange`를 통해 조회한다.
  서버의 service-role 키는 브라우저에 전달하지 않는다.
- 원본 자료는 유지하며, **이어서 작업**은 편집본을 만든다. 편집본과 출력 설정은
  계정별 IndexedDB에 저장되므로 같은 브라우저에서 다시 열 수 있다.
  다른 PC와 동기화되지 않으며 브라우저 사이트 데이터를 지우면 삭제된다.
- **원본 서식으로 한글 저장**은 원본 typed-block, 소문항, 도형 spec/SVG와 인쇄 배점을
  testchange 도우미에 전달한다. 웹 미리보기의 도형은 그림 자리 안내로 표시된다.
  한글이 설치된 PC에서 도우미를 실행해야 원본 `.hwp`를 저장할 수 있다.
- 최신 엔진의 점 이름/수직선 표기, 수식 백슬래시, 짧은 값 나열, 질문 괄호 간격,
  소문항 중복 박스, 산문 박스 경계, 소수 배점 보존을 웹에도 반영했다.

연결 설정은 git에서 제외된 `.env.local`에 둔다. 기존 엔진 `config.json`과
공개 키가 담긴 로컬 파일로 설정을 동기화할 수 있다.

```powershell
node scripts/syncTestchange.mjs "D:\시험지 한글화" "D:\keys\testchange-anon.txt"
npm run dev
```

필요한 값은 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ENABLED=true`, `VITE_TESTCHANGE_ENABLED=true`다.
Vite 개발 서버는 로컬 주소에서 인증된 API 호출을 처리한다. 운영 환경에서는
같은 서버 환경변수와 `api/` 함수 실행 환경이 필요하다.

회귀 검증(추가 패키지 설치 불필요):

```powershell
node scripts/runHarness.mjs scripts/testchangeHarness.mts scripts/contentParserGoldenHarness.mts scripts/contentParserPortHarness.mts scripts/ocrJsonRecoveryHarness.mts
```

검증 결과: 이메일 로그인, 기출 목록·문항 상세, 출력 미리보기, 편집본과 출력 설정
재열기, 21문항 원본 HWP 생성 확인. 기존 의존성 `npm audit --omit=dev`는
DOMPurify·protobufjs의 moderate 2건과 PDF.js의 high 1건을 보고했다.
PDF.js 수정 버전은 major 업데이트가 필요하므로 별도 호환성 검증 대상이다.

## 주요 기능

### 7단계 위자드 (`/`)
0. **업로드** — PDF → 페이지별 hi-res 이미지 + IndexedDB 캐시. 자동 회전 감지.
1. **검수** — 페이지와 문제 영역을 확인하고 조정.
2. **OCR** — Gemini 3 Flash → 폴백 3.5 Flash 로 페이지별 multi-problem
   추출. 도형 페이지는 자동으로 GPT-5.5 → 폴백 Gemini 3.1 Pro 로 2차 정밀
   재추출. 카드별 인라인 편집.
3. **해설·정답 생성** — Claude Sonnet 4.6 으로 단계별 풀이 + 짧은 정답 자동
   생성. 항목별 재생성·편집.
4. **변환 옵션** — 변환 목표·난이도·동봉 자료 선택.
5. **문항별 검토** — 문항과 정답을 확인하고 수정.
6. **내보내기** — HWP 도우미, 인쇄·PDF로 저장, 보관함 저장.
   현재 출력 대상은 원본이며 변형 출력과 DOCX는 준비 중이다.
   PDF 다운로드는 배포 환경의 인증된 서버 API를 사용한다.

### 보조 화면
- **모델 비교 벤치** (`?bench`) — 같은 페이지를 여러 모델로 동시 OCR 해서
  도형·표 렌더링 품질을 나란히 비교. 23개 모델 (Anthropic 3 + Gemini 7 +
  OpenAI 13) 지원.
- **KaTeX 렌더 테스트** (`?katex`) — 90+ 케이스, 14 카테고리 (분수·근호,
  기하 표기, 삼각함수·로그, 적분·미분, 행렬 등). Direct vs Pipeline 비교.
- **레거시 단일 페이지 UI** (`?legacy`) — 초기 SaaS rebuild 이전 UI.
- **디자인 시스템 playground** (`?ui`) — `src/components/ui` 컴포넌트 카탈로그.

> 운영 빌드에서는 `?bench`, `?croptest`, `?katex`, `?legacy`, `?ui` 같은
> 개발·검증 라우트가 기본 차단된다. 로컬 개발 중이거나
> `VITE_ENABLE_DEV_TOOLS=true` 일 때만 접근 가능하다.

## 로컬 실행

**전제**: Node.js 18+

```bash
# 1) 의존성 설치
npm install

# 2) .env.local 작성 (3개 API 키 모두 또는 일부)
echo 'ANTHROPIC_API_KEY=sk-ant-...'  >> .env.local
echo 'GEMINI_API_KEY=AIza...'        >> .env.local
echo 'OPENAI_API_KEY=sk-...'         >> .env.local

# 3) 개발 서버
npm run dev
# → http://localhost:3005

# 4) 프로덕션 빌드
npm run build
```

> **보안 주의**: 비용이 발생하는 `/api/ai-*` 및 `/api/export-pdf` 는
> Supabase Bearer 토큰이 있어야 호출된다. `vite.config.ts` 는 Vite의
> `loadEnv(..., "")` 를 쓰지 않고 허용된 환경변수만 읽는다. 서비스 role key
> 같은 서버 전용 비밀값을 `VITE_*` 또는 클라이언트 번들에 넣지 말 것.
> 과거 빌드 디버그 로그에 실제 키가 노출된 적이 있으므로, 배포 전 노출된
> provider key와 Supabase service-role key는 회전하는 것이 안전하다.

## 모델 라우팅

| 작업 | 1차 모델 | 폴백 모델 |
|---|---|---|
| OCR — 텍스트 | Gemini 3 Flash (Preview) | Gemini 3.5 Flash |
| OCR — 도형 | GPT-5.5 | Gemini 3.1 Pro (Preview) |
| 해설·정답 생성 | Claude Sonnet 4.6 | (단일 모델) |

폴백 트리거: 1차가 `non-AbortError` throw 시 자동. `AbortError` 는 폴백 안 함
(사용자 취소 의도 존중).

provider 별 골격:
- **Anthropic**: `messages.stream().finalMessage()` (max_tokens 64k, streaming
  필수)
- **Gemini**: `@google/genai` v1.44+ — schema 변환 `toGeminiSchema()`,
  finishReason 체크
- **OpenAI**: GPT-5 family + o-series 는 `max_completion_tokens`. gpt-5.5-pro
  는 Responses API + `reasoning.effort: "low"`

## 기술 스택

- **Framework**: React 19 + Vite 6 + TypeScript
- **Styling**: Tailwind CSS + 자체 디자인 토큰
- **상태**: Zustand + sessionStorage persist
- **PDF**: pdfjs-dist 5.x (worker = unpkg, standardFontDataUrl 포함),
  jsPDF 4.x + html2canvas 클라이언트 fallback, Puppeteer 서버 PDF API
- **AI SDKs**: `@anthropic-ai/sdk`, `@google/genai`, `openai`
- **수식**: KaTeX (npm import) + react-markdown + remark-math + rehype-katex
- **저장**: IndexedDB (`pageImages`, `pageThumbnails`, `pdfBlobs`)

## 검증 체크리스트

보안·배포 변경 후에는 최소 아래 명령을 통과시킨다.

```bash
npx tsc --noEmit --pretty false
npm audit --omit=dev
npm run build
```

빌드 산출물에는 실제 provider key 또는 Supabase service-role key가 없어야 한다.

```bash
rg -o "sk-ant|sk-proj|AIza|SUPABASE_SERVICE_ROLE" dist
```

2026-06-09 보안 패치 기준 확인 결과: 타입체크 통과, production build 통과,
`npm audit --omit=dev` 0건, `dist` 비밀값 패턴 0건.

## 프로젝트 구조 (요약)

```
src/
├── App.tsx                      — URL gate 기반 라우팅 (?bench / ?katex / ?legacy / ?ui / default)
├── components/
│   ├── math/MarkdownRenderer.tsx — Stage 0~4 파이프라인 (SVG 추출 → KaTeX 사전 렌더 → choice grid)
│   ├── wizard/                  — Step1Upload, Step2OCRReview, Step3SolutionReview, OCRItem, SolutionItem, PageThumbColumn ...
│   ├── library/                 — 시험지 라이브러리 화면
│   ├── detail/                  — 단일 시험지 상세
│   ├── modal/                   — 모달 레이어
│   └── ui/                      — 디자인 시스템 (Btn, Card, Chip, Icon ...)
├── hooks/
│   ├── usePageOcr.ts            — Step 2 페이지 단위 fan-out (pLimit + AbortController + fallback chain)
│   └── useSolutionGen.ts        — Step 3 문제 단위 fan-out
├── lib/
│   ├── pdfProcessor.ts          — loadPdf / renderPageForAI / detectPageRotation / applyRotation
│   ├── imageStore.ts            — IndexedDB CRUD (pageImages / pageThumbnails)
│   ├── concurrency.ts           — pLimit + withRetry (mathlab 패턴)
│   └── textPreprocess.ts        — KaTeX 입력 정규화 (\displaystyle, autoSizeBrackets, geometry labels)
├── services/ai/
│   ├── client.ts                — Anthropic 클라이언트 + SONNET / OPUS / HAIKU 상수
│   ├── gemini.ts                — Gemini 클라이언트 + 모델 상수
│   ├── openai.ts                — OpenAI 클라이언트 + GPT 모델 상수
│   ├── ocr.ts                   — extractPageProblems (provider dispatch + parseJsonOrThrow + friendly errors)
│   ├── ocrSchema.ts             — OCR_PAGE_SCHEMA (items[].{number, text, topic, images, confidence})
│   ├── solutions.ts             — generateSolution (텍스트만, 16k cap)
│   ├── solutionsSchema.ts       — SOLUTION_SCHEMA ({solution, answer})
│   ├── prompts.ts               — COMMON_INSTRUCTIONS, OCR_PAGE_PROMPT, SOLUTION_PROMPT, ...
│   └── sanitize.ts              — fixLatexEscaping + protectLooseLatex (LaTeX 백슬래시 복원, raw HTML 보존)
├── stores/
│   ├── appStore.ts              — 최상위 화면 routing (library / detail / wizard)
│   ├── wizardStore.ts           — WizardPage / OCRProblem / 6단계 state
│   └── libraryStore.ts          — 라이브러리 카드 데이터
├── screens/
│   ├── KatexTestScreen.tsx      — KaTeX 렌더 테스트 (?katex)
│   ├── ModelBenchScreen.tsx     — 모델 비교 벤치 (?bench)
│   └── LegacyScreen.tsx         — 초기 단일 페이지 UI (?legacy)
├── styles/globals.css           — Tailwind base + 도형/표/KaTeX 보정 CSS
└── types/                       — 공유 타입 정의
```

## 작업 지침서

`CLAUDE.md` 에 36개 함정·해결책 9개 섹션으로 정리되어 있다. 새 작업
시작 전 반드시 일독 — 같은 실수 두 번 안 하기 위해 현장에서 사용자 보고로
확인된 진짜 함정만 기록.

## 라이선스

내부 프로젝트 — 미정.
