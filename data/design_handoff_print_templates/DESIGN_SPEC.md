# 인쇄 템플릿 6종 — 디자인 명세 (구현용)

> 코드 없이 **디자인 사양만** 전달. Claude Code 등으로 구현 시 이 문서 + `reference/인쇄 템플릿 시안.html` 만 있으면 픽셀 단위 재현 가능.

---

## 0. 전체 공통

### 0.1 페이지 사이즈
- **A4 portrait**: 210mm × 297mm
- CSS 96 dpi 기준 픽셀: **794 × 1123 px**
- 인쇄 시 `@media print` 에서 실제 mm 단위 보존, 미리보기는 scale transform 으로 축소

### 0.2 컬럼 시스템
- 모든 템플릿이 `columns: 1 | 2` 토글 지원
- **1단**: `flex column + gap: 16~18px` (gap은 템플릿마다 명시)
- **2단**: CSS `column-count` 사용 안 함 → React children 절반 분할 후 좌우 grid 컬럼 + 각 컬럼 flex column + 같은 gap. **이유**: `column-fill: balance` 로는 본문이 종이 끝까지 안 차서 부자연스러움
- 가운데 column rule: 1px (템플릿별 색 다름, 기본 `#E8E8EB`)

### 0.3 빈 공간 처리 원칙
- **vertical justification 안 함** (`justify-content: space-between` 사용 금지)
- 페이지가 안 차면 그대로 비워둠 — `paginateProblems` 알고리즘이 다음 페이지로 넘김
- **풀이공간 있는 템플릿** (T4·T5)만 예외: 카드에 `flex: 1` 로 페이지 가득 채움 → 풀이공간이 자동 확장

### 0.4 문항 break
- 모든 문항 카드: `break-inside: avoid` + `print-break-inside-avoid` 클래스
- 한 문항이 컬럼·페이지 경계를 넘어가지 않음

### 0.5 색 토큰 (전체 공통)

| 토큰 | hex | 용도 |
|---|---|---|
| `ink` | `#0E0E10` | 본문·강조 |
| `ink90` | `#1F1F23` | 본문 보조 |
| `ink70` | `#3A3A40` | 메타·라벨 진한 회색 |
| `ink50` | `#6B6B72` | 메타·라벨 중간 회색 |
| `ink30` | `#A0A0A8` | 비활성·옅은 회색 |
| `ink15` | `#D4D4D8` | 보더 진함 |
| `ink08` | `#E8E8EB` | 보더 옅음·구분선 |
| `ink04` | `#F4F4F6` | 셀 배경 |
| `paper` | `#FFFFFF` | 종이 배경 (기본) |
| `paperWarm` | `#FCFCF8` | 종이 누런 톤 (T5 자습만) |
| `accentNavy` | `#1B2A4E` | T3 모던 |
| `accentRed` | `#8B1A1A` | T4 워크북 |
| `accentGold` | `#A57F00` | T5 자습 |
| `accentSlate` | `#475569` | T6 유형 |

**모든 색은 흑백 inkjet 인쇄 호환** — accent 색도 톤이 어두워 흑백에서 진한 회색으로 자연 변환.

### 0.6 폰트

| 패밀리 | CSS stack | 용도 |
|---|---|---|
| `serifKR` | `"KoPubBatang", "Nanum Myeongjo", "Noto Serif KR", "Batang", serif` | 본문·문항 (한국 시험지 톤) |
| `sansKR` | `Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif` | 헤더·라벨·메타 |
| `mono` | `"JetBrains Mono", "D2Coding", monospace` | 페이지 번호·숫자·코드 |

수식은 KaTeX 기본 폰트 (`KaTeX_Main`).

### 0.7 보기(5지선다) 표기
- 마커: `①②③④⑤` (한국식 동그라미 숫자)
- 기본 5-column grid (`grid-template-columns: repeat(5, 1fr)`)
- 보기 텍스트 25자 초과 시 자동 2-column or 1-column으로 축소
- gap: `6px 16px` (row gap × col gap)
- font-family 본문과 동일 (`serifKR`)

