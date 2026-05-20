# Handoff: MathGen 변환 (수학 기출지 변환기)

> 한국 수능·모의평가 기출지를 PDF/이미지로 업로드 → OCR로 디지털화 → AI로 유사 문제·변형 시험지 일괄 생성 → 인쇄용 PDF·HWP·온라인 시험지로 내보내는 SaaS 도구의 hi-fi 디자인 핸드오프.

---

## 1. Overview

이 패키지는 **MathGen 변환** 서비스의 디자인 명세입니다. 교사·학원 강사가 기존 시험지(스캔본)를 업로드하면 AI가 모든 문항을 디지털화하고, 변형 시험지를 일괄 생성해 주는 도구입니다.

**핵심 사용자 시나리오 (교사):**
1. 라이브러리에서 기존 시험지 카드 클릭
2. 상세 페이지에서 메타데이터·문항 미리보기 확인
3. "변형 만들기" 모달에서 변형 강도·시험지 수·옵션 선택
4. **5단계 Wizard** 진입:
   - Step 1: 업로드 (드래그&드롭 / 파일 선택)
   - Step 2: OCR 결과 검토 (원본 ↔ 디지털화 결과)
   - Step 3: 변형 옵션 (목표·난이도·부가 자료) + 실시간 미리보기
   - Step 4: 문항별 검토 (30문항 그리드, 원본 vs 변환 비교)
   - Step 5: 내보내기 (PDF/HWP/Word/Online + 함께 내보낼 자료 선택)
5. 라이브러리로 복귀, 변형본 카드 추가됨

---

## 2. About the Design Files

이 패키지의 HTML 파일들은 **디자인 레퍼런스**입니다 — 의도된 외관·동작을 보여주는 프로토타입이지, 그대로 복사해서 프로덕션에 쓸 코드가 아닙니다.

작업할 것은 **이 HTML 디자인을 타깃 코드베이스의 기존 환경(React, Vue, SwiftUI, native 등)에서 그 코드베이스의 패턴·라이브러리로 재구현**하는 것입니다. 만약 환경이 아직 없다면, 프로젝트에 맞는 프레임워크를 선택해서 구현하세요. (참고: 원본 레포가 React + Vite + Tailwind입니다 — `https://github.com/BIGSHOL/Math-Gen`)

---

## 3. Fidelity

**High-fidelity (hifi)** — 픽셀 단위 mockup. 색·타이포·여백·인터랙션 모두 final.

- 모든 색은 hex value 명시 (섹션 8 참조)
- 폰트: Pretendard Variable + JetBrains Mono (수식·숫자)
- 수식은 KaTeX로 실제 렌더링
- 그래프·도형은 SVG로 실제 렌더링
- 아이콘은 Phosphor Icons (4가지 weight: regular/bold/fill/duotone)
- 모든 마이크로 인터랙션(hover, focus, press, transitions)이 정의됨

---

## 4. Screens & Views

### 4.1 Library (보관함)

**Purpose:** 시험지 컬렉션 진입점. 카드 그리드 or 리스트로 시험지 탐색.

**Layout (1280px+ width):**

- TopBar (height 52px, fixed) — 로고 + 탭 nav + 검색바 + 새 변환 버튼 + 아바타
- Sidebar (width 232px, fixed left) — 컬렉션 / 학년 / 태그 / 사용량 카드
- Main (flex 1, padding 28px 36px) — 헤딩 + 통계 strip (4 cards) + 최근 작업 그리드

**Top Bar Components:**
- Logo lockup: `MathGen / 변환` (Pretendard, 14px, 600 weight) + gradient square icon
- Nav tabs: 내 시험지 (active) / 변환 작업 / 단원 자료. Active state = bg `#F4F5F7`, text `#1A1D24`, weight 550
- Search input: width 220px, height 30px, bg `#F4F5F7`, placeholder + `⌘K` kbd hint
- "+ 새 변환" 버튼 = primary accent (sky blue `#0EA5E9`, 14px)
- Avatar (28px circle, gradient red `#FCA5A5` → `#EF4444`, initial "김")

