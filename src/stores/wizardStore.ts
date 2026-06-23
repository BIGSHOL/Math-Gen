import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GeneratedProblem } from "@app/types";
import type { ContentBlock, ChoiceGroup, SubQuestion } from "@app/types/ocrBlocks";
import type { GradeKey } from "@app/services/ai/mathDefense";
import { matchLegacyTemplate } from "@app/lib/printTemplateMigration";
import type { FontPackId } from "@app/lib/printFontPacks";

/**
 * 5-step Wizard state.
 *
 * Persistence strategy (per plan section 4.0):
 *   - zustand `persist` middleware + sessionStorage
 *   - File / Blob / large base64 page images are *not* persisted directly;
 *     instead they live in IndexedDB and we store only the ref id here
 *     (see `pages[].imageRef`)
 *   - `beforeunload` warning is wired up by `useWizardGuard` hook
 *
 * On Wizard mount we hydrate from sessionStorage and (if there's state
 * from a prior session) show a "이어하기 / 새로 시작" dialog.
 */

export type WizardStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type ConversionGoal = "digitize" | "similar" | "variant" | "targeted";
export type DifficultyShift = "easier" | "same" | "harder";
export type ExportFormat = "pdf" | "hwp" | "docx" | "online";

/**
 * 시험 종류 — mathlab `ExamUploadForm.tsx` 의 examCategory 벤치마킹. 현재는
 * 메타데이터로만 저장. 후속 phase 에서 검증 프롬프트에 활용 예정 (예: 수능
 * 기출에 대해선 더 엄격한 표기 규칙).
 */
export type ExamCategory = "MIDTERM" | "FINAL" | "MOCK" | "OTHER";

/**
 * Step 5 (PDF 내보내기 + 인쇄) 의 layout 템플릿.
 *
 * design_handoff_print_templates 의 6 신규 디자인 (pyeongga / jeongtong /
 * modern / workbook / jaseup / yuhyung) 으로 *완전 교체*. 기존 4 (exam /
 * default / minimal / classic) 는 `matchLegacyTemplate` 헬퍼가 가까운 값으로
 * 자동 매핑. 정의 source: `@app/components/print/types`.
 */
export type { PrintTemplate, PrintMeta } from "@app/components/print/types";
import type { PrintTemplate, PrintMeta } from "@app/components/print/types";

/**
 * Step 5 의 출력 대상. 라디오 선택:
 *   - variant: 변형 문제만 (기본)
 *   - original: 원본 문제만
 *   - both: 한 카드에 원본 + 변형 둘 다 (검토 자료용)
 */
export type ExportSource = "variant" | "original" | "both";

/**
 * Step 5 의 인쇄 layout 옵션. mathlab `PrintOptions` 패턴 차용 (`showDivider`
 * 만 제거 — mathg-gen 카드 디자인 충돌).
 */
export interface PrintOptions {
  template: PrintTemplate;
  /** 강조 색상 (hex). default: mathg-gen accent (#0EA5E9). */
  color: string;
  columns: 1 | 2;
  /**
   * 레이아웃 모드 (택일):
   *  - "spacing": 세로 여백(spacing) 직접 지정 — 높이 기반 그리디 패킹.
   *  - "count": 단별 문항 수(problemsPerColumn) 지정 — 컬럼당 정확히 N개씩 채우고
   *    여백은 자동 균등 분배(space-evenly). 2단이면 페이지당 N*2.
   */
  layoutMode: "spacing" | "count";
  /** count 모드 — 1단(컬럼)당 문항 수 (2 | 3 | 4). 2단이면 페이지당 ×2. */
  problemsPerColumn: number;
  /** 문항 간 세로 여백 (px). 0~150. spacing 모드에서만 사용. */
  spacing: number;
  /** 정답 + 해설 페이지 포함 여부. */
  showAnswers: boolean;
  /** showAnswers true 일 때 — 해설 생략하고 빠른 정답만. */
  quickAnswerOnly: boolean;
  showDate: boolean;
  showChapter: boolean;
  showDifficulty: boolean;
  /** 2단 일 때 컬럼 사이 세로 구분선. 1단 이면 무시. */
  columnDivider: boolean;
  /** 한글 폰트 팩 (sans/serif 한 쌍). FONT_PACKS 의 id. */
  fontPack: FontPackId;
  /**
   * 쪽 여백 프리셋 — 내보내기 시 HWP 출력에 자동 적용(좁게/보통/넓게). 미리보기(웹
   * 템플릿)는 자체 여백을 쓰므로 영향 없음. HWP payload 의 style.margins 로 전달.
   */
  marginPreset: "narrow" | "normal" | "wide";
}

/**
 * 기본 PrintOptions — Step5 첫 진입 시 사용. mathlab 의 default 값에서
 * mathg-gen accent 색 + showChapter false (chapter 메타는 우리 데이터에서
 * 거의 비어 있어 노이즈).
 */
export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  template: "jeongtong", // 한국 학교 시험지 표 양식 — 가장 일반적
  color: "#1B2A4E", // navy — jeongtong / modern 의 default accent
  columns: 1, // jeongtong 기본 1단
  layoutMode: "spacing", // 기본은 여백 직접 지정 (기존 동작 유지)
  problemsPerColumn: 3, // count 모드 기본 — 1단당 3문항
  spacing: 18,
  showAnswers: false,
  quickAnswerOnly: false,
  showDate: true,
  showChapter: true, // 6 신규 template 의 chapter chip 도 표시 default 권장
  showDifficulty: true,
  columnDivider: false,
  fontPack: "system",
  marginPreset: "normal", // 좌우 15mm·상하 12mm (HWP 출력 기본; 좁게/넓게 선택 가능)
};