### 0.8 점수 표기
- 형태: `[3점]` 대괄호 (한국 평가원 양식)
- 위치: 문항 우측 상단 (`marginLeft: 6px`)
- font: `serifKR`, size 11px, color `ink70`

---

## 1. T1 — 평가원 정밀형 (`pyeongga`)

### 1.1 사용 컨텍스트
수능·모의평가 양식 99% 클론. 평가원 발행 시험지 톤 재현.

### 1.2 페이지 레이아웃
- **Padding**: top 42px / right 56px / bottom 12px / left 56px (헤더는 자체 padding, 본문/푸터 각자 처리)
- **컬럼 기본값**: 2단
- **흐름**: 외곽 헤더 박스 → 안내 줄 → 본문 (2단) → 푸터 라인

### 1.3 첫 페이지 헤더
- **영역 박스**: width 100% × height 56px, border `2.5px solid ink`
  - 좌측 70%: "수학 영역" — 26px, weight 800, letter-spacing 0.18em, 명조체, 중앙 정렬
  - 우측 124px: "제 1 교시" — 14px, weight 700, letter-spacing 0.08em, 명조체
  - 좌우 분할선 `2.5px solid ink`
- **헤더 박스와 안내 줄 사이 margin**: 22px
- **안내 줄** (헤더 박스 아래):
  - 좌측: `[홀]` 박스 (24×16px, 1.5px border, 10px font, weight 700) + "5지 선다형" (11.5px, weight 600, ink70)
  - 우측: "● 다음 물음에 답하시오." (11.5px, weight 600, ink70)

### 1.4 2페이지 이후 헤더 (간소)
- 좌측: "수학 영역" (11px, weight 600, ink50)
- 우측: 페이지 번호 (mono, 11px)
- 색: `ink50`
- padding: top 20px / horizontal 56px / bottom 8px

### 1.5 본문
- font-size: 13.2px
- line-height: 1.75
- 문항 사이 gap: 16px
- padding: 0 56px / bottom 30px

### 1.6 문항 번호
- 본문 글자와 같은 명조체, weight 800, size 14px
- 형태: `1.` (마침표만)
- margin-right: 6px

### 1.7 푸터
- 위치: bottom 12px, horizontal 56px
- border-top: `1px solid ink` (페이지 폭 전체)
- padding-top: 6px
- 좌: "수학 영역" (11px, weight 700)
- 우: 페이지 번호 (mono, 11px, weight 700)

---

## 2. T2 — 정통 내신형 (`jeongtong`)

### 2.1 사용 컨텍스트
한국 학교에서 가장 흔한 시험지 양식. 학교명·과목·시간·감독·학생정보가 박스 테이블로.

### 2.2 페이지 레이아웃
- **Padding**: 40px 50px 24px
- **컬럼 기본값**: 1단
- **흐름**: 시험 정보 표 → 학생정보+점수 표 → 유의사항 박스 → 본문 → 푸터

### 2.3 시험 정보 표 (첫 페이지)
- 외곽: border `2.5px solid ink`
- 내부 셀: border `1px solid ink`
- font-family: `serifKR`, font-size: 12px
- **1행 (전체 합침)**: 시험 타이틀
  - height 38px, padding 6px 12px
  - font-size 22px, weight 800, letter-spacing 0.12em
  - 중앙 정렬
  - 행 아래 border `1.5px solid ink`
- **2행**: 학교 / 학년 / 과목 (height 32px)
  - 라벨: 학 교(width 80) / 학 년(60) / 과 목(70)
  - 값 셀 텍스트는 중앙 정렬
- **3행**: 일시 / 시간 / 출제 (height 32px, 동일 라벨 width)

### 2.4 라벨 셀 스타일
- background: `ink04`
- font-weight: 700
- text-align: center
- padding: 6px 10px
- border: `1px solid ink`