**Sidebar Sections:**
- Eyebrow labels (uppercase, 10.5px, weight 600, color `#6B7280`, letter-spacing 0.06em)
- NavList items: padding 6px 8px, gap 8px, icon + label + count (mono)
- Active item: bg `#F4F5F7`, accent icon color, weight 550
- Usage card (sticky bottom): bg `#F4F5F7`, border, padding 12, lightning icon + 사용량 + Progress bar

**Stats Strip (4 cards):**
Each StatCard: padding 16px, white bg, `1px solid #ECEEF0` border, radius 12px
- Top row: 28px icon square (soft tinted bg) + trend Chip (right)
- Label (11.5px caption)
- Value (26px, mono, -0.02em letter-spacing, 700 weight) + unit (12.5px)
- 4 cards: 변환 완료 1,420 문항 (ok), 변형 시험지 9 개 생성 (accent), 검토 대기 23 문항 (warn), 평균 정답률 78% (ok)

**Test Grid:**
- `grid-template-columns: repeat(auto-fill, minmax(232px, 1fr))`, gap 14
- Card: radius 12px, border `1px solid #ECEEF0`, hover translates Y -1px + shadow s3
- Thumbnail (height 132px, linear gradient surface2→bg): mini paper preview inside + Status Chip (top-right)
- Meta block (padding 12-14): title (14px, 600), bottom row (small, muted): article icon + count + time

**Files referenced:**
- `hifi/library.jsx`

---

### 4.2 Detail (시험지 상세)

**Purpose:** 시험지 메타데이터 · 문항 미리보기 · 변형 만들기 진입점

**Layout:**
- TopBar (52px): ← 보관함 / breadcrumb / status chip / 공유 / PDF / 변형 만들기
- Page thumbnails (left, width 192px, padding 20px 14px)
- Main (flex 1, padding 24px 32px)
- Metadata sidebar (right, width 296px, padding 24px 20px)

**Hero Card (within Main):**
- Padding 24, gap 24px between thumbnail and info
- Thumbnail: 124×158px, white bg, 1px border, padding 10px 14px
- Info: tag chips + title (h1 22px 700) + meta line (body 13.5 muted) + 5-up stat row (max-content grid, 28px gap)
- Stats use mono font, 22px bold

**Tab Bar:**
- 문항 / 해설 / 통계 / 변형 이력
- Active = 600 weight, bottom border 2px solid ink
- Each tab: icon + label + count Chip

**Problems Tab:**
- 2-column grid (1fr 1fr), gap 14
- Each ProblemCard: padding 18, top row = number badge (26px square ink bg) + topic Chip + diff/points (muted small, marginLeft auto)
- Problem body = `applyType("body")` (13.5px, line-height 1.75)
- KaTeX inline formulas
- Choices = 5-column grid, each = circled number + KaTeX

**CTA Block:**
- Gradient bg (accentSoft → white), accent border, 22px padding
- Left: 40×40 gradient square icon (accent→accentDark) + h2 + body
- Right: "변형 만들기" primary accent lg button

**Right Sidebar:**
- 정보: key-value pairs with icon (small)
- 단원별 분포: progress bars per topic (color-coded ok/accent/warn by accuracy)
- 변형 이력: version cards (10px padding, surface2 bg)

**Files referenced:**
- `hifi/detail.jsx`

---

### 4.3 New Variant Modal

**Purpose:** 변형 시험지 N개 일괄 생성 설정

**Layout:**
- Backdrop: rgba(15,17,23,0.55) + backdrop-filter blur(8px)
- Modal: 980×660 max, radius 16, shadow s4
- Header (18px 22px): gradient icon square + h2 + small subtitle + close X
- Body grid: 1fr 1.3fr split
- Footer (14px 22px): 사용 크레딧 표시 + 취소 / Wizard로 진행