/**
 * 기본 시험지 메타 — Step5 정보 입력 패널의 초기값. 사용자가 입력하지 않은
 * 필드는 빈 문자열(또는 totalScore 100)로 두고, Step5Export 의 meta useMemo 가
 * 빈 값일 때 testTitle / gradeBadge / 오늘 날짜 등으로 폴백한다.
 *
 * 6 종 인쇄 템플릿(헤더)과 HWP payload(meta) 가 *동일* 한 이 값을 공유 — 고른
 * 폼이 미리보기·HWP 에 일관 유지되도록(§내보내기 고도화). title/subject 는
 * PrintMeta 에서 non-optional 이라 빈 문자열로 시드.
 */
export const DEFAULT_PRINT_META: PrintMeta = {
  title: "",
  subject: "수학",
  schoolName: "",
  grade: "",
  semester: "",
  examDate: "",
  examDuration: "",
  examiner: "",
  totalScore: 100,
  academyName: "",
  instructorName: "",
  conceptNote: "",
  todayGoal: "",
  patternName: "",
  patternStrategy: "",
};

/**
 * Step 1.5 검수 단계의 크롭 박스. ?croptest 의 cropDetect 가 자동 검출 →
 * 사용자가 Step 1.5 에서 검토/편집 → Step 2 의 cropped Pass 2 가 이 박스만
 * 잘라 GPT-5.5 재OCR.
 *
 *  - id      : crypto.randomUUID(). React stable key.
 *  - class   : 시각 분류 (색상 코딩) + Pass 2 트리거 판정. "problem" 만 Pass 2
 *              대상; "figure"/"table" 은 시각 참조용 메모 (후속 Phase K 에서 활용).
 *  - bbox    : [yMin, xMin, yMax, xMax] 0–1000 그리드 (cropDetect.ts 와 동일 contract).
 *  - verified: 사용자 명시적 OK 표시. Phase I 에서는 markAllCropInspected 가
 *              페이지 단위로 cropInspected=true 로 일괄 처리 — 박스별 verified
 *              플래그는 향후 per-box 워크플로 확장용 reserved.
 *  - source  : "ai" = cropDetect 결과 / "user" = 사용자가 새로 그림 / "edited" =
 *              AI 결과를 편집 (bbox 또는 class 변경 시 "ai"→"edited" 자동 전환).
 *  - number  : 인쇄된 문항 번호 — Pass 2 결과 merge 시 OCRProblem.number 매칭 key.
 */
export interface CropBox {
  id: string;
  /**
   * 4-class crop classification:
   *  - **problem**: 한 문항 전체 (텍스트 + 도형 + 보기). 박스 단위 Pass 2 OCR.
   *  - **figure**:  vectorize 가능한 기하 도형 / 그래프 (단위정사각형 + 대각선,
   *                좌표축 + 곡선, Venn diagram 등). SVG emit 시도.
   *  - **table**:   bordered grid (시간표, 점수표, 달력). 표 형태 emit.
   *  - **artwork**: vectorize *불가능* 한 실사 reference (회화, 사진, 풍경,
   *                실험기구, 손글씨 sketch). SVG 시도 X — image crop 만 보존.
   *                예: 반 고흐 "고흐의 의자" 작품 thumbnail.
   *
   * 사용자 Step 1.5 검수에서 수동 변경 가능. cropDetect AI 가 1차 자동 분류.
   */
  class: "problem" | "figure" | "table" | "artwork";
  /**
   * 문항 유형 — cropDetect 가 추정. "choice"=객관식 (보기 ①②③④⑤ 있음) /
   * "essay"=서술형·단답형 (보기 없음, (N점) 마커). 박스 라벨에 "객관"/"서술"
   * prefix 로 표시. undefined = kind 미설정 (구버전 session 또는 사용자가 수동
   * 추가한 박스) → "문제" fallback.
   */
  kind?: "choice" | "essay";
  bbox: [number, number, number, number];
  verified: boolean;
  source: "ai" | "user" | "edited";
  number?: number;
}