### 2.5 값 셀 스타일
- background: white
- text-align: center
- padding: 6px 10px
- border: `1px solid ink`

### 2.6 학생 정보 + 점수 표 (시험 정보 표 아래 8px gap)
- display: flex, gap 8px
- 좌측 (flex 1): 학년 / 반 / 번호 / 이름 표
  - 외곽 `2px solid ink`
  - 각 라벨 셀 width 45px
  - 각 값 셀 width 55px (마지막 이름 값은 남는 공간 전부)
  - height 34px
- 우측 (width 140): 점수 표
  - 외곽 `2px solid ink`
  - 라벨 "점 수" (width 58, background `ink04`)
  - 값 (남는 공간, 우측 정렬, padding-right 10, weight 700, "/100" 텍스트 `ink30`)

### 2.7 유의사항 박스 (학생정보 아래 10px margin)
- border: `1px solid ink70`
- padding: 8px 12px
- font-size: 10.5px
- line-height: 1.55
- color: `ink70`
- 내용: "※ 답안은 OMR 카드에 컴퓨터용 사인펜으로 표기하시오. 한 문항에 두 개 이상 표기한 경우 0점 처리합니다."

### 2.8 본문 (유의사항 아래 18px margin)
- font-size: 13.5px
- line-height: 1.8
- font-family: `serifKR`
- 문항 사이 gap: 18px
- margin-bottom: 8px (푸터 위 공간)

### 2.9 문항 번호 & 점수
- 번호: 명조체, weight 800, size 14px, `1.` 형식
- 점수: `[3점]` 우측 끝 (flex 1 spacer)
- 같은 baseline, marginBottom 4px

### 2.10 푸터
- 중앙 정렬
- 형태: `- {page} -` (대시 + 페이지 번호 + 대시)
- font-size 11px, weight 600, `serifKR`

---

## 3. T3 — 모던 내신형 (`modern`)

### 3.1 사용 컨텍스트
학교명을 sans-serif 큰 헤더로 강조. 학원 마케팅 자료로도 활용 가능.

### 3.2 페이지 레이아웃
- **Padding**: 40px 56px 24px
- **컬럼 기본값**: 1단
- **Accent 색**: `accentNavy` (`#1B2A4E`)
- **흐름**: 헤더 → 학생정보 6-cell → 유의사항 라인 → 구분선 → 본문 → 푸터

### 3.3 헤더 (첫 페이지)
- display: flex, justify-content space-between, align-items flex-end
- padding-bottom: 12px
- border-bottom: `3px solid accent`

**좌측**:
- Eyebrow: "2025 · 1ST SEMESTER · MIDTERM" — 11px, weight 700, `accent`, letter-spacing 0.32em, `sansKR`, marginBottom 4px
- 학교명: 26px, weight 800, `ink`, `sansKR`, letter-spacing -0.02em
  - 학년·과목은 weight 500, `ink50` 로 옅게 inline
- 메타 줄: 12px, `ink70`, `sansKR` — "{날짜} · {교시} · {시간} · {문항수}문항 ({총점}점)"

**우측**: 라벨 박스
- padding: 8px 14px
- border: `2px solid accent`
- color: `accent`
- font: `sansKR`, weight 800, size 14, letter-spacing 0.12em
- 텍스트: "중간고사" / "기말고사" / "평가" (타이틀에서 자동 추출)

### 3.4 학생 정보 6-cell (헤더 아래 18px)
- grid: 5 + 1.2 columns = `repeat(5, 1fr) 1.2fr`
- 외곽 border: `1.5px solid ink30`
- 각 셀 padding: 10px 14px
- 셀 사이 right border: `1px solid ink15`
- 마지막 셀 (점수): background `ink04`
- 각 셀 구조:
  - Eyebrow 라벨: 9.5px, weight 700, letter-spacing 0.1em, `accent`, marginBottom 3px, uppercase ("학년" → "학년" 그대로, "성명" → "성명" 등 — uppercase 변환은 시각적 효과를 위함이나 한글은 변환 무의미하므로 영문 라벨 권장: GRADE/CLASS/NO/NAME/PROCTOR/SCORE)
  - 값: 13px, weight 600
  - 빈 값: `______` 옅은 회색 (`ink15`)