**Left column (padding 22, border-right):**
- ① 원본 선택: Card with PDF icon + title + tags + "다른 시험지 선택" ghost button
- ② 변형 강도: 3 radio cards (숫자만 / 같은 유형 / 새 문제). Selected = accent border + accentSoft bg + accentGlow shadow + radio dot
- ③ 난이도 조정: full-width Segmented (쉽게/유지/어렵게)

**Right column (padding 22, bg `#FAFBFC`):**
- ④ 생성할 시험지 수: 60×60 number tiles (1/2/3/5) + "직접 입력" dashed tile. Selected = accent bg, white text, mono 22px
- ⑤ 미리보기: dynamic grid based on count (1–3), each card shows mini preview with KaTeX
- ⑥ 옵션: Card containing 4 Toggle rows (문항 순서 / 보기 순서 / 풀이 / 배점)

**Files referenced:**
- `hifi/modal.jsx`

---

### 4.4 Wizard (5단계 마법사)

**Shared Layout:**
- TopBar (52px): ← 보관함 + logo + chip + saved indicator + 도움말
- Stepper (padding 18px 56px, surface bg)
- Content (flex 1, slides in/out with animation)
- Footer (height 64): 이전 / step indicator dots / 다음 (kbd hint ↵)

**Stepper component:**
- Horizontal, max-width 920 centered
- Each step: 32px rounded square icon + 2-line text (01 + 업로드)
- Done: ok bg + check icon
- Active: accent bg + accentGlow + filled icon variant + 700 weight title
- Future: surface bg + lineStrong border + 55% opacity
- Lines between: 2px height, ok if past, surface3 otherwise. Transition 280ms.

**Animations:**
- StepFrame: forward `wizSlideInRight` (translateX 40px→0, 300ms cubic-bezier), backward `wizSlideInLeft`
- Footer step dots: width 8→18px when active

**Step 1: Upload** (`hifi/wizard.jsx::WizStep1HF`)
- Max-width 760, centered
- Hero: 56px square gradient icon + display h1 + body subtitle
- Drop zone: 2px dashed border (accent when dragOver), 36px padding, radius 12
  - Inner: 64px circle icon + h2 + small Kbd hint + 2 buttons (accent primary + secondary) + format chips
- On file: Uploaded Card appears (padding 16, fadeIn animation), PDF icon tile + name + progress bar

