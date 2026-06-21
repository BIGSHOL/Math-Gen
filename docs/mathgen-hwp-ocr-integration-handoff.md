# Math-Gen ↔ 시험지변환기(testchange) HWP/OCR 통합 검토 — 핸드오프

작성일: 2026-06-18
작성 맥락: Math-Gen 내보내기에 HWP 출력을 붙이는 문제를 조사하다가, "변환기 OCR 이
Math-Gen OCR 을 대체할 수 있나" 로 논의가 확장됨. 다른 환경에서 이어 작업하기 위한 인계.

> 이 문서는 **결론 + 근거 + 다음 결정사항** 만 담는다. 코드 변경은 아직 0. 두 저장소의
> 실제 파일 경로/심볼을 명시해 새 세션이 바로 grep 으로 검증할 수 있게 했다.

---

## 0. TL;DR (한 문단)

목표는 **Math-Gen 에서 시험지를 HWP 로 내보내기**다. 별도 프로젝트 `시험지변환기`
(GitHub `BIGSHOL/testchange`, 로컬 `F:\시험지변환기`)가 PDF→OCR→HWP 를 이미 완성·검증
(129편 코퍼스)했다. 조사 결과 **변환기 OCR 은 Math-Gen OCR 의 "더 성숙한 Python 쌍둥이"**
(같은 비전→SVG 도형 파이프라인, 거의 동일한 크롭 프롬프트, 타입 블록 출력 + label_type).
데이터/품질 면에서 변환기 OCR 이 Math-Gen OCR 을 **대체 가능**하고, 출력 역매핑도 쉽다.
**유일한 실질 걸림돌은 런타임 — 변환기는 Python, Math-Gen 은 Vercel TS.** 그래서 (a) TS 포팅
(비추천, 코퍼스 검증 손실) 또는 (b) Python OCR 마이크로서비스(권장) 중 선택. HWP COM 부분만
Windows 전용이라 별도 커넥터로 격리.

**당장 추천**: "HWP 전용 분리" — Math-Gen OCR 은 웹/PDF 용으로 두고, HWP 내보낼 때만
변환기 풀 파이프라인을 별도 백엔드로 호출. 통합 리스크 0, 각자 타깃에 최적. 풀 OCR 대체는
효과 보고 그다음.

---

## 1. 두 프로젝트

| | Math-Gen | 시험지변환기 (testchange) |
|---|---|---|
| 위치 | `F:\Mathgen` (이 저장소) | `F:\시험지변환기` |
| 원격 | `BIGSHOL/Math-Gen` | `BIGSHOL/testchange` |
| 스택 | React + TS, Vercel 서버리스(`api/*.ts`), Supabase | Python (PySide6 GUI, PyInstaller exe), HWP COM |
| 역할 | PDF 업로드·OCR·KaTeX 검수·변형·PDF 출력 (웹) | PDF→OCR→**.hwp/.hwpx** 정밀 출력 (Windows 데스크톱/커넥터) |
| 비고 | — | corpus 129편 검증(reviewed 72/ocr_done 56). 최근까지 활발 개발 |

전략 문서: [`docs/hwp-connector-strategy.md`](hwp-connector-strategy.md) (이미 저장소에 있음).
요지 = Math-Gen 은 웹 프론트, 변환기는 "한컴 설치 사용자 전용 고급 출력" 커넥터.

---

## 2. Math-Gen 현재 내보내기 상태

[`src/components/print/PrintActionPanel.tsx`](../src/components/print/PrintActionPanel.tsx)
- PDF 다운로드(서버 Puppeteer `api/export-pdf.ts` / 클라 html2canvas), 인쇄, DOCX 버튼이
  **전부 "구현중" 으로 비활성** (MVP 락다운, 2026-06-02 결정). 로직은 유지, `onClick` 만 제거됨.
- HWP 버튼은 **아예 없음**.
- 현재 이 단계의 주 동작 = "저장 완료 (보관함으로)".

Math-Gen 문제 데이터 모델:
- [`src/types/index.ts`](../src/types/index.ts) `GeneratedProblem`: `question`(마크다운+`$LaTeX$`),
  `choices?[]`, `answer`, `solution`, `points?`, `diagramParams?`(벡터), `images?`(dataUrl),
  `choicesLayout?`.
- [`src/stores/wizardStore.ts`](../src/stores/wizardStore.ts) `OCRProblem` / `OCRImage`.

---

## 3. 변환기 입력 계약 (Math-Gen 데이터를 어떻게 받나)