### 3.5 유의사항 라인 (학생정보 아래 14px)
- padding: 8px 0
- font-size: 10.5px
- color: `ink70`
- `sansKR`, letter-spacing 0.02em
- 시작에 `!` (weight 700, `accent`) + 본문 텍스트

### 3.6 구분선 (유의사항 아래)
- height: 1px
- background: `ink08`
- margin-bottom: 20px

### 3.7 본문
- font-size: 13.5px
- line-height: 1.85
- 문항 사이 gap: 16px
- column-gap (2단): 32px

### 3.8 문항 번호
- font-size: 22px, weight 800, color `accent`
- font-family: `sansKR`
- letter-spacing -0.02em
- 형식: `01.` (zero-pad 2자리 + 마침표)
- `font-variant-numeric: tabular-nums`

### 3.9 문항 메타 (번호 옆)
- topic 라벨: 10px, weight 700, `ink50`, `sansKR`, letter-spacing 0.08em, uppercase
- 우측 끝 점수 chip:
  - padding 2px 8px
  - border: `1px solid accent`
  - border-radius: 999px
  - font-size 11px, weight 700, color `accent`
  - `sansKR`
  - 텍스트: "{n}점"

### 3.10 문항 본문
- padding-left: 28px (번호 들여쓰기 보정)

### 3.11 푸터
- 위치: 본문 아래 12px margin
- display: flex, justify-content space-between
- font-size: 10px, `sansKR`, color `ink50`, letter-spacing 0.04em
- 좌: "{학교명} · {학년} {과목}"
- 우: "{page} / {totalPages}" (weight 700, color `accent`)

---

## 4. T4 — 학원 워크북 (`workbook`)

### 4.1 사용 컨텍스트
학원·과외에서 학생에게 배포. 한 문항 옆에 풀이공간(줄 친 빈 칸)이 따라옴. 2단은 풀이공간 제거 컴팩트 모드.

### 4.2 페이지 레이아웃
- **Padding**: 32px 44px 20px
- **컬럼 기본값**: 1단 (풀이공간 포함)
- **Accent 색**: `accentRed` (`#8B1A1A`)
- **흐름**: 학원 헤더 → 단원 배너 (검정 풀폭) → 본문 카드들 → 푸터

### 4.3 학원 헤더 (첫 페이지)
- display: flex, justify-content space-between, align-items center
- margin-bottom: 14px

**좌측**: 학원 로고 + 학원명
- 로고: 36×36 square, background `accent`, color white
  - 텍스트: 학원명 첫 글자 (또는 학원 로고 글리프)
  - `sansKR`, weight 900, size 18, letter-spacing -0.04em
  - 중앙 정렬
- 학원명: `sansKR`, weight 800, size 17, letter-spacing -0.01em
- 영문 부제: `sansKR`, size 10.5, color `ink50`, letter-spacing 0.04em

**우측**: 강의 정보
- `sansKR`, size 11, color `ink70`, right-aligned
- 2줄:
  - "강의 · {강사명} T" (라벨 "강의"는 `ink50`)
  - "일자 · {날짜}" 또는 "주차 · WEEK NN"

### 4.4 단원 배너
- background: `ink` (검정)
- color: white
- padding: 10px 16px
- display: flex, justify-content space-between

**좌측 (flex 1)**:
- 단원 타이틀 (시험지 타이틀과 동일): `sansKR`, weight 800, size 14, letter-spacing -0.01em
- 부제(있으면): `sansKR`, size 11, color `ink30` (검정 배경에서 옅은 회색)

**우측**: 이름·날짜 빈칸
- `sansKR`, size 11
- 형태: `이름 ___________   날짜 ___________` (라벨은 `ink30`)
- gap: 14px