**Step 2: OCR Review** (`hifi/wizard.jsx::WizStep2HF`)
- 3-pane: thumbnails (92px) / Original Paper (flex 1) / OCR Result (flex 1.1)
- Page thumbs: 64px height, paper-style preview, active = accent border + accentGlow
- Paper Frame: white bg with double-rule header (수학영역 / page #)
- OCR cards: `OCRItem` component
  - Borderbox: warn variant = warn border + warn-soft shadow
  - Header: number badge + status Chip dot + topic Chip + edit ghost
  - Body = real KaTeX rendered problem
  - Hint warning: warnSoft bg, warning icon + text

**Step 3: Options** (`hifi/wizard.jsx::WizStep3HF`)
- Grid 1.15fr 1fr, max-width 1200 centered
- LEFT side:
  - h1 + sub
  - 변환 목표 (4 cards 2x2): icon square 32px + h3 title + small subtitle + corner check when selected
  - 난이도 조정: full-width Segmented (4 options)
  - 함께 만들 자료: Card with 4 Toggle rows (icon + label + hint + toggle)
- RIGHT side:
  - 실시간 미리보기 1번 문항: 2-column split (원본 / 변환), each shows KaTeX problem
  - Info hint chip (warnSoft)
  - 예상 결과 Card: 4 lines of key/value with icons (clock, list, files, lightning)

**Step 4: Per-Problem Review** (`hifi/wizard-steps.jsx::WizStep4HF`)
- Sidebar (248px) + Main (flex 1)
- Sidebar:
  - Header row: "문항 30개" eyebrow + filter Segmented (전체/검토/대기)
  - Number grid (6 col, gap 4): each 30px square, color-coded by status, hidden by filter
  - Legend card: dot + label + count for 확정/검토/대기
  - 단원별 점프: list of topic → range
- Main:
  - Toolbar: ←/→ + N/30 + status chip + topic + diff chips | 코멘트 | 다시생성/직접편집/확정
  - Compare panes (1fr 1fr, gap 14): original (Card pad 20) + new (Card with accent or warn border + glow)
  - Warning callout (warnSoft) inside new pane if status warn
  - Bottom tabs strip: 문제/풀이/해설/이력/메모 + inline content area

**Step 5: Export** (`hifi/wizard-steps.jsx::WizStep5HF`)
- Grid 1fr 1.3fr, max-width 1280 centered
- LEFT:
  - h1 + sub
  - 출력 형식 (2x2 cards): file icon tile + label + subtitle + corner check
  - 함께 내보낼 자료: Card with 4 checkbox rows
  - 파일명 Input (mono, with `.pdf` suffix)
- RIGHT:
  - 미리보기: light gray bg (`#E8EAEF`) box with 2 mini paper previews (220 width, 3/4.2 aspect)
  - Page navigator: 8 small squares
  - 최종 점검 Card: check-circle list (전체 문항 / 검토 / 풀이 / 정답지 / 형식) + Divider + 2 footer buttons

---

## 5. Interactions & Behavior

### 5.1 Navigation
- **Library card click** → Detail (animated screen swap, translateY-8 + scale 0.99 + fade)
- **Detail "변형 만들기"** → Modal opens (backdrop fade + scale 0.96→1)
- **Modal "Wizard로 진행"** → close modal then transition to Wizard
- **Wizard ← 보관함** → back to Library
- **Wizard 다음/이전** → animated step transition (horizontal slide)
- **Step 5 라이브러리로** → finish + Library

### 5.2 Animations
| Element | Property | Duration | Easing |
|---|---|---|---|
| Screen swap | opacity + transform | 320ms | cubic-bezier(.2,.9,.3,1) |
| Modal enter | opacity + transform scale | 220-260ms | cubic-bezier(.2,.9,.3,1.1) |
| Backdrop fade | opacity | 220ms | ease |
| Wizard step | translateX | 300ms | cubic-bezier(.2,.9,.3,1) |
| Card hover | transform Y + shadow | 160ms | ease |
| Button hover | bg + transform | 120ms | ease |
| Toggle | bg + left | 180ms | ease + cubic-bezier(.2,.9,.3,1.1) |
| Progress bar | width | 500-600ms | cubic-bezier(.2,.9,.3,1) |
| Stepper line | bg | 280ms | ease |
| Step dot grow | width | 280ms | cubic-bezier(.2,.9,.3,1) |
| Fade in (uploaded file) | opacity + translateY | 280ms | ease |

### 5.3 Hover/Press States
- **Buttons**: bg lightens (kind-specific `hoverBg`) + translateY(-0.5px) + shadow upgrade
- **Cards**: lift translateY(-1px) + shadow s1→s3, border line→lineStrong
- **NavList items**: bg → `#F4F5F7` (hover) or `#F4F5F7` (active)
- **List rows**: bg → `#F4F5F7`
- **Input focus**: border → accent + accentGlow shadow

### 5.4 Keyboard Shortcuts
- `Esc` — Close modal
- `↵` (Enter) — Wizard next step (unless input focused)
- `⌘←` / `⌘→` — Wizard prev/next
- `⌘K` — Search (UI hint only, not wired)

### 5.5 Drag & Drop
- Wizard Step 1 drop zone: tracks `dragOver` state
  - `dragOver: false` (default) — border `#D9DCE0` dashed
  - `dragOver: true` — border accent + accentSoft bg + accentGlow shadow + icon changes to "download"
- onDrop sets `hasFile: true`, triggers fadeIn animation on Uploaded Card

---

## 6. State Management

### App-level state (`hifi/app.jsx::AppHF`)
```js
screen: "library" | "detail" | "wizard"
selectedTestId: string | null
wizardStep: 0..4
modal: null | "new-variant"
```

### Context shape passed to screens
```js
{
  screen, selectedTestId, selectedTest, wizardStep, setWizardStep,
  openTest(id),
  backToLibrary(),
  startWizard(testId),
  openModal(name),
  closeModal(),
  nextStep(),
  prevStep(),
  finishWizard(),
}
```

### Screen-local state
- **Library**: `collection`, `view: "grid"|"list"`, `sort`, `hoverId`
- **Detail**: `activeTab`, `activePage`
- **Modal**: `intensity`, `count`, `opts: { shuffleProblems, shuffleChoices, withSolutions, redistPoints }`
- **Wizard Step 1**: `hasFile`, `dragOver`
- **Wizard Step 2**: `activePage`
- **Wizard Step 3**: `goal`, `diff`, `extras: { solutions, answers, oapNote, stats }`
- **Wizard Step 4**: `selectedNum`, `filter`, `activeTab`
- **Wizard Step 5**: `format`, `bundle: { problems, answers, solutions, stats }`

### Real backend integration needs
- POST /tests (upload PDF, returns id + page count)
- GET /tests/:id/ocr (paginated OCR results per page)
- POST /tests/:id/convert (kicks off variation; webhook progress)
- GET /problems/:id (single problem detail)
- POST /problems/:id/regenerate
- PATCH /problems/:id (edit)
- POST /tests/:id/export (format + bundle config → returns download URL)

---

## 7. Mock Data

8 test cards in `hifi/library.jsx::MOCK_TESTS_HF`:
```js
[
  { id: "t1", title: "2024학년도 6월 모의평가", count: 30, status: "warn", statusText: "검토 중 (3)", time: "오늘", subject: "공통+미적분", tags: ["고3", "모의평가", "6월"] },
  // ... etc
]
```

4 math problems in `hifi/math.jsx::PROBLEMS`:
- `p1`: 다항식 합 (객관식)
- `p6`: 합성함수 + 함수 그래프 (orig/new variants)
- `p11`: 점화식 수열
- `p17`: 삼각형 ABC + 삼각비

---

## 8. Design Tokens

### Colors (`hifi/tokens.jsx::HF.c`)

**Neutrals**
- `ink` #0F1117 — strongest text, primary buttons
- `text` #1A1D24 — primary text
- `text2` #3D4453 — secondary text
- `muted` #6B7280 — muted text
- `mutedSoft` #9CA3AF — placeholder text

**Surfaces**
- `bg` #FAFBFC — page bg
- `surface` #FFFFFF — cards / panels
- `surface2` #F4F5F7 — subtle wells / hover bg
- `surface3` #EAECF0 — progress track / disabled

**Borders**
- `line` #ECEEF0 — default 1px border
- `lineStrong` #D9DCE0 — interactive borders

**Sky Accent (primary)**
- `accent` #0EA5E9
- `accentHover` #0284C7
- `accentDark` #075985 — gradient end
- `accentSoft` #E0F2FE
- `accentSoftStrong` #BAE6FD
- `accentInk` #0C4A6E — accent on accentSoft text

**Status**
- `ok` #10B981 / `okSoft` #D1FAE5 / `okInk` #065F46
- `warn` #F59E0B / `warnSoft` #FEF3C7 / `warnInk` #92400E
- `danger` #EF4444 / `dangerSoft` #FEE2E2

### Typography (`hifi/tokens.jsx::HF.t`)
| Variant | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|
| display | 30px | 700 | -0.02em | 1.2 |
| h1 | 22px | 700 | -0.01em | 1.3 |
| h2 | 17px | 600 | -0.005em | 1.35 |
| h3 | 14px | 600 | 0 | 1.4 |
| body | 13.5px | 450 | 0 | 1.5 |
| small | 12.5px | 450 | 0 | 1.45 |
| caption | 11.5px | 500 | 0.005em | 1.4 |
| micro | 10.5px | 600 | 0.06em | 1.3 | uppercase |

**Fonts:**
- UI: `Pretendard Variable`, fallback Pretendard, system
- Mono (numbers, code, mono-display values like "1,420"): `JetBrains Mono`, `SF Mono`, Menlo

### Spacing
Direct px values used. Common increments: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48.

### Border Radius (`HF.r`)
- r1: 4px (small chips, inputs, list rows)
- r2: 6px (buttons, controls)
- r3: 8px (cards inside layouts)
- r4: 12px (StatCards, main cards, drop zones)
- r5: 16px (modals)
- full: 999px (pills, chips)

### Shadows (`HF.sh`)
- s1: `0 1px 2px rgba(15,17,23,0.04)` — subtle
- s2: `0 1px 2px rgba(15,17,23,0.04), 0 2px 6px rgba(15,17,23,0.04)`
- s3: `0 4px 16px rgba(15,17,23,0.06), 0 1px 3px rgba(15,17,23,0.05)` — hover/lift
- s4: `0 12px 40px rgba(15,17,23,0.12), 0 4px 12px rgba(15,17,23,0.06)` — modal
- inset: `inset 0 0 0 1px rgba(15,17,23,0.04)`
- accentGlow: `0 0 0 4px rgba(14,165,233,0.12)` — focus / selected

### Word-break (Korean text)
Global `body { word-break: keep-all; }` — Korean text breaks on word boundaries (spaces/punctuation), not on char.

---

## 9. Assets & Libraries

### External Libraries (CDN)
- **React 18.3.1** — UI
- **Babel Standalone 7.29.0** — JSX in browser (don't ship to prod; precompile)
- **KaTeX 0.16.9** — math formula rendering
- **Phosphor Icons 2.1.1** (web font) — 4 weights: regular/bold/fill/duotone
- **Pretendard Variable** — Korean UI font (orioncactus)
- **JetBrains Mono** — number / code mono font (Google Fonts)

### Iconography
Phosphor Icons used throughout. Common ones:
- `house`, `magnifying-glass`, `plus`, `bell-simple`, `x`, `check`
- `arrow-left`, `arrow-right`, `caret-right`, `caret-left`
- `sparkle`, `lightning`, `magic-wand`
- `file-pdf`, `file-doc`, `upload-simple`, `download-simple`
- `check-circle`, `warning`, `warning-circle`, `info`
- `pencil-simple`, `arrow-clockwise`, `chat-circle`, `eye`
- `book-open`, `list-numbers`, `chart-bar`, `git-branch`
- `function`, `calendar`, `user`, `floppy-disk`, `question`, `share-network`, `folder-open`, `books`
- `squares-four`, `list`, `stack`, `chart-line`, `exam`, `buildings`, `notebook`
- `text-aa`, `approximately-equals`, `target`, `crown`, `equals`, `arrow-up`, `arrow-down`, `hash`, `shuffle`
- `globe`, `image`, `article`, `circle`, `circle-half`, `trend-up`
- `scan`, `sliders-horizontal`, `check-square`, `magnifying-glass-plus`, `magnifying-glass-minus`, `files`, `list-checks`, `arrows-left-right`, `clock`, `clock-counter-clockwise`, `bell`, `graduation-cap`, `download`, `file-arrow-up`

Note: Some Phosphor icon name strings used in code may not be in the standard set — verify against `https://phosphoricons.com` and substitute the closest equivalent if missing.

### Math Content Rendering
- KaTeX renders formulas like `f(x) = x^2 - 4x + 3`, `(f \circ f)(x)`, `\overline{AB} = 5`
- Custom SVG components in `hifi/math.jsx`:
  - `FunctionGraph` — parametric function plot with axes, grid, points
  - `TriangleDiagram` — geometry shape with vertex labels + side labels + angle arc
  - `NumberLine` — number line with marked points
  - `PaperFrame` — test paper styling wrapper

---

## 10. Files in This Bundle

```
design_handoff_math_gen/
├─ README.md                ← you are here
├─ index.html               ← entry point (hi-fi prototype)
├─ hifi/
│  ├─ tokens.jsx            ← design tokens + primitive components (Btn, Card, Chip, Toggle, Segmented, etc.)
│  ├─ math.jsx              ← KaTeX Formula, FunctionGraph, TriangleDiagram, PROBLEMS data
│  ├─ library.jsx           ← Library screen
│  ├─ detail.jsx            ← Detail screen
│  ├─ modal.jsx             ← NewVariantModal
│  ├─ wizard.jsx            ← Wizard shell + Step 1 / 2 / 3
│  ├─ wizard-steps.jsx      ← Step 4 / 5
│  └─ app.jsx               ← App shell, screen routing, modal layer, keyboard shortcuts
├─ screenshots/             ← reference screenshots of each screen
│  ├─ 01-library.png
│  ├─ 02-detail.png
│  ├─ 03-modal-new-variant.png
│  ├─ 04-wizard-1-upload.png
│  ├─ 05-wizard-2-ocr-review.png
│  ├─ 06-wizard-3-options.png
│  ├─ 07-wizard-4-review.png
│  └─ 08-wizard-5-export.png
└─ _wireframes/             ← lower-fidelity earlier explorations (reference only)
   ├─ wireframes.html       ← 6 IA variants (V1–V6)
   ├─ midfi-prototype.html  ← V2+V4 mid-fi interactive
   ├─ wireframes/           ← wireframe source jsx
   └─ proto/                ← mid-fi prototype source jsx
```

### How to view locally
Open `index.html` directly in a modern browser (no build step needed). It uses Babel Standalone for in-browser JSX compilation.

---

## 11. Implementation Recommendations

1. **Don't ship Babel Standalone** — precompile JSX. Use Vite + React (the original repo's stack).
2. **Strip the `applyType` runtime helper** — encode as CSS classes or Tailwind config.
3. **Use Tailwind 3+ with custom theme** — map the color tokens (sections 8) to `theme.extend.colors`.
4. **Icon strategy** — install `@phosphor-icons/react` and import per-component; tree-shake unused icons.
5. **KaTeX in React** — use `react-katex` instead of vanilla `katex.render` for cleaner integration.
6. **Server-driven OCR/conversion** — the Wizard steps assume async backend operations. Add proper loading/error states (the current prototype shows happy path only).
7. **Mobile** — current design is 1280px+ desktop-only. Mobile is a separate design pass.
8. **Accessibility** — add ARIA labels for icon-only buttons, ensure keyboard nav works in NavList / Segmented, contrast-check muted text on surface2 bg.
9. **Korean text** — keep `word-break: keep-all` globally; verify any new long-text components add `white-space: nowrap` where horizontal wrap is undesired (Chips, status indicators, eyebrow labels).
10. **Animations** — use Framer Motion or CSS transitions; durations and easings are documented in section 5.2.

---

## 12. Open Questions / Decisions for Eng

- 변환·OCR 백엔드 어떤 모델 사용? (Gemini · GPT-4V · 자체 모델?)
- 크레딧 시스템 구체 룰? (1 문항 = 1 크레딧? 변형 강도에 따라 다른 가격?)
- 한글(HWP) export 라이브러리 선택?
- 동시 변환 작업 큐잉 (한 유저가 여러 변형 일괄 생성 시)
- 실시간 협업 (코멘트 등)을 ver.2에 둘 것인지?

---

Generated 2026.05.20.