변환기는 PDF→자체OCR 을 안 거치고 **구조화 JSON 을 직접 받는 진입점**이 있다:
- `core/content_parser.py` → `parse_ocr_response(ocr_result: dict, page_number)` → `ExamPage`
- 같은 파일 `build_document(pages)` → `ExamDocument`
- `testkit.py` 가 캐시된 OCR json 을 읽어 `build_document` 로 렌더 — 즉 라이브 OCR 우회 검증 경로

기대 JSON 형태 (`core/content_parser.py` `_parse_question` 확인):
```json
{ "header": "과목/학년", "questions": [
  { "number": 1, "score": 3, "label_type": "서술형",
    "contents": [ { "type": "text", "value": "다음 $x^2-1$ 의 값은?" } ],
    "choices": [ { "number": 1, "contents": [ { "type": "equation", "value": "\\frac{5}{6}" } ] } ] } ] }
```
- `contents[].type`: `text` / `equation` / `equation_block` / `image`(파일경로) / `table`(`rows[][]`)
- 모델: `models/exam_document.py` → `ExamDocument`(title/subject/grade/pages) · `ExamPage`(header_text/questions)
  · `Question`(number/score/contents/choices/sub_questions/label_type) · `Choice`(number/contents)
  · `ContentBlock`(type/value/hwp_equation/underline/rows/box_member)
- **핵심**: `contents[].value` 안의 인라인 `$...$` 를 변환기 `content_parser` 가 알아서 분리한다
  (`_INLINE_LATEX_RE`, `_parse_raw_blocks`). → Math-Gen 의 마크다운 문자열을 text 블록 하나로
  넘겨도 변환기가 구조화함.

---

## 4. LaTeX 방언 호환성 — 거의 OK (좋은 소식)

`core/latex_to_hwpeq.py` (≈67개 명령어 매핑) 가 Math-Gen 의 KaTeX 명령어를 대부분 지원:

| Math-Gen 명령어 | 변환기 | 비고 |
|---|---|---|
| `\dfrac` `\tfrac` `\frac` | ✅ | |
| `\mathrm` | ✅ | 확통 P/E/V 는 똑똑하게 벗김 |
| `\overrightarrow` | ✅ → `VEC` | |
| `\boxed` | ✅ → `BOX` | |
| `\approx` | ✅ → `APPROX` | |
| `\displaystyle` | ❌ | 의미 없는 크기 지시어 → **strip** (사소) |
| `\htmlClass{geom-arc-wrap}` | ❌ | Math-Gen 호(arc) 렌더 해킹 → unwrap 필요 (드묾) |

→ **LaTeX 다리 = 명령어 2개 정리(strip + unwrap)면 끝.**

---

## 5. OCR 비교 — 같은 DNA, 변환기가 더 성숙

| 항목 | Math-Gen OCR | 변환기 OCR |
|---|---|---|
| 모델 | Gemini Flash(Pass1) + GPT-5.5(Pass2 도형) | Claude vision 단일 (`CLAUDE_MODEL`) |
| 본문 | `question` = 마크다운 문자열 (텍스트+`$수식$`) | `contents[]` = 타입 분리 블록 |
| 배점 | `points` 필드 | `score` 필드 + 본문 `[N점]` 추출 |
| 라벨 | 없음 | `label_type`(서술형/단답형 — 폼·정답 동기화) |
| 보기박스 | 마크다운 인라인 | `<상자>/<조건>/<보기>` + box_member + 중복제거 |
| 도형 | 벡터(`diagramParams`)+base64(`images`) | **비전→SVG→resvg_py→PNG** (주석에 "math-gen 스타일 SVG 규칙") |
| 표 | 마크다운 표 | `rows[][]` |
| 검증 | — | **129편 코퍼스 reviewed** |

핵심 발견:
- 변환기 `core/figure_generator.py` = **비전→깨끗한 SVG→PNG**. Math-Gen 도형 파이프라인과 철학 동일.
  → 변환기 OCR 채택해도 **도형 회귀 없음**(웹엔 SVG, HWP 엔 PNG 둘 다 가능).
- 변환기 `core/crop_detector.py` `_CROP_PROMPT` ≈ Math-Gen `src/services/ai/cropDetect.ts`
  `CROP_DETECT_PROMPT` (손글씨 배제 규칙까지 유사). 두 프로젝트가 교차 수정해온 흔적.
- 정답: 변환기 OCR 은 문제구조만, 정답은 별도(정답페이지/코퍼스). Math-Gen 도 Sonnet 별도
  생성 → **영향 없음(중립)**.

---

## 6. "변환기 OCR 이 Math-Gen OCR 을 대체 가능한가" — 결론