### 4.5 본문 카드
- 단원 배너 아래 16px margin
- 카드 사이 gap: 12px (1단) / 14px (2단)
- **1단 카드**:
  - display: grid, columns `1.3fr 1fr`, gap 16px
  - **`flex: 1`** ← 페이지 안 카드들이 균등 stretch (페이지 가득 채움)
  - border: `1px solid ink15`
  - padding: 12px 14px
  - background: paper
- **2단 카드**:
  - display: block (단순 박스, 풀이공간 없음)
  - 다른 스타일 동일

### 4.6 문항 영역 (카드 안 좌측)
- 헤더 줄 (margin-bottom 6):
  - 번호: 22×22 채워진 검정 사각형 (`accent` 배경, white 글자), weight 700, size 12
  - topic 라벨: `sansKR`, 10px, weight 700, `ink50`, letter-spacing 0.1em, uppercase
  - 우측 끝: `[N점]`
- 본문: `serifKR`, font-size 12.5px (1단) / 11.5px (2단), line-height 1.7

### 4.7 풀이공간 (카드 안 우측, 1단만)
- border-left: `1px dashed ink30`
- padding: 0 6px 0 12px
- background: 가로 줄 (24px 간격) — `linear-gradient(transparent 0px, transparent 23px, ${ink08} 24px)` background-size 100% 24px
- min-height: 100px (실제 카드 stretch로 더 늘어남)
- 라벨 "풀이 SCRATCH":
  - 위치: 절대 위치 top -2px, left 12px
  - background: paper (보더 위에 띄움)
  - padding: 0 6px
  - `sansKR`, 9.5px, weight 700, `accent`, letter-spacing 0.1em

### 4.8 푸터
- margin-top: 10px
- display: flex, justify-content space-between
- font: `sansKR`, 9.5px, color `ink50`
- 좌: "{학원명} · {타이틀}" (+ 2단이면 " · 컴팩트" 추가)
- 우: "page {n}" (weight 700)

---

## 5. T5 — 자습 학습지 (`jaseup`)

### 5.1 사용 컨텍스트
학생 혼자 공부할 때. 개념 박스(상단) + 문제 + 정답기록 + 모눈 풀이공간.

### 5.2 페이지 레이아웃
- **Padding**: 36px 50px 20px
- **종이 배경**: `paperWarm` (`#FCFCF8`) — 살짝 누런 톤
- **컬럼 기본값**: 1단 (모눈 풀이공간 포함)
- **Accent 색**: `accentGold` (`#A57F00`)
- **흐름**: 헤더 → 개념 박스 → 본문 카드들 → 메모 라인 푸터

### 5.3 헤더 (첫 페이지)
- display: flex, justify-content space-between, align-items flex-start
- margin-bottom: 12px

**좌측**:
- Eyebrow: "SELF-STUDY" — `sansKR`, 10px, weight 700, `accent`, letter-spacing 0.3em, marginBottom 4
- 타이틀: `serifKR`, 24px, weight 800, `ink`, letter-spacing -0.01em
- 목표 (있으면): `sansKR`, 11px, `ink70`, marginTop 4 — "오늘의 목표 · {목표 텍스트}"

**우측**:
- 라벨 "학습일": `sansKR`, 9.5px, `ink50`, marginBottom 2
- 날짜 값: `serifKR`, 14px, weight 700

### 5.4 개념 박스 (헤더 아래)
- background: white (paperWarm 위에 흰 박스)
- border: `1px solid accent`
- **border-left: `5px solid accent`** ← 두꺼운 좌측 강조
- padding: 12px 16px
- margin-bottom: 18px

**라벨**: "◆ 핵심 개념 정리"
- `sansKR`, 10.5px, weight 800, `accent`, letter-spacing 0.16em
- marginBottom 6px

**본문**: `serifKR`, 12px, line-height 1.7, `ink90`
- markdown 허용 (수식 KaTeX 인라인 포함)
- 예: "① 이차방정식 $ax^2+bx+c=0$ 의 근의 공식: $x = ...$"