export interface WizardPage {
  id: string;
  /** IndexedDB ref id for the hi-res image (pageImages store). */
  imageRef: string;
  /** IndexedDB ref id for the low-res thumbnail (pageThumbnails store). */
  thumbRef: string;
  /** PDF text layer for this page — used as OCR hint and skip heuristic. */
  textLayer: string;
  /** Pre-computed at Step 1 via `isProblemPage(textLayer)`. */
  isProblemPage: boolean;
  ocrResult: OCRProblem[];
  /** Set true when this page's OCR call has resolved (or was skipped). */
  ocrComplete: boolean;
  /** Per-page failure message — surfaces a retry banner in the OCR pane. */
  ocrError?: string;
  /** User opted-in to extract a page that the skip heuristic excluded. */
  forceOcr?: boolean;
  /**
   * Which model produced the current `ocrResult`. The UI surfaces this as
   * a small badge so the user knows whether they're looking at the fast
   * (1차) or precise (2차) transcription. As of the hybrid-routing change
   * pass-1 is Gemini Flash-Lite and pass-2 is Gemini 3.1 Pro, but legacy
   * Sonnet/Opus identifiers are kept here so older session results don't
   * lose their badge after the migration.
   */
  ocrModel?:
    | "gemini-3.1-flash-lite"
    | "gemini-3.1-pro-preview"
    | "claude-sonnet-4-6"
    | "claude-opus-4-7";
  /** True while the Opus precision second pass is in flight. */
  upgrading?: boolean;
  /**
   * 페이지 회전(rotation, 시계 방향, degrees). 일부 PDF가 가로 저장돼 있어
   * 정상 OCR 위해 회전이 필요. Step1Upload 가 `detectPageRotation` 으로
   * 자동 감지하고, 사용자가 *업로드 단계* 미리보기 그리드의 ⟲ 버튼으로
   * 수동 override (회전은 OCR 이전에만 — 이후 회전은 problems stale 유발).
   * 실제 이미지 변환은 OCR 호출 시점에만 `applyRotation(dataUrl, rotation)`
   * 으로 적용 — IndexedDB 의 원본 이미지는 그대로 둔다.
   */
  rotation: 0 | 90 | 180 | 270;
  /**
   * 현재 OCR 진행 중인 모델 id (체인 폴백 시 갱신됨). 비어 있으면 진행
   * 중인 호출이 없다는 뜻. `partialize` 에서 *제외* (휘발성 in-flight 상태).
   */
  ocrInflightModel?: string;
  /**
   * OCR worker 가 *호출을 시작한 시점* 의 timestamp (ms). PageThumbColumn 의
   * 경과 시간 표시 ("12s") 와 stuck 감지에 사용. `ocrInflightModel` set 직전에
   * set, unset 직후에 unset. `partialize` 에서 *제외* (휘발성).
   */
  ocrStartedAt?: number;
  /**
   * Phase I — Step 1.5 검수 단계의 박스 결과. undefined = 아직 cropDetect
   * 안 돈 상태 (useCropDetect 가 mount 시 트리거). 빈 배열 = 검출 시도했으나
   * 0박스 (사용자 수동 추가 필요).
   */
  cropBoxes?: CropBox[];
  /**
   * Step 1.5 통과 표시 — 사용자가 "다음 단계" 또는 "건너뛰기" 클릭 시 true.
   * Pass 2 (cropped) 트리거 조건: cropInspected && cropBoxes.length > 0.
   */
  cropInspected?: boolean;
  /** useCropDetect in-flight 플래그. `partialize` 에서 *제외* (휘발성). */
  cropDetectInflight?: boolean;
  /** cropDetect 호출 실패 메시지 — Step 1.5 재시도 배너용. */
  cropDetectError?: string;
  /**
   * born-digital PDF text-layer 와 OCR 결과 대조 경고 (인식률 Step 3, §28-2).
   * OCR 완료 시 `validateOcrAgainstTextLayer` 가 산출. 비파괴 — 검토 유도용
   * 배너만 띄움. *파생/휘발성* 이라 `partialize` 에서 제외(재OCR 시 재계산).
   */
  ocrTextLayerWarning?: import("@app/lib/textLayerValidator").TextLayerWarning;
}

export interface OCRImage {
  /** Normalized 0–1000 bbox: [yMin, xMin, yMax, xMax]. */
  box: [number, number, number, number];
  /** Short Korean label (e.g. "정사각형 ABCD", "거북이 이동 경로"). */
  label: string;
  /**
   * Phase #12/#13: 이미지 출처 — backward-compatible. 옛 row 는 source 없음 →
   * reader 가 "ai-crop" default 적용.
   *  - "ai-crop"  (default): AI bbox + cropPageImageData 자동 크롭
   *  - "user-crop": 사용자가 박스 직접 그려서 크롭한 결과
   *  - "ai-gen":   DALL-E 3 가 생성한 도형 이미지 (raster PNG)
   */
  source?: "ai-crop" | "user-crop" | "ai-gen";
  /** user-crop 시 inline 보관 (base64 PNG, ~50KB). 옛 ai-crop 도 일부 보관 가능. */
  dataUrl?: string;
  /** ai-gen 시 Supabase Storage 영구 URL (page-images bucket). DALL-E URL 만료 회피. */
  url?: string;
  /** ai-gen 시 사용된 prompt (한국어 또는 영어). 재생성 가능. */
  prompt?: string;
  /** ai-gen timestamp (ms). dedupe 캐시 + UI 표시. */
  generatedAt?: number;
  /**
   * ai-crop freeze — 첫 렌더 시 크롭 PNG 를 Storage 에 업로드한 path.
   * 있으면 `ensureCropImage(path)` 로 작은 크롭만 복원(5.8MB 페이지 재로드 0).
   * 없으면 기존대로 `cropPageImageData` 로 페이지에서 재크롭(fallback). box 편집/
   * Pass-2 재크롭 시 stale 방지 위해 비워짐.
   */
  storagePath?: string;
}

/**
 * Phase B — `[그림N]` 마커가 가리키는 *모든* 시각 요소(크롭 이미지·벡터 도형·
 * inline svg)의 full-page 레이아웃 box. index 는 `[그림N]` 의 N (1-indexed) →
 * figures[N-1]. figureLayout(Stage 1c)이 이 box 로 좌우/상하 배치를 결정한다.
 * box 는 *레이아웃 hint* 일 뿐(크롭 소스 아님) — 부정확해도 잘못된 내용이 아니라
 * 스택 fallback 으로 degrade.
 */
export interface FigureBox {
  /** full-page 정규화 bbox [yMin, xMin, yMax, xMax] (0–1000). */
  box: [number, number, number, number];
  /** 이 [그림N] 슬롯을 채우는 채널. */
  kind: "svg" | "diagram" | "crop";
  /** 짧은 한국어 캡션 (빈 문자열 허용). */
  label: string;
}