**데이터/품질: 예.** 출력 역매핑(타입 블록 → Math-Gen 마크다운+KaTeX)은 정방향보다 쉽고,
변환기는 더 plain 한 LaTeX 라 Math-Gen KaTeX 후처리(`\dfrac`/`\displaystyle` 주입)를 그대로
통과. 도형도 SVG 라 회귀 없음.

**유일한 실질 걸림돌: 런타임/언어.**
- Math-Gen OCR = Vercel TS 서버리스(`api/ai-ocr.ts`), React 웹 호출
- 변환기 OCR = Python (anthropic/google-genai/PIL/resvg_py + 수천 줄 코퍼스 튜닝 parser)

대체 방법 2가지:
- **(a) Python→TS 포팅** ❌ 비추천 — 129편 검증 손실, 두 코드베이스 drift, 막대한 작업.
- **(b) Python OCR 마이크로서비스** ✅ 권장 — 변환기 OCR/크롭/도형은 HWP COM 안 쓰니
  **Linux 호환**(순수 API + PIL + resvg). 서비스로 띄우고 Math-Gen `/api/ai-ocr` 가 얇은
  프록시로 호출. 웹 검수/변형/해설/PDF 는 Math-Gen 유지. HWP COM 만 Windows 커넥터로 격리.

```
Math-Gen Web (React)
  → /api/ai-ocr (얇은 프록시)
      → Python OCR 서비스 (변환기 엔진, Linux 컨테이너)  ← 타입 블록 + SVG 도형
  → 역매핑 → Math-Gen OCRProblem (웹/PDF/변형/해설)
  → HWP: 타입 블록 → HWP Connector (Windows COM) → .hwp
```
→ **OCR 하나(더 좋은 것)로 웹+HWP 둘 다 서빙. 도형 SVG 공유.**

---

## 7. 두 가지 전략 (사용자 결정 대기)

### 전략 A — HWP 전용 분리 (당장 추천)
- Math-Gen OCR = 웹/PDF 유지. HWP 내보낼 때만 **변환기 풀 파이프라인(자체 OCR→HWP)** 을
  별도 백엔드로 호출 ("업로드한 PDF 를 변환기에 넘김").
- 장점: 통합 리스크 0, 각자 타깃 최적, 변환기 검증 그대로 활용. 시작이 가장 빠름.
- 단점: OCR 2벌(웹용 1 + HWP용 1) — 비용 중복, Math-Gen 검수 결과는 HWP 에 반영 안 됨.

### 전략 B — 풀 OCR 대체 (마이크로서비스)
- 변환기 OCR 을 마이크로서비스로 → Math-Gen OCR 전면 대체. 웹 검수 품질까지 상승.
- 장점: 단일 OCR, 검수 1회로 웹+HWP, 더 나은 OCR 전사용.
- 단점/비용:
  1. **Python 서비스 호스팅** — Vercel 서버리스 불가, 지속형 호스트(Render/Railway/Fly/컨테이너)
     필요. 새 인프라 + 운영.
  2. **역매퍼**(타입 블록 → Math-Gen `OCRProblem`/`GeneratedProblem`) — 기계적이지만 작업.
  3. **마이그레이션 검증** — Math-Gen 의 KaTeX 안전망(CLAUDE.md §2/§18/§26)이 Gemini Flash
     raw LaTeX 누출 대응용. 변환기의 깨끗한 LaTeX 면 대부분 무해 통과 예상(검증 필요).

---

## 8. 다음 단계 (택1로 시작)

1. **(검증 먼저)** Math-Gen 시험지 1장을 변환기로 돌려 **실제 HWP 결과물 품질 확인** → A/B 결정.
2. **전략 A 착수**: Math-Gen "HWP 로 내보내기" 버튼 추가 + 업로드 PDF 를 변환기 백엔드로 전달
   (변환기를 로컬 커넥터 `/convert` 또는 중앙 Windows worker 로 래핑 — 전략문서 2~3단계).
3. **전략 B 착수**: 변환기 OCR Python 마이크로서비스화 + Math-Gen `api/ai-ocr.ts` 프록시 전환
   + 타입블록→OCRProblem 역매퍼.
4. **(공통 준비) 매퍼 PoC**: `GeneratedProblem[]` ↔ 변환기 OCR-JSON 양방향 매퍼를 Math-Gen
   안에서 작성 → 변환기 `testkit.py`/`build_document` 에 수동으로 먹여 검증 (커넥터 없이 저위험).

---

## 9. 참조 파일 인덱스 (grep 시작점)