### 5.5 본문 카드
- 카드 사이 gap: 12px (1단) / 16px (2단)
- **1단 카드**:
  - display: grid, columns `1.15fr 1fr`, gap 14px
  - **`flex: 1`** ← 페이지 가득 채움
  - paddingBottom: 14px
  - borderBottom: `1px dashed ink15` (카드 사이 구분)

### 5.6 문항 영역 (좌측)
- 번호 헤더 (margin-bottom 6):
  - "문 {n}" — `serifKR`, weight 800, size 18, `accent`, line-height 1, marginRight 8
  - topic: `sansKR`, 10px, `ink50`, letter-spacing 0.08em — `· {topic}`
- 본문: `serifKR`, 12.5px (1단) / 11.5px (2단), line-height 1.75

### 5.7 정답 기록 칸 (문항 아래)
- marginTop 8px
- padding: 6px 10px
- background: `paperWarm`
- border: `1px solid ink15`
- display: flex, align-items center, gap 8
- `sansKR`, 11px

내부 구조:
- "내 정답" 라벨: weight 700, `accent`
- 빈 줄: flex 1, borderBottom `1px solid ink30`, height 16
- "✓ 채점" 텍스트: 10px, `ink50`
- 채점 체크박스: 16×16 빈 네모, border `1.5px solid ink30`

### 5.8 모눈 풀이공간 (우측, 1단만)
- background: paper + 모눈 패턴
  - `linear-gradient(${ink08} 1px, transparent 1px)` (가로선)
  - `linear-gradient(90deg, ${ink08} 1px, transparent 1px)` (세로선)
  - background-size: 16px 16px
- border: `1px solid ink15`
- min-height: 100px (실제 stretch로 더 늘어남)
- 라벨 "SCRATCH PAD":
  - 위치: 절대 top 6px, right 8px
  - `sansKR`, 9px, `ink30`, letter-spacing 0.12em

### 5.9 푸터 (메모 라인)
- marginTop 10px
- display: flex, align-items center, gap 12px
- `sansKR`, 10px, `ink50`
- 좌: "오늘의 메모" (weight 700, `accent`, letter-spacing 0.12em)
- 중앙: flex 1 빈 줄 (`1px dashed ink30`)
- 우: "p. {n}"

---

## 6. T6 — 유형 훈련지 (`yuhyung`)

### 6.1 사용 컨텍스트
같은 유형 8~16개를 한 페이지에 컴팩트 반복. 2단 기본.

### 6.2 페이지 레이아웃
- **Padding**: 28px 44px 16px
- **컬럼 기본값**: 2단
- **Accent 색**: `accentSlate` (`#475569`)
- **흐름**: 유형 배너 (풀폭 검정) → 핵심 전략 라인 → 본문 → 진도 푸터

### 6.3 유형 배너 (첫 페이지)
- background: `ink` (검정)
- color: white
- padding: 10px 16px
- display: flex, justify-content space-between, align-items center
- marginBottom: 14px

**좌측**: 유형명
- Eyebrow "PATTERN" — `sansKR`, 10px, weight 800, letter-spacing 0.32em, `ink30` (검정 배경의 옅은 회색)
- 유형명 — `sansKR`, 17px, weight 800, letter-spacing -0.01em
  - 형식: "유형 04. {유형 제목}" — 제목 부분만 강조색 (`#FFD53A` 노랑) 가능

**우측**: 문항수 chip
- background: rgba(255,255,255,0.12)
- padding: 4px 10px
- font: `mono`, 12px, weight 700, letter-spacing 0.06em
- 텍스트: "{문항수} 문항" (zero-pad 2자리) + 선택적으로 "· 평균 정답률 NN%"

### 6.4 핵심 전략 라인 (배너 아래)
- display: flex, align-items center, gap 16
- padding: 6px 0
- borderBottom: `1px solid ink15`
- marginBottom: 16px