export interface OCRProblem {
  id: string;
  number: number;
  text: string; // markdown + LaTeX — 옵션 B 에서 blocks 로부터 *파생* (blocksToMarkdown)
  /**
   * 옵션 B: 본문 typed-block 배열 (정전). OCR 이 testchange 와 동일 구조로 emit.
   * markdown `text` 는 이 blocks 에서 파생되며, HWP 내보내기는 이 blocks 를 커넥터에
   * *그대로* 보내 testchange 변환 결과와 일치시킨다 (PR3). 옛 세션/legacy row 는
   * blocks 없음(undefined) → text 로 동작 + HWP 는 markdown adapter fallback.
   * 사용자가 Step2 에서 text 를 직접 편집하면 blocks 를 drop(undefined)해 fallback.
   */
  blocks?: ContentBlock[];
  /** 옵션 B: 보기 (ChoiceGroup 배열). 서술형이면 비어있음/undefined. */
  choiceGroups?: ChoiceGroup[];
  /**
   * D3: 소문항 (1)(2) — 개별 배점 있는 하위 문항 (testchange sub_questions 미러).
   * HWP 커넥터가 소문항별 번호·배점·답란으로 렌더. 없으면 undefined. 파생 `text` 에도 포함.
   */
  subQuestions?: SubQuestion[];
  /** 배점 (없으면 undefined). HWP wire payload 로 전달돼 정답지/배점 표기에 사용. */
  score?: number;
  /** 문항 유형 라벨 ("서답형"/"서술형"/"단답형"/…). 없으면 undefined. */
  labelType?: string;
  topic?: string;
  /** Diagrams / figures embedded in this problem — cropped from the page on render. */
  images?: OCRImage[];
  /**
   * Phase B: 모든 `[그림N]` figure 의 full-page 레이아웃 box (index-aligned to N).
   * 위치 기반 배치(figureLayout Stage 1c)용. 없으면 세로 스택 fallback (회귀 0).
   */
  figures?: FigureBox[];
  /** Confidence band — drives the OCRItem warning border. */
  status: "ok" | "warn" | "pending";
  /** True after the user has reviewed / edited this item. */
  reviewed: boolean;
  /**
   * 모델이 본문(body) 추출에 실패해 옵션·짧은 단편만 emit한 케이스 마커.
   * UI에서 카드 상단에 명시적 경고 배너를 띄워 사용자가 인지하도록 한다.
   * `normalizeResponse` 내부의 `isBodyTooShort` 휴리스틱으로 설정됨.
   */
  bodyMissing?: boolean;
  /**
   * 객관식 발문(`?` / `구하시오` / `옳은 것은` 등)인데 ①②③④⑤ 마커가
   * 빠진 케이스 마커. 모델이 본문만 추출하고 보기를 누락한 상황.
   * `isChoicesMissing` 휴리스틱으로 설정됨. bodyMissing 과 별도 배너로 표시.
   */
  choicesMissing?: boolean;
  // ── Step 3 (해설·정답 생성) 필드 ─────────────────────────────
  /**
   * 단계별 풀이 — markdown + LaTeX. `[1단계: 조건 정리]` 같은 헤더로
   * 분리된 학원/문제집 스타일. `generateSolution` 으로 채워지고
   * 사용자가 편집 모드에서 수정 가능.
   */
  solution?: string;
  /**
   * 짧은 정답. 객관식이면 `"③ 5"` 형태, 주관식이면 최종 값만
   * (`"5"` / `"$\\frac{4\\pi}{3}$"` / `"x=2"`).
   */
  answer?: string;
  /** 해설 생성 in-flight 플래그 — UI 에서 spinner 표시용. dispatched 직후 즉시
   *  true 가 됨 (limit 큐 대기 포함). 실제 *진행* 인지 *대기* 인지 구분하려면
   *  `solutionStartedAt` 도 같이 확인. */
  solutionGenerating?: boolean;
  /**
   * 해설 생성의 *실제 호출 시작* timestamp (ms). useSolutionGen 의 limit() async
   * fn 첫 줄에서 set. 큐 대기 중에는 undefined → SolutionItem 의 "대기 중"
   * vs "생성 중 · 12s" 구분에 사용. 완료/실패 시 unset. partialize 에서 제외.
   */
  solutionStartedAt?: number;
  /** 해설 생성 실패 메시지 (친화적 한국어). 재시도 버튼과 함께 표시. */
  solutionError?: string;
  /** 어떤 모델이 해설을 만들었는지 (디버그·UI 배지). */
  solutionModel?: string;
  /**
   * 정확도 휴리스틱 검증 결과 — `lib/solutionValidator.ts` 가 검출한 *구조적
   * 오류 가능성* (예: "서로 다른 N 개" 조건 위반 튜플). UI 의 SolutionItem 이
   * warning banner 로 노출 + 재생성 권장. 답을 *무효화하지 않음* (false
   * positive 위험 때문).
   */
  solutionWarnings?: Array<{
    rule: string;
    summary: string;
    detail: string;
  }>;
  /**
   * Phase G: validator warning 검출 시 자동 재생성 1회 시행 여부. true 면 더
   * 이상 자동 retry 안 함 (수동 재시도는 별개 — `solution=undefined` 로 reset
   * 하면 동일 cycle 에서 한 번 더 시도하되 *자동 retry 는 발동 X*).
   */
  solutionAutoRetried?: boolean;
  /**
   * 이 문항을 OCR 한 모델 (디버그·UI 배지). 같은 페이지 안의 모든 item 은
   * 기본적으로 동일 (페이지 단위 호출이라). task #41 (item 별 재실행) 도입
   * 시 item 마다 다른 모델 가능 — 그 때 자연스럽게 분기.
   *
   * `usePageOcr` 가 페이지 OCR 성공 시 각 item 에 페이지 모델을 복사.
   */
  ocrModel?: string;
  /**
   * Phase F (OCR Tier 2): vision 모델이 추출한 vector 도형 spec. 있으면
   * `renderDiagram` 으로 SVG 생성 → MarkdownRenderer 의 `[그림N]` 치환.
   * 없으면 `images` (bbox crop) fallback. 본문의 `[그림N]` 마커 순서와 매핑.
   */
  diagramParams?: import("@app/lib/diagram").DiagramParams[] | null;
  /**
   * Phase #7: 원본 보기 (5지선다) 배치 — 사용자 보고 "원본의 문제별 보기번호
   * 배치를 보고 배치가능한지 체크해볼것 예를 들어 3x2나 2x3 또는 1x5 처럼".
   * OCR 모델이 원본 시각을 인식해 결정. 명명 = rows × cols:
   *   - "1x5": 1 행 × 5 열 (가로)
   *   - "2x3": 2 행 × 3 열 (3+2 split)
   *   - "3x2": 3 행 × 2 열 (2+2+1 split)
   *   - "5x1": 5 행 × 1 열 (세로)
   *   - "auto": 보기 X 또는 모호 — 렌더러가 자동 결정
   * MarkdownRenderer 의 choicesLayout prop 으로 전달돼 renderChoiceRowOrNull
   * 의 grid 결정에 사용. tall LaTeX (cases) 검출 시 5x1 으로 자동 override.
   */
  choicesLayout?: ChoicesLayout;
}