**Math-Gen (`F:\Mathgen`)**
- `src/services/ai/cropDetect.ts` — 크롭(Gemini Flash + GPT-5.5), `CROP_DETECT_PROMPT`
- `src/types/index.ts` — `GeneratedProblem`
- `src/stores/wizardStore.ts` — `OCRProblem`, `OCRImage`
- `src/components/print/PrintActionPanel.tsx` — 내보내기 패널(현재 전부 비활성)
- `api/export-pdf.ts` — 서버 PDF(Puppeteer)
- `docs/hwp-connector-strategy.md` — HWP 커넥터 전략

**시험지변환기 (`F:\시험지변환기`, repo `BIGSHOL/testchange`)**
- `core/content_parser.py` — `parse_ocr_response`, `build_document`, `_parse_question` (입력 계약)
- `core/ocr_engine.py` — `EXAM_OCR_PROMPT`, `CLAUDE_MODEL`, OCR 출력 구조
- `core/latex_to_hwpeq.py` — LaTeX→HWP 수식 (≈67 매핑)
- `core/figure_generator.py` — 비전→SVG→PNG ("math-gen 스타일")
- `core/crop_detector.py` — 크롭(`_CROP_PROMPT`)
- `core/hwp_com_writer.py` — 한글 COM 작성 (Windows 전용)
- `core/hwpx_writer.py` — HWPX XML
- `models/exam_document.py` — `ExamDocument`/`ExamPage`/`Question`/`Choice`/`ContentBlock`
- `testkit.py` — 캐시 OCR json → `build_document` (라이브 OCR 우회 검증)
- `docs/HANDOFF_CONSUMER.md`, `docs/HANDOFF.md` — 변환기 운영/코퍼스 워크플로

**런타임 제약 메모**
- HWP COM = Windows + 한컴오피스 필수. Vercel(Linux) 불가 → 로컬 커넥터/Windows worker.
- 변환기 OCR/크롭/도형(figure_generator, resvg_py)은 Linux 호환 → 마이크로서비스화 가능.
- Math-Gen dev 는 API 키 미노출(CLAUDE.md §24-7) → AI 경로 검증은 Vercel preview 또는 키 명시.

---

## 10. 미해결 결정 (사용자 확인 필요)

- [ ] 전략 A(HWP 전용 분리) vs B(풀 OCR 대체) — *당장은 A 추천, 검증 후 B 검토*
- [ ] 변환기 실제 HWP 결과물 품질 사전 확인 여부
- [ ] (B 선택 시) Python 서비스 호스팅 위치
- [ ] 변환기 로컬 동기화 — 로컬 `F:\시험지변환기` 가 원격보다 **83 커밋 behind** (작업트리 clean,
      FF 가능). 이어 작업 전 `git pull` 권장. (2026-06-20: pull 완료 — `master` `d2e99b0`)

---

## 11. 확정 아키텍처 + 빌드 플랜 (2026-06-20 — 결정 잠금)

워크플로 2회(루트 추적 + OCR이식/COM전송 정밀 추적)와 사용자 결정으로 모든 갈림길이 잠겼다.

### 11-1. 확정 결정

| 항목 | 결정 | 사용자 근거 |
|---|---|---|
| 출력 포맷 | **COM `.hwp` (testchange 현재 그대로)** | "지금 현재 testchange를 그대로" |
| 배포 대상 | **HWP 설치 Windows PC 에서만 동작** | "hwp 설치된 컴퓨터에만 작동할거임" |
| → 전송 | **로컬 커넥터(127.0.0.1)만**. 중앙 worker/relay/SaaS **없음** | 위 결정의 귀결 |
| → 라이선스 | **문제 없음** — 각 사용자 자기 PC 의 설치 한컴 사용 (서버 무인 자동화 아님) | |
| OCR | **변환기 프롬프트를 Math-Gen 으로 이식** (Claude + markdown 유지) | "testchange OCR 을 mathgen 으로 이식" — 조건부 GO |
| 데이터 경로 | Math-Gen markdown JSON → 커넥터 **소형 어댑터(markdown→ExamDocument)** → `HwpComWriter` → `.hwp` | |

### 11-2. OCR 이식 — 범위 (조건부 GO)

