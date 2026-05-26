# 인쇄 템플릿 6종 핸드오프 패키지

> `BIGSHOL/Math-Gen` 레포의 기존 4개 템플릿(`exam` / `default` / `minimal` / `classic`)을 **학교 내신 중심 6개 신규 템플릿**으로 교체하기 위한 디자인 + 코드 패키지.

---

## 1. 개요

| 신규 ID | 한글명 | 사용처 | 1단/2단 |
|---|---|---|---|
| `pyeongga` | 평가원 정밀형 | 수능·모의평가 클론 | 2단 기본 |
| `jeongtong` | 정통 내신형 | 학교 시험지 표 양식 | 1단 기본 |
| `modern` | 모던 내신형 | 학교 마케팅·세련 | 1단 기본 |
| `workbook` | 학원 워크북 | 풀이공간 포함 | 1단 (풀이공간 우측) / 2단 (컴팩트) |
| `jaseup` | 자습 학습지 | 개념박스 + 모눈 | 1단 (모눈 풀이공간) / 2단 (컴팩트) |
| `yuhyung` | 유형 훈련지 | 같은 유형 반복 | 2단 기본 |

**핵심 결정사항:**
- 모든 템플릿이 `columns: 1 | 2` 변환 가능
- 풀이공간 있는 템플릿(`workbook` / `jaseup`)은 1단일 때 카드가 `flex: 1`로 stretch → 풀이공간이 자동 확장
- 풀이공간 없는 템플릿은 일정 gap으로 자연 배치, 빈 공간은 그대로 (`paginateProblems` 알고리즘이 페이지 분할 처리)
- 색상: 흑백 인쇄 호환 안전 톤만 + 옅은 accent 한 가지

---

## 2. 디자인 결정의 배경

### 2.1 왜 기존 4개를 폐기?
기존 `exam` / `default` / `minimal` / `classic`은 **헤더 + 문항번호 스타일만 다른 스킨**이었음. 본문 layout · 사용처 컨텍스트 · 풀이공간 등 진짜 차이가 없었음.

### 2.2 한국 학교 내신 우선
- 평가원(`pyeongga`): 수능·모의평가 정밀 클론
- 학교 내신(`jeongtong` / `modern`): 정통 표 양식 + 살짝 모던
- 학원·자습(`workbook` / `jaseup`): 풀이공간 포함
- 반복 훈련(`yuhyung`): 같은 유형 모음

### 2.3 vertical justification 거부
초기에 `flex space-between`으로 본문 빈 공간을 문항 사이로 펼치는 안을 시도했으나, **실제 한국 문제집은 문항 사이 gap이 일정하고 페이지가 남으면 그냥 비워둠** (다음 페이지로 넘김). 자연스러운 동작으로 복귀.

---

## 3. 파일 구조

```
design_handoff_print_templates/
├── README.md                        ← (you are here)
├── reference/                       ← 참고용 HTML 시안 (원본)
│   ├── 인쇄 템플릿 시안.html
│   └── templates/
│       ├── primitives.jsx
│       ├── T1-pyeongga.jsx
│       ├── T2-jeongtong.jsx
│       ├── T3-modern.jsx
│       ├── T4-workbook.jsx
│       ├── T5-jaseup.jsx
│       └── T6-yuhyung.jsx
└── src/                             ← BIGSHOL/Math-Gen의 src/components/print/ 에 통합
    ├── PrintTemplate.types.ts       ← PrintTemplate union + PaperTokens
    ├── paperTokens.ts               ← 색상·폰트·사이즈 상수
    ├── BodyContainer.tsx            ← 1단/2단 본문 컨테이너 (flex 분할)
    ├── ProblemMeta.tsx              ← 번호·점수·단원 메타 라인
    └── templates/
        ├── PyeonggaTemplate.tsx
        ├── JeongtongTemplate.tsx
        ├── ModernTemplate.tsx
        ├── WorkbookTemplate.tsx
        ├── JaseupTemplate.tsx
        └── YuhyungTemplate.tsx
```

---

## 4. 통합 가이드 (BIGSHOL/Math-Gen 에 적용)

### 4.1 `wizardStore.ts` 수정
```ts
// 기존
export type PrintTemplate = "exam" | "default" | "minimal" | "classic";

// 변경 후
export type PrintTemplate =
  | "pyeongga"   // 평가원 정밀형
  | "jeongtong"  // 정통 내신형
  | "modern"     // 모던 내신형
  | "workbook"   // 학원 워크북
  | "jaseup"     // 자습 학습지
  | "yuhyung";   // 유형 훈련지
```