/**
 * 5지선다 보기 grid layout — rows × cols. "auto" 는 renderer 가 자동 결정
 * (옵션 최대 길이 기반). #7 사용자 보고 기반.
 */
export type ChoicesLayout = "auto" | "1x5" | "2x3" | "3x2" | "5x1";

export interface ProblemReview {
  id: string;
  original: GeneratedProblem;
  variant: GeneratedProblem;
  status: "confirmed" | "review" | "pending";
  /**
   * 변형 생성 실패 시 친화적 한국어 메시지. UI 의 재시도 배너에서 표시.
   * `useVariantGen` 이 generateVariant throw 시 set, 성공 시 clear.
   */
  genError?: string;
  /**
   * 어떤 모델이 변형을 만들었는지 (UI 배지·디버그). `OCRProblem.ocrModel` /
   * `solutionModel` 과 같은 패턴. task #41 (item 별 재실행) 도입 시 item 마다
   * 다를 수 있음.
   */
  genModel?: string;
  /** 변형 생성 in-flight 플래그 — UI spinner 표시용. dispatched 직후 즉시 true.
   *  실제 *진행* vs *큐 대기* 는 `generatingStartedAt` 으로 구분. */
  generating?: boolean;
  /**
   * 변형 생성의 *실제 호출 시작* timestamp (ms). useVariantGen 의 limit()
   * async fn 첫 줄에서 set. `solutionStartedAt` 과 동일 패턴 — VariantItem 의
   * "대기 중" vs "생성 중 · 12s" 구분에 사용.
   */
  generatingStartedAt?: number;
}

/**
 * "이어서 작업" — 저장된 시험지로부터 wizardStore 를 재구성할 때 `hydrateFromTest`
 * 에 넘기는 스냅샷. `initialState` 위에 얹혀 위자드 state 를 복원한다.
 */
export interface WizardHydrateSnapshot {
  testId: string;
  step: WizardStepIndex;
  pages: WizardPage[];
  problems: ProblemReview[];
  selectedGrade: GradeKey | null;
  examCategory: ExamCategory | null;
  uploadedFileName: string | null;
}

export interface WizardState {
  testId: string | null;
  step: WizardStepIndex;
  /**
   * Phase #16 (2026-05-27): 한 번 도달한 가장 멀리 간 step. setStep / next 가
   * monotonic 증가, prev() 는 영향 X → Stepper 의 done 상태가 사용자 navigation
   * 으로 풀리지 않음. startWizard / reset / hydrateFromTest 가 0 으로 초기화.
   * 사용자 보고: "완료된 항목에 대해 이전 누르면 완료가 풀려버림".
   */
  furthestStep: WizardStepIndex;
  /**
   * "이어서 작업" hydrate 직후 1회만 true. WizardScreen 의 resume 다이얼로그가
   * 이 플래그를 보면 skip — 이미 명시적으로 불러온 시험지라 재차 묻지 않는다.
   * `partialize` 제외 (휘발성) — 새로고침 후엔 일반 resume 흐름.
   */
  justHydrated: boolean;

  // Step 1 — Upload
  uploadedFileName: string | null;
  uploadProgress: number;
  /**
   * 사용자가 PDF 업로드 시 선택한 학년·과목 (mathDefense fragment key).
   * 해설 생성 시 buildSolutionPrompt 에 전달돼 학년별 단원 함정 fragment
   * 가 prompt 에 inject 됨. null 이면 공통 fragment 만.
   */
  selectedGrade: GradeKey | null;
  /** 시험 종류 — 현재는 메타데이터, 후속 phase 에서 prompt 활용 예정. */
  examCategory: ExamCategory | null;