- **이식(웹으로)**: `EXAM_OCR_PROMPT`(213줄), Claude 호출(temp=0+캐싱), **`_extract_json` 5단계 JSON 수선**, `_merge_missing_passages`(서술형 지문 복구), `_recover_table`.
- **남김(커넥터)**: `content_parser`, `hwp_com_writer`, `hwp_com`, `figure_generator`.
- **웹 렌더링 변경 0**: Claude 호출 시 기존 `OCR_PAGE_SCHEMA`(markdown) 그대로 강제 → 출력이 처음부터 markdown → `MarkdownRenderer` 무변경. (native typed-block 스키마 채택 안 함 — 회귀 회피)
- **변경 파일 3개**: `src/services/ai/ocr.ts`, `src/services/ai/prompts.ts`, `src/lib/pricing.ts`. 노력 **M**(~1주, 벤치 포함). 스키마·DB·렌더러·해설·변형 변경 0.
- **비용**: Gemini Pass1+GPT Pass2 ~$0.015/p → Claude Sonnet 단일 ~$0.009/p (동등~소폭 절감, 캐싱 -82%).
- **조건 4개**: (a) markdown 유지 (b) JSON 5단계 수선 포팅 (c) 캐시용 system/user 분리 (d) 도형 샘플 5개 벤치 통과.
- **리스크 3**: 프롬프트 캐싱 키 불일치(학년 mathDefense 를 user 블록으로 분리), 도형 회귀(Sonnet 고정·Opus 금지), JSON 수선 미포팅 시 파싱 실패율↑.

### 11-3. 커넥터 (testchange repo, 로컬)

- stdlib `http.server` (FastAPI/Flask 미설치 — 새 의존성 0, `build.spec` 무영향).
- PySide6 트레이앱으로 상주(Windows 서비스 불가 — COM 은 interactive 세션 필수, Session 0 격리).
- COM 신뢰성: **요청마다 subprocess + 전역 Lock 직렬화 + 120s timeout + `taskkill /F /IM Hwp.exe` 좀비 정리**. 보안팝업은 기존 `SetMessageBoxMode(0xFFFFFF)`+보안DLL 로 해결됨. `Visible=False` 유지.
- 신규 어댑터 **markdown OCRProblem JSON → `ExamDocument`**(권장안 A). `parse_ocr_response`(typed-block) 재사용은 markdown 결론과 충돌 → 비채택.

### 11-4. 빌드 시퀀스 (한컴은 4단계에서만 — hang 격리)

| 단계 | 작업 | repo | 검증 (한컴 무관) |
|---|---|---|---|
| 1 | **OCR 이식** — `callAnthropic` 분기 + JSON 수선 포팅 + 캐시 system/user 분리 | Math-Gen | Claude markdown OCR, 도형 5샘플 벤치 |
| 2 | **어댑터** — markdown JSON → `ExamDocument` 단위테스트 | testchange | `_sample_document()` 구조 대조 픽스처 |
| 3 | **커넥터 서버** — `/health` + `/render`(어댑터까지, COM 미호출) + CORS/토큰/Origin | testchange | `curl` 로 ExamDocument JSON 확인 |
| 4 | **COM 격리 통합** — subprocess+Lock+timeout → `HwpComWriter` | testchange | `.hwp` 출력 + 5연속 후 Hwp.exe 좀비 0 |
| 5 | **웹 연동** — `PrintActionPanel` 헬스체크+POST+Blob 다운로드+폴백안내 | Math-Gen | end-to-end |

각 단계 독립 검증 가능. 1·2 는 병렬 가능(서로 무관).

### 11-5. 남은 소규모 미정 (빌드 중 결정)

- **figures(인라인 `<svg>`/crop 이미지) → HWP 매핑**: 1차는 텍스트/수식/표만 렌더, figure 는 원본 crop 이미지 폴백 권장. 어댑터의 figure 블록 규칙 추후.
- **mathDefense system/user 분리**: 1단계 착수 전 `prompts.ts` 현재 구조에서 가능한지 점검.

### 11-6. 핵심 파일

- Math-Gen: `src/services/ai/ocr.ts`, `src/services/ai/ocrSchema.ts`(=prompts/스키마), `src/components/print/PrintActionPanel.tsx`(`handleServerPDF:133-173` 미러)
- testchange: `core/hwp_com_writer.py`(`write_exam_to_hwp:1353`), `core/hwp_com.py`(`HwpSession:166/169/262`), `core/content_parser.py`(`build_document:1962` — ExamDocument 구조 참조), 신규 `server/connector.py`·`server/convert_cli.py`·어댑터

---

## 12. 커넥터 구현 스펙 (testchange 세션용 — 2026-06-20)

Task 2~4 는 **testchange repo 에서 빌드**한다 (커넥터가 거기 살고, COM 코드 재사용 +
다른 세션 충돌 회피). testchange 세션에서 이 파일을 cross-repo Read 가능:
`F:\Mathgen\docs\mathgen-hwp-ocr-integration-handoff.md`. §11(아키텍처) + 이 §12(구현) 를 본다.

> Math-Gen 쪽 상태: Task 1(OCR 프롬프트 이식) 완료·push(`70faf33`). 아래 **12-1 wire 계약**은
> Math-Gen 이 실제 보유한 데이터 기준으로 확정 — 어댑터(Task 2)는 이 계약을 입력으로 받는다.