**구조**:
- 라벨 "핵심 전략" — `sansKR`, 10.5px, weight 700, `accent`, letter-spacing 0.12em
- 전략 텍스트 — `serifKR`, 11.5px, `ink90`
- flex 1 spacer
- 이름·날짜 — `sansKR`, 10px, `ink50` — "이름 ____________ · 날짜 ___________"

### 6.5 본문 (좁은 2단)
- 2단 grid, columnGap: 22px
- columnRule: `1px solid ink08` (가운데 옅은 회색)
- font-size: 12.5px (1단) / 11.5px (2단)
- line-height: 1.65
- 문항 사이 gap: 14px (1단) / 16px (2단)

### 6.6 문항 번호
- 외곽선 박스 — `inline-grid`, `place-items: center`, 22×22, `1.5px solid accent`
- color: `accent`
- weight 700, size 12
- marginRight 6, vertical-align middle

### 6.7 문항 메타 (번호 옆)
- topic 라벨: `sansKR`, 9px, `ink50`, letter-spacing 0.08em

### 6.8 푸터 (진도 바)
- marginTop 8px
- display: flex, align-items center, gap 12
- `sansKR`, 9.5px, `ink50`

**구조**:
- 라벨 "PROGRESS" — weight 700, `accent`, letter-spacing 0.1em
- 진도 바: flex 1, height 3px, background `ink08`
  - 채워진 바: width `{진행률}%`, background `accent`
- 진행 표시: `mono`, weight 700, `ink` — "PG · {page}"

---

## 7. 답안지·해설지 (별도 페이지, 모든 템플릿 공통 적용 권장)

### 7.1 정답지 (빠른 정답)
- 별도 A4 페이지, 시험지 끝에 첨부
- 헤더: "정답" (28px, weight 800, `serifKR`, 중앙)
- 본문: CSS columns 2단 자동 흐름
- 각 entry: "{번호}. {정답}" — 형식: 번호는 weight 800, 정답은 weight 600
- 객관식 정답: `①②③④⑤` 표기
- 주관식: 텍스트 그대로

### 7.2 해설지 (옵션)
- 별도 A4 페이지, 정답지 뒤
- 헤더: "해설" (28px, weight 800)
- 각 문항:
  - "{번호}. {topic}" (h3)
  - 풀이 본문 (markdown + KaTeX)
  - "정답: {답}" (강조)
- 문항 사이 padding 18px, border-bottom dashed

---

## 8. 페이지 분할 (paginate) 알고리즘

### 8.1 한 페이지에 들어가는 문항 수 추정
- 페이지 가용 본문 높이 = 1123px - (헤더 높이 + 푸터 높이 + padding top/bottom)
- 각 문항 추정 높이:
  - 본문 줄 수 × line-height (≈ 24px/line for 13.5 font)
  - + 보기 row 수 × choice row height (≈ 28px)
  - + 도형 영역 (있으면 ~120px)
  - + 풀이공간 (T4·T5 1단: stretch라 추정 안 함)
- **2단**: 좌우 컬럼 각각 가용 높이의 절반

### 8.2 풀이공간 있는 템플릿 (T4·T5 1단)
- 페이지당 문항 수를 별도 휴리스틱으로 결정
- 권장: 3~4개 카드 (각 카드 높이 ≈ 가용 / 카드수)
- `flex: 1` 로 stretch → 풀이공간 자동 확장

### 8.3 break-inside 보장
- 모든 문항 카드: `break-inside: avoid` + `page-break-inside: avoid`
- 한 문항이 한 페이지 가용보다 크면? → 자체 페이지 단독 배치

---

## 9. 인쇄·PDF 출력 동작

### 9.1 미리보기 ↔ 인쇄 동일 DOM
- 같은 React 트리가 미리보기 + 인쇄 + PDF 캡처 모두에 쓰임
- 미리보기는 `transform: scale(N)` 으로 축소
- 실제 페이지 크기 (210mm × 297mm) 는 보존