  // Step 2 — OCR Review
  pages: WizardPage[];
  activePageIndex: number;
  /**
   * OCR 단계 "모든 문항 확인 완료" — 사용자 명시 확인 (검수의 cropInspected 미러).
   * 게이팅: true 여야 step 2 → 3 진행. partialize 제외 (휘발성 — 새로고침 후 재확인).
   */
  ocrConfirmed: boolean;
  /**
   * 해설 단계 "모든 문항 해설 확인 완료" — OCR 의 ocrConfirmed 미러. 단 해설은
   * 스킵 가능하므로 *해설이 모두 끝났을 때만* 확인을 요구 (생성 중엔 skip 허용).
   * partialize 제외 (휘발성).
   */
  solutionConfirmed: boolean;
  /**
   * 해설 단계 스킵 — true 면 `useSolutionGen` 자동발사 차단(Step3 재진입·Stepper
   * 클릭 포함). 사용자가 "해설 건너뛰기" 로 set, "해설 생성하기" 로 해제. partialize
   * *유지* (새로고침 후에도 스킵 의도 보존 — 안 그러면 Step3 재마운트 시 자동 생성 재발).
   * startWizard/hydrateFromTest/reset 은 initialState 스프레드로 false 초기화.
   */
  skipSolutions: boolean;

  // Step 3 — Options
  goal: ConversionGoal;
  difficulty: DifficultyShift;
  extras: {
    solutions: boolean;
    answers: boolean;
    oapNote: boolean;
    stats: boolean;
  };

  // Step 4 — Per-Problem Review
  problems: ProblemReview[];
  selectedProblemIdx: number;
  reviewFilter: "all" | "review" | "pending";

  // Step 5 — Export
  format: ExportFormat;
  bundle: { problems: boolean; answers: boolean; solutions: boolean; stats: boolean };
  filename: string;
  /**
   * Step 5 의 인쇄 layout 옵션. 미리보기 / 인쇄 / PDF 가 모두 이 옵션을 공유.
   * Step3 옵션 (`bundle.answers`) 가 켜져 있으면 Step5 mount 시 1회 자동으로
   * `showAnswers: true` 로 seed.
   */
  printOptions: PrintOptions;
  /** Step 5 출력 대상: 변형 / 원본 / 둘 다. */
  exportSource: ExportSource;
  /**
   * Step 5 시험지 정보(학교명·학원명·시험일·배점·개념정리 등). 미리보기 6종
   * 헤더 + HWP payload(meta) 가 공유 — 고른 폼이 모든 내보내기에 일관 유지.
   * sessionStorage persist (Supabase row 엔 미저장, printOptions 와 동일 정책).
   */
  printMeta: PrintMeta;

  // Actions
  setStep: (step: WizardStepIndex) => void;
  next: () => void;
  prev: () => void;
  setUploadedFile: (filename: string) => void;
  setSelectedGrade: (grade: GradeKey | null) => void;
  setExamCategory: (cat: ExamCategory | null) => void;
  setPages: (pages: WizardPage[]) => void;
  setPageOCR: (
    pageId: string,
    patch: Partial<
      Pick<
        WizardPage,
        | "ocrResult"
        | "ocrComplete"
        | "ocrError"
        | "forceOcr"
        | "ocrModel"
        | "upgrading"
        | "ocrInflightModel"
        | "ocrStartedAt"
        | "imageRef"
        | "ocrTextLayerWarning"
      >
    >,
  ) => void;
  setPageRotation: (pageId: string, rotation: WizardPage["rotation"]) => void;
  updateOCRItem: (pageId: string, itemId: string, patch: Partial<OCRProblem>) => void;
  /** OCR 단계 "모든 문항 확인 완료" 토글 (게이팅용). */
  setOcrConfirmed: (v: boolean) => void;
  setSolutionConfirmed: (v: boolean) => void;
  setSkipSolutions: (v: boolean) => void;
  setOptions: (patch: Partial<Pick<WizardState, "goal" | "difficulty" | "extras">>) => void;
  setProblems: (problems: ProblemReview[]) => void;
  updateProblem: (id: string, patch: Partial<ProblemReview>) => void;
  setExport: (
    patch: Partial<
      Pick<
        WizardState,
        "format" | "bundle" | "filename" | "printOptions" | "exportSource" | "printMeta"
      >
    >,
  ) => void;

  // Step 1.5 — Crop inspect (Phase I)
  /** boxes=undefined → cropDetect 재트리거 (useCropDetect 가 undefined 보고 재실행). */
  setPageCropBoxes: (pageId: string, boxes: CropBox[] | undefined) => void;
  addCropBox: (pageId: string, box: Omit<CropBox, "id">) => void;
  updateCropBox: (pageId: string, boxId: string, patch: Partial<CropBox>) => void;
  deleteCropBox: (pageId: string, boxId: string) => void;
  markCropInspected: (pageId: string) => void;
  markAllCropInspected: () => void;
  setCropDetectInflight: (pageId: string, value: boolean) => void;
  setCropDetectError: (pageId: string, error: string | undefined) => void;

  startWizard: (testId: string) => void;
  /** "이어서 작업" — 저장된 시험지 스냅샷으로 위자드 state 재구성. */
  hydrateFromTest: (snapshot: WizardHydrateSnapshot) => void;
  reset: () => void;
}