### 12-1. Wire 계약 (Math-Gen → 커넥터)

```
POST http://127.0.0.1:8765/convert-json
Headers: Content-Type: application/json
         X-Pairing-Token: <token>
         Origin: <mathgen origin>
Body:
{
  "schema": "v2",
  "meta":   { "title": string, "subject": string, "grade": string },
  "problems": [
    { "number": int,
      "text": "<markdown + $LaTeX$ — 객관식이면 보기 ①…⑤ 가 text 끝에 한 줄로 포함>",
      "topic"?: string,
      "figures"?: [ { "box":[yMin,xMin,yMax,xMax], "kind":"svg"|"diagram"|"crop", "label":string } ] }
  ]
}
Response: 200 application/octet-stream (.hwp bytes) + Content-Disposition: attachment; filename="<title>.hwp"
          | 4xx/5xx application/json {"error": "..."}
```

근거: Math-Gen `OCRProblem`(src/stores/wizardStore.ts) = `{ number, text(markdown, 보기 본문
끝 포함), topic?, images?, figures?, choicesLayout? }`. **text 는 단일 markdown 문자열**(converter
ContentBlock 아님). figures box 는 0–1000 정규화 `[yMin,xMin,yMax,xMax]`.

⚠️ **미보유 필드 — score(배점)**: Math-Gen OCR 은 `(N점)` 을 strip 한다(OCR_PAGE_PROMPT 4e) →
`OCRProblem` 에 score 없음. **v1 HWP 는 배점 생략**. 배점 필요 시 Math-Gen OCR 에 score 캡처
추가(OCR_PAGE_SCHEMA 소변경) — 후속. (변환기 자체 OCR 은 score 캡처하지만 markdown 경로는 손실.)

### 12-2. 어댑터 (markdown → ExamDocument) — 2 후보, **B 먼저 평가**

- **(B) 재사용 (권장 평가)**: Math-Gen 문제를 converter 의 `ocr_result` dict 형태로 reshape —
  `{header, questions:[{number, contents:[{type:"text", value:<markdown 전체>}], choices:[...]}]}` —
  후 `parse_ocr_response`(content_parser.py:20) 호출. `_parse_raw_blocks` 의 `_INLINE_LATEX_RE` 가
  인라인 `$…$` 를 이미 분리하므로, markdown 의 `$수식$` 가 자동 equation 블록화될 가능성.
  **testchange 세션이 `_parse_raw_blocks` 를 읽고 "full-markdown 한 덩어리 text value" 를 받아
  inline `$` 를 쪼개주는지 확인** → 되면 B(코드 최소, 검증된 분리 로직 재사용), 안 되면 A.
- **(A) 직접**: markdown 문자열을 직접 파싱해 `ContentBlock[]`(text/equation 분리) 생성 → ExamDocument.
- 보기: text 끝의 `① … ② …` 한 줄 → `choices` 로 분리(정규식 `[①②③④⑤]`).
- figure: v1 은 `[그림N]` placeholder / 원본 crop 폴백 (텍스트·수식·표 먼저, figure 후속).

### 12-3. 커넥터 서버 (신규 `server/connector.py`)

- stdlib `http.server.ThreadingHTTPServer(("127.0.0.1", 8765), ...)` (새 의존성 0).
- `GET /health` → `{status, version, hwp_com: bool, capabilities:["convert-json"]}`.
- `POST /convert-json` → 토큰/Origin 검증 → subprocess 위임 → `.hwp` 반환.
- `OPTIONS` → CORS+PNA preflight: `Access-Control-Allow-Origin`, `Allow-Headers: Content-Type,
  X-Pairing-Token`, `Allow-Methods: POST,GET,OPTIONS`, 요청에 `Access-Control-Request-Private-Network`
  있으면 `Access-Control-Allow-Private-Network: true`, `Max-Age: 86400` → 204.
- 보안 3중: 127.0.0.1 bind + `X-Pairing-Token`(`%LOCALAPPDATA%\mathgen-connector\token.txt`) + Origin allowlist.
- 상주: PySide6 트레이앱 또는 Windows 시작프로그램(서비스 불가 — COM interactive 세션 필수).

### 12-4. COM 자식 (신규 `server/convert_cli.py`)

- **부모(connector)는 COM 절대 안 씀.** 요청마다
  `subprocess.run([sys.executable, "-m", "server.convert_cli", "--in", req.json, "--out", tmp.hwp], timeout=120)`.
- 자식: 어댑터(12-2) → ExamDocument → `with HwpSession(): write_exam_to_hwp(doc, out)`
  (hwp_com_writer.py:1353). HWP COM 실패/미설치 → `write_exam_to_hwpx`(hwpx_writer.py) 폴백.