### 9.2 페이지 분할 마커
- 각 A4 페이지 컨테이너에 `data-print-page="true"`
- `@media print` 의 `[data-print-page] { page-break-after: always }` (마지막 페이지 제외)

### 9.3 색상 보정
- 모든 색 element 에 `WebkitPrintColorAdjust: "exact"` (또는 `print-color-adjust: exact`)
- 브라우저 기본의 "잉크 절약" 모드에서도 디자인 색 유지

### 9.4 폰트 임베드
- `@font-face` 로 사용 폰트 모두 로드
- 인쇄 전 폰트 로드 대기 (`document.fonts.ready`)

---

## 10. PrintOptions UI 사양 (사용자가 조정하는 옵션 패널)

### 10.1 출력 대상
3-way radio:
- 변형만 (sparkle 아이콘)
- 원본만 (scan 아이콘)
- 원본+변형 (rows 아이콘) ← 이 모드는 columns 자동 1단 강제

### 10.2 템플릿 선택
2×3 grid 또는 list:
- 평가원형 — pyeongga
- 정통 내신 — jeongtong
- 모던 내신 — modern
- 학원 워크북 — workbook
- 자습 학습지 — jaseup
- 유형 훈련지 — yuhyung

### 10.3 강조 색상
8개 swatch (7×7 원형):
- 사이언 #0EA5E9
- 파랑 #135BEC
- 보라 #8B5CF6
- 핑크 #EC4899
- 주황 #F97316
- 노랑 #EAB308
- 초록 #10B981
- 회색 #64748B

### 10.4 문항 분할
2-way segmented:
- 1단 (rectangle 아이콘)
- 2단 (columns 아이콘)
- "원본+변형" 모드에서는 2단 비활성

### 10.5 세로 여백 슬라이더
- 범위: 0 ~ 150 px, step 2
- 기본: 18px
- 라벨: "세로 여백 ({값}px)"
- 문항 사이 gap 에 적용

### 10.6 표시 옵션 토글 (3개)
- 날짜 표시
- 문항 단원명 (showChapter)
- 난이도 라벨 (showDifficulty)

### 10.7 정답·해설 토글 (2개)
- 정답·해설 페이지 포함 (showAnswers)
  - 켜지면 하위 토글: 빠른 정답만 (quickAnswerOnly, 해설 생략)

### 10.8 기본값으로 재설정 버튼

---

## 11. 추가 결정 필요 사항

1. **jaseup의 `conceptNote`·`todayGoal` 데이터 출처**:
   - 사용자 수동 입력? AI 자동 생성? 단원별 사전 정의 라이브러리?
2. **workbook 의 학원 정보**:
   - PrintOptions 에 `academyName` / `instructorName` / `logoUrl` 필드 추가
3. **yuhyung 의 유형명**:
   - 자동 추출? (문항들의 공통 topic) 수동 입력?
4. **template 별 페이지당 문항 수 권장값**:
   - paginate 알고리즘에 template별 휴리스틱 추가
5. **답안지·해설지의 템플릿별 디자인 통일 vs 분화**:
   - 권장: 공통 1개 디자인. accent 색만 메인 템플릿에서 상속.

---

## 12. 참고 시안

`reference/인쇄 템플릿 시안.html` 을 브라우저로 직접 열어 디자인 캔버스에서 12개 변형 (6 템플릿 × 1단/2단) 확인 가능.

소스 JSX:
- `reference/templates/primitives.jsx` — 공용 (KP 토큰, A4Page, Body, Formula, Choices, PROBLEMS_KR, Q, Points)
- `reference/templates/T1-pyeongga.jsx`
- `reference/templates/T2-jeongtong.jsx`
- `reference/templates/T3-modern.jsx`
- `reference/templates/T4-workbook.jsx`
- `reference/templates/T5-jaseup.jsx`
- `reference/templates/T6-yuhyung.jsx`

---

생성: 2026-05-26