const initialState = {
  testId: null,
  step: 0 as WizardStepIndex,
  /**
   * Phase #16 (2026-05-27): 한 번 도달한 가장 멀리 간 step. setStep / next 가
   * max(furthestStep, newStep) 으로 monotonic 증가. prev() 로 돌아가도 감소 X →
   * Stepper 의 done 상태 보존. startWizard / hydrateFromTest 가 reset.
   * 사용자 보고: "완료된 항목에 대해 이전 누르면 완료가 풀려버림."
   */
  furthestStep: 0 as WizardStepIndex,
  justHydrated: false,
  uploadedFileName: null,
  uploadProgress: 0,
  selectedGrade: null as GradeKey | null,
  examCategory: null as ExamCategory | null,
  pages: [] as WizardPage[],
  activePageIndex: 0,
  ocrConfirmed: false,
  solutionConfirmed: false,
  skipSolutions: false,
  goal: "similar" as ConversionGoal,
  difficulty: "same" as DifficultyShift,
  extras: { solutions: true, answers: true, oapNote: false, stats: false },
  problems: [] as ProblemReview[],
  selectedProblemIdx: 0,
  reviewFilter: "all" as const,
  format: "pdf" as ExportFormat,
  bundle: { problems: true, answers: true, solutions: false, stats: false },
  filename: "변형시험지",
  printOptions: DEFAULT_PRINT_OPTIONS,
  // 기본 출력 대상 = 원본만. 변형 출력 준비 중이라 변형/원본+변형 은 UI 비활성
  // (PrintOptionsPanel). 사용자 결정 2026-06-04.
  exportSource: "original" as ExportSource,
  printMeta: DEFAULT_PRINT_META,
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStep: (step) => {
        // Phase #16: furthestStep monotonic — 한 번 도달한 step 은 prev 후에도 유지.
        const cur = get().furthestStep;
        set({ step, furthestStep: (Math.max(cur, step) as WizardStepIndex) });
      },
      setOcrConfirmed: (v) => set({ ocrConfirmed: v }),
      setSolutionConfirmed: (v) => set({ solutionConfirmed: v }),
      setSkipSolutions: (v) => set({ skipSolutions: v }),
      next: () => {
        const s = get().step;
        // Step 0~6 — Step 1.5 (검수) 가 1 로 삽입돼 총 7 단계. next() clamp 6.
        if (s < 6) {
          const newStep = (s + 1) as WizardStepIndex;
          const cur = get().furthestStep;
          set({
            step: newStep,
            furthestStep: (Math.max(cur, newStep) as WizardStepIndex),
          });
        }
      },
      prev: () => {
        const s = get().step;
        // furthestStep 은 *유지* — 사용자 보고 (2026-05-27): "완료 항목 이전 누르면 풀려버림"
        if (s > 0) set({ step: (s - 1) as WizardStepIndex });
      },

      setUploadedFile: (filename) => set({ uploadedFileName: filename, uploadProgress: 100 }),
      setSelectedGrade: (grade) => set({ selectedGrade: grade }),
      setExamCategory: (cat) => set({ examCategory: cat }),
      setPages: (pages) => set({ pages }),
      setPageOCR: (pageId, patch) =>
        set((state) => ({
          pages: state.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)),
        })),
      setPageRotation: (pageId, rotation) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  rotation,
                  // 회전 변경 시 OCR 결과 무효화 — 새 방향으로 재추출 필요.
                  ocrComplete: false,
                  ocrResult: [],
                  ocrError: undefined,
                  ocrModel: undefined,
                  ocrInflightModel: undefined,
                  upgrading: false,
                }
              : p,
          ),
        })),
      updateOCRItem: (pageId, itemId, patch) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  ocrResult: p.ocrResult.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
                }
              : p,
          ),
        })),

      // ── Step 1.5 — Crop inspect (Phase I) ─────────────────────────────────
      setPageCropBoxes: (pageId, boxes) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? { ...p, cropBoxes: boxes, cropDetectError: undefined }
              : p,
          ),
        })),
      addCropBox: (pageId, box) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  cropBoxes: [
                    ...(p.cropBoxes ?? []),
                    { ...box, id: crypto.randomUUID() },
                  ],
                }
              : p,
          ),
        })),
      updateCropBox: (pageId, boxId, patch) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id !== pageId
              ? p
              : {
                  ...p,
                  cropBoxes: (p.cropBoxes ?? []).map((b) =>
                    b.id !== boxId
                      ? b
                      : {
                          ...b,
                          ...patch,
                          // bbox/class 편집 시 source 자동 전환 (ai → edited).
                          source:
                            b.source === "ai" && (patch.bbox || patch.class)
                              ? "edited"
                              : (patch.source ?? b.source),
                        },
                  ),
                },
          ),
        })),
      deleteCropBox: (pageId, boxId) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  cropBoxes: (p.cropBoxes ?? []).filter((b) => b.id !== boxId),
                }
              : p,
          ),
        })),
      markCropInspected: (pageId) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId ? { ...p, cropInspected: true } : p,
          ),
        })),
      markAllCropInspected: () =>
        set((state) => ({
          pages: state.pages.map((p) => ({ ...p, cropInspected: true })),
        })),
      setCropDetectInflight: (pageId, value) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId ? { ...p, cropDetectInflight: value } : p,
          ),
        })),
      setCropDetectError: (pageId, error) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId ? { ...p, cropDetectError: error } : p,
          ),
        })),

      setOptions: (patch) => set((state) => ({ ...state, ...patch })),

      setProblems: (problems) => set({ problems }),
      updateProblem: (id, patch) =>
        set((state) => ({
          problems: state.problems.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      setExport: (patch) => set((state) => ({ ...state, ...patch })),

      startWizard: (testId) => set({ ...initialState, testId }),
      hydrateFromTest: (snapshot) => {
        // 도달한 step 추정 — 데이터 기반. resume step(snapshot.step) 만으로는 완료된
        // 시험지인데도 furthestStep 이 낮아 Stepper 앞 단계 클릭이 막혔다 (사용자 보고
        // 2026-06-04: "모든 단계 저장했는데 다음 단계 선택이 안 됨"). OCR/해설/변형
        // 데이터로 실제 진행 단계를 추정해 max → 앞 단계 자유 이동.
        const ocr = snapshot.pages.flatMap((p) => p.ocrResult ?? []);
        let reached = 1; // 업로드 후 검수
        if (ocr.length > 0) reached = 2; // OCR 결과 있음
        if (ocr.some((it) => it.solution)) reached = 3; // 해설 있음
        if (snapshot.problems.length > 0) reached = 6; // 변형/검토 → 내보내기까지
        const furthest = Math.max(snapshot.step as number, reached) as WizardStepIndex;
        set({
          ...initialState,
          ...snapshot,
          furthestStep: furthest,
          justHydrated: true,
        });
      },
      reset: () => set(initialState),
    }),
    {
      // v3 bump (Phase I-6): Step 1.5 (검수) 가 step 1 로 삽입 → 옛 step 1+
      // 는 +1 shift 필요. CropBox / cropInspected 등 새 필드는 v2 session 에서
      // undefined 로 hydrate 돼 자연 fallback.
      name: "mathgen-wizard-v3",
      version: 3,
      migrate: (persistedState, fromVersion) => {
        // v2 → v3: step >= 1 이면 +1 shift (Step 1.5 가 신규 step 1 으로 삽입).
        // step 0 (업로드) 는 그대로.
        if (fromVersion < 3 && persistedState && typeof persistedState === "object") {
          const s = persistedState as { step?: number };
          if (typeof s.step === "number" && s.step >= 1 && s.step <= 5) {
            s.step = (s.step + 1) as WizardStepIndex;
          }
        }
        return persistedState as WizardState;
      },
      storage: createJSONStorage(() => sessionStorage),
      // Skip large fields and transient UI state.
      partialize: (s) => ({
        testId: s.testId,
        step: s.step,
        // 도달한 가장 먼 step — 미persist 면 새로고침 후 0 으로 reset 돼 Stepper 가
        // 앞 단계를 future(클릭 불가) 로 처리, 사용자는 하단 "다음" 으로만 이동 가능
        // (사용자 보고 2026-06-04). step 과 함께 persist 해 앞 단계 클릭 이동 유지.
        furthestStep: s.furthestStep,
        uploadedFileName: s.uploadedFileName,
        selectedGrade: s.selectedGrade,
        examCategory: s.examCategory,
        // 페이지/문항별 휘발성 필드 (in-flight 모델명, 업그레이드 진행 플래그,
        // 호출 시작 timestamp, 해설 생성 in-flight 플래그) 는 새로고침 후 살아
        // 있어 봤자 의미 없으므로 stripping. rotation / solution / answer 등
        // 사용자가 명시적으로 정해 둔 값이나 결과물은 그대로 persist.
        pages: s.pages.map((p) => ({
          ...p,
          ocrInflightModel: undefined,
          ocrStartedAt: undefined,
          upgrading: false,
          cropDetectInflight: false,
          ocrTextLayerWarning: undefined,
          ocrResult: p.ocrResult.map((item) => ({
            ...item,
            solutionGenerating: false,
            solutionStartedAt: undefined,
          })),
        })),
        activePageIndex: s.activePageIndex,
        // 해설 스킵 의도는 persist — 새로고침 후 Step3 재마운트 시 자동 생성 재발 방지.
        skipSolutions: s.skipSolutions,
        goal: s.goal,
        difficulty: s.difficulty,
        extras: s.extras,
        // problems 의 in-flight 마커도 stripping — 새로고침 후 spinner 가 stuck
        // 으로 남는 버그 방지. genError 는 *지속성 있는* 정보 (재시도 버튼 표시
        // 위해 필요) 라 그대로 persist.
        problems: s.problems.map((r) => ({
          ...r,
          generating: false,
          generatingStartedAt: undefined,
        })),
        selectedProblemIdx: s.selectedProblemIdx,
        format: s.format,
        bundle: s.bundle,
        filename: s.filename,
        printOptions: s.printOptions,
        exportSource: s.exportSource,
        printMeta: s.printMeta,
      }),
      // 신규 필드 (printOptions / exportSource) 가 이전 session 에 없으면
      // hydration 후 undefined → crash. version bump 대신 fallback 으로 안전
      // 처리 — Resume dialog 의 기존 sessionStorage 도 살림.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.printOptions) {
          state.printOptions = DEFAULT_PRINT_OPTIONS;
        } else {
          state.printOptions = { ...DEFAULT_PRINT_OPTIONS, ...state.printOptions };
        }
        // legacy template 값 정상화 (exam → pyeongga, default → jeongtong 등).
        // VALID 6 union 에 없으면 fallback "jeongtong".
        state.printOptions.template = matchLegacyTemplate(state.printOptions.template);
        if (!state.exportSource) {
          state.exportSource = "original";
        }
        // 신규 printMeta — 옛 세션엔 없으므로 기본값 머지(누락 필드 보강).
        if (!state.printMeta) {
          state.printMeta = DEFAULT_PRINT_META;
        } else {
          state.printMeta = { ...DEFAULT_PRINT_META, ...state.printMeta };
        }
      },
    },
  ),
);