- 전역 Lock 으로 변환 직렬화(동시 COM Dispatch 예외 방지). timeout 시 `taskkill /F /IM Hwp.exe`.
- 기존 `SetMessageBoxMode(0xFFFFFF)` + 보안 DLL + `Visible=False` 활용(이미 구현됨).

### 12-5. 커넥터 트랙 빌드 순서 (한컴 hang 격리)

1. `convert_cli.py` — 12-6 샘플 → 어댑터 → ExamDocument → `write_exam_to_hwpx`(**COM 없이**) → `.hwpx` 확인.
2. `write_exam_to_hwp`(COM) subprocess 단발 + 5연속 후 `Hwp.exe` 좀비 0 확인.
3. `connector.py` `/health` → `/convert-json`(subprocess+Lock).
4. CORS/PNA/토큰 + `curl --data @sample.json -o out.hwp` E2E.

### 12-6. 샘플 페이로드 (테스트 픽스처)

```json
{ "schema": "v2",
  "meta": { "title": "중2 수학 중간", "subject": "수학", "grade": "중2" },
  "problems": [
    { "number": 1, "text": "$(-3)+(-6)$의 값은?\n① $-9$ ② $-3$ ③ $3$ ④ $6$ ⑤ $9$" },
    { "number": 2, "text": "[서술형 1] $x=\\sqrt{5}+1$일 때 $x^2-2x$의 값을 구하시오." }
  ] }
```

### 12-7. Math-Gen 쪽 (Task 5 — 커넥터 완성 후)

`src/services/api/hwpConnector.ts` 신규(`detectConnector` GET /health, `convertToHwp` POST
/convert-json) + `PrintActionPanel.tsx` `handleHWP`(`handleServerPDF:133-173` 미러) + 버튼 활성화 +
커넥터 미감지 시 폴백 안내. **12-1 계약 확정 후 구현** — 어댑터(Task 2)가 계약을 검증·조정할 수
있으니 그 다음. payload 의 `problems` 는 wizardStore 의 OCR 결과(현재 시험지 페이지들)에서 수집.

---

## 13. 현재 상태 (2026-06-21) — 옵션 B 네이티브 블록 + content_parser 웹 이식 완료

> ⚠️ **§11~12 의 "markdown 단일 문자열 wire / markdown→ExamDocument 어댑터" 는 대체됨.**
> 구현이 **옵션 B(네이티브 typed-block)** 으로 진화했다. 이 §13 이 *현재 진실*이며 다른
> 컴퓨터에서 이어 작업할 때의 진입점이다. (§11~12 는 역사적 맥락으로 보존.)

### 13-1. 무엇이 바뀌었나 — 옵션 B

OCR 이 한 문항을 **markdown 문자열**이 아니라 **네이티브 typed-block 배열**(`contents`/
`choices`/`subQuestions`)로 emit 한다. 블록이 정전(canonical), markdown `text` 는
`blocksToMarkdown` 으로 *파생*(기존 렌더·해설·변형·인쇄 무변경). 이유: markdown 사후 분해는
lossy(본문 속 맨숫자를 equation 으로 못 살림) → testchange HWP 와 어긋남.

- 타입/모델: `src/types/ocrBlocks.ts`(`ContentBlock`/`ChoiceGroup`/`SubQuestion`), `src/stores/
  wizardStore.ts`(`OCRProblem.blocks`/`choiceGroups`/`subQuestions`).
- 정규화/파생: `src/services/ai/ocr.ts` `normalizeResponse`(블록 빌드) → `blocksToMarkdown`.
- DB 영속: `ocr_problems` 의 `blocks`/`choice_groups`/`sub_questions` JSONB (graceful fallback).

### 13-2. wire 계약 (현행) + 커넥터 native passthrough

- **wire**: `hwpConnector.ts` 가 `OCRProblem.blocks`(네이티브) + `figures`(노트 치환, D8) +
  `subQuestions`(D3) + `number`(인쇄번호, D10) 를 그대로 실어보낸다. POST
  `http://127.0.0.1:8765/convert-json` (§12-1 헤더 동일).
- **커넥터**: `F:\시험지변환기\server\adapter.py` `_adapt_native_problem` = **pass-through**.
  네이티브 블록을 markdown 재분해 없이 `parse_ocr_response → _parse_question` 에 넘김 →
  content_parser 전체 파이프라인 재실행 → `HwpComWriter`. 소문항도 재귀 passthrough.