### 4.2 `PrintOptionsPanel.tsx` 수정
`TEMPLATE_OPTIONS` 배열을 6개로 교체:
```ts
const TEMPLATE_OPTIONS: Array<{ value: PrintTemplate; label: string; desc?: string }> = [
  { value: "pyeongga",  label: "평가원형",   desc: "수능·모평 클론" },
  { value: "jeongtong", label: "정통 내신",  desc: "학교 시험지 표" },
  { value: "modern",    label: "모던 내신",  desc: "학교 마케팅" },
  { value: "workbook",  label: "학원 워크북", desc: "풀이공간 포함" },
  { value: "jaseup",    label: "자습 학습지", desc: "개념박스+모눈" },
  { value: "yuhyung",   label: "유형 훈련지", desc: "반복 컴팩트" },
];
```

### 4.3 `PrintableHeader.tsx` 폐기
6개 템플릿은 각자 헤더 디자인을 자체 컴포넌트에 포함하므로 `PrintableHeader.tsx` 의 4개 variant 함수(`ExamHeader` / `DefaultHeader` / `MinimalHeader` / `ClassicHeader`)는 폐기. 대신 각 템플릿 컴포넌트가 헤더+본문을 통째로 렌더.

다만 2페이지 이후의 간소한 헤더(`HEADER_HEIGHT_OTHER = 28`)는 유지하거나 각 템플릿이 자체적으로 가짐.

### 4.4 `PrintQuestionBlock.tsx` 폐기
신규 템플릿들은 각자의 카드 스타일 (예: `WorkbookTemplate`의 풀이공간 grid, `JaseupTemplate`의 모눈 풀이공간 등)을 가지므로 단일 `PrintQuestionBlock`으로 통합 불가. 각 템플릿 컴포넌트가 직접 문항 렌더.

공통 로직(KaTeX 렌더, choices grid, diagram SVG 등)은 `ProblemBody.tsx` 같은 신규 공통 컴포넌트로 추출 권장.

### 4.5 `printLayout.ts` 의 `paginateProblems` 적용
기존 알고리즘 그대로 사용 가능. 단:
- `workbook` / `jaseup` 1단 모드는 페이지당 문항 수가 카드 stretch 때문에 다른 템플릿보다 적음 (3~4개)
- `paginateProblems` 에 `template` 별 `PAGE_CONTENT_HEIGHT` overrride 또는 `estimateProblemHeight` 에 `template === "workbook" && columns === 1` 분기 추가 필요

### 4.6 PDF 내보내기 (`pdfExporter.ts`)
변경 불필요. 신규 템플릿들도 `[data-print-page]` attribute 와 `print-break-inside-avoid` 클래스 패턴을 유지함.

---

## 5. 한국식 문제집 정렬 원칙

코드에 반영된 원칙들:

1. **`break-inside: avoid`** — 한 문항이 컬럼·페이지 경계 안 넘어감
2. **일정 gap** — 문항 사이 spacing은 모든 페이지에서 동일 (16~18px)
3. **풀이공간 stretch** — 풀이공간 있는 템플릿은 카드 `flex: 1` 로 페이지 가득 채움
4. **빈공간 유지** — 페이지가 안 가득 차면 그대로 비워두고 다음 페이지로 (vertical justification 안 함)
5. **흑백 인쇄 호환** — 색 사용 최소화, 폰트는 명조(`KoPubBatang` 우선) + 영문은 sans
6. **A4 96dpi 794×1123 px** — `A4_WIDTH_PX` / `A4_HEIGHT_PX` 와 일치

---

## 6. 폰트

```css
/* 권장 import (이미 BIGSHOL/Math-Gen 에 있음) */
Pretendard Variable
Noto Serif KR (또는 KoPubBatang)
JetBrains Mono
```

페이지 시그니처 패밀리:
- **본문 (서술형)**: `serifKR` — `"KoPubBatang", "Nanum Myeongjo", "Noto Serif KR", "Batang", serif`
- **헤더·메타·라벨**: `sansKR` — `Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`
- **숫자·코드·페이지번호**: `mono` — `"JetBrains Mono", "D2Coding", monospace`

---

## 7. 다음 작업

1. **데이터 매핑 결정**: `JaseupTemplate` 의 "오늘의 목표 / 핵심 개념 정리" 같은 컨텐츠는 어디서 옴? (사용자 입력? AI 자동 생성? 단원별 사전 정의?)
2. **워크북 브랜드 커스터마이즈**: `WorkbookTemplate` 의 학원 로고 / 학원명을 사용자가 입력하도록 `PrintOptions` 에 필드 추가
3. **paginate 알고리즘 보강**: `workbook` / `jaseup` 1단 모드의 페이지당 문항 수 휴리스틱
4. **답안지·해설지 디자인**: 6개 템플릿 각각에 어울리는 정답지 디자인 (또는 공통 1개)
5. **인쇄 미리보기 zoom UI** 유지 (`ZoomToolbar.tsx`)

---

생성: 2026-05-26