- 엔진 선택: `start-connector.bat`=hwpx(평문박스) / `start-connector-hwp.bat`=hwp COM(테두리
  박스 + 그림멘트 가운데). testchange 레퍼런스가 COM 이면 **반드시 COM 으로 재내보내** 비교.

### 13-3. content_parser 웹 이식 (이번 작업 — 커밋 `543b827`)

**문제**: 커넥터는 네이티브 블록에 content_parser 를 재실행(정규화)하는데, 웹은
`blocksToMarkdown` 직렬화만 해 어긋났다(쪼개진 수식 `$x$=$-2y+3$`, 멀티블록 보기 박스 미완).

**해결**: testchange `content_parser.py` 의 display-영향 정규화를 `src/services/ai/
contentParser.ts`(신규)로 이식 → `blocksToMarkdown` 이 파생 시점에 적용. **저장 블록·wire 는
네이티브 그대로**(커넥터 단독 재정규화 → 이중정규화 0). 상세 함정 카탈로그 = **CLAUDE.md §35**.

- 이식: `_finalize_contents` 값 체인 15 + 박스경계(`rawBoxEnd`/`trailingQuestionSplit`/
  `dropDuplicateBoxFragments`) + box_member 그룹핑 + `_parse_choice` 체인 + 경량 per-block.
- 제외: forward-split(모델이 이미 typed-block 분리). feasibility essential set 밖.
- **검증**: golden-file 하니스 `scripts/contentParserGolden*` — Python 원본 vs TS 포팅본 블록
  **byte 동치 25/25**. 재실행: `npx tsx scripts/contentParserGoldenHarness.mts`(testchange
  불필요, 커밋된 baseline 대조). baseline 재생성: `TESTCHANGE_DIR` 설정 후
  `python scripts/contentParserGolden.py`.

### 13-4. 다른 컴퓨터에서 이어가기 (셋업 + 컨텍스트)

1. **체크아웃**: `BIGSHOL/Math-Gen`(이 repo) + `BIGSHOL/testchange`(커넥터·content_parser
   원본, golden baseline 재생성용 — TS 회귀만이면 불필요).
2. **읽을 순서**: CLAUDE.md §35(content_parser 이식) → §32(공용 hook drift) → §30(함정 전염)
   → 이 §13 → 메모리(있으면). 옵션 B 전반은 `git log` 의 `feat(hwp)`/`feat(db)`/`feat(ocr)`
   커밋 + 메모리 `project-option-b`.
3. **검증 명령**: `npx tsc --noEmit`(exit 0) · `npx tsx scripts/contentParserGoldenHarness.mts`
   (25/25) · `npm run build`. dev: `npm run dev`(포트 자동, §18-1) — **AI 경로는 dev 에서 키
   미노출(§24-7)**, 실제 OCR 검증은 Vercel preview 또는 키 명시.
4. **HWP E2E**: testchange 에서 `start-connector-hwp.bat`(COM) 띄우고 Math-Gen 에서 내보내기.
   ⚠️ **현재 testchange `server/`·런처가 미커밋이라(§13-5) HWP E2E 는 이 머신 한정** — 다른
   컴퓨터에서 재현하려면 먼저 testchange 에 커넥터 스택을 커밋·push 해야 한다.

### 13-5. 남은 작업 (사용자 액션 + 후속)

- 🚨 **Supabase ALTER**(미실행 시): `ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS
  sub_questions JSONB;`(+ 이전 blocks/choice_groups/score/label_type). **미실행이어도
  `src/services/api/problems.ts` 의 graceful fallback(OPTIONAL_COLUMNS + PGRST204 retry)으로
  웹앱은 정상 동작** — 블록은 sessionStorage 한정 영속. *DB 영속이 필요할 때만* 실행(blocker 아님).
- 🚨 **testchange repo `server/` 전체 + 런처 커밋**(사용자) — 이 머신 작업트리에만 존재
  (`server/adapter.py`·`connector.py`·`convert_cli.py` + `start-connector.bat`/
  `start-connector-hwp.bat` 모두 **untracked**, 어느 커밋·원격에도 없음). **testchange 에
  커밋·push 해야** 다른 컴퓨터 fresh clone 에서 §13-2 native passthrough / §13-4 HWP E2E 가
  재현된다. (adapter.py 의 D3 sub_questions 재귀 passthrough 포함.)
- **실 시험지 E2E 비교**(사용자): OCR 재인식 후 웹 미리보기 ↔ HWP(COM) spot — 쪼개진 수식 /
  보기 박스 미완 해소 확인.
- 후속(선택): forward-split 추가 이식(모델 계약 위반 대비 — golden 하니스로 안전), 변형
  기능 부활(CLAUDE.md §33), DOCX 내보내기.
