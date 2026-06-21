/**
 * Centralized type surface.
 *
 * Re-exports the legacy enums/interfaces that the curriculum-based problem
 * generator depends on (kept verbatim during Phase 0.6 migration), plus the
 * new SaaS-level types introduced by the design handoff (TestPaper, OCR,
 * variant history, etc.).
 */

// ---------- Legacy (kept for compatibility during Phase 0–2) ----------

export enum SchoolLevel {
  ELEMENTARY = "초등학교",
  MIDDLE = "중학교",
  HIGH = "고등학교",
}

export enum Difficulty {
  LOW = "하",
  MEDIUM = "중",
  HIGH = "상",
  EXTREME = "최상",
}

export enum ProblemType {
  CONCEPT = "개념 확인",
  TYPE = "유형 익히기",
  SKILL = "실력 다지기",
  CREATIVE = "창의 융합",
}

export enum AnswerType {
  MULTIPLE_CHOICE = "객관식 (5지선다)",
  SUBJECTIVE = "주관식/서술형",
}

export interface CurriculumUnit {
  name: string;
  subUnits?: CurriculumUnit[];
}

export interface GeneratedProblem {
  question: string;
  choices?: string[];
  answer: string;
  solution: string;
  topic: string;
  difficulty: string;
  /** 배점. 기본 3 (template 별 default). 인쇄 6 신규 template 의 PointsLabel 에서 사용. */
  points?: number;
  /** @deprecated Phase E 이후 — `diagramParams` 우선. supabase JSONB 의 기존 데이터 호환용. */
  diagramSVG?: string | null;
  /**
   * Vector 도형 spec (Phase E). AI 가 emit → `normalizeDiagram` 보정 →
   * `renderDiagram` 으로 SVG 생성. 본문의 `[그림1]`, `[그림2]` 마커 순서와 매핑.
   * 도형 없으면 null/undefined.
   */
  diagramParams?: import("@app/lib/diagram").DiagramParams[] | null;
  /**
   * Phase #7: 원본 보기 grid 배치 — variant 생성 시 OCR 의 choicesLayout 을
   * 그대로 상속 (사용자 보고: "원본의 문제별 보기번호 배치를 보고 배치가능한지").
   * 명명 = rows × cols. "auto" | "1x5" | "2x3" | "3x2" | "5x1".
   */
  choicesLayout?: "auto" | "1x5" | "2x3" | "3x2" | "5x1";
  /**
   * 벡터화 불가 *이미지 도형* (이미 해석된 dataUrl/url). 작품 사진(user-crop)·
   * AI 생성 이미지(ai-gen) 처럼 diagramParams 로 못 그리는 도형을 내보내기에서
   * 표시 (#14). ocrToGenerated 가 inline 이미지(user-crop dataUrl / ai-gen url)만
   * 동기 carry — ai-crop(box-only)은 벡터 중복 위험 + 비동기라 제외.
   */
  images?: Array<{ dataUrl: string; label: string }>;
  /**
   * 옵션 B (HWP 일치): OCR 네이티브 typed-block. 있으면 HWP 내보내기(buildHwpPayload)가
   * markdown 대신 *블록을 그대로* 커넥터에 보내 testchange 변환 결과와 일치시킨다.
   * 없으면(변형 문제·legacy) markdown text fallback. ocrToGenerated 가 OCRProblem 에서 carry.
   */
  blocks?: import("@app/types/ocrBlocks").ContentBlock[];
  /** 옵션 B: 보기 (ChoiceGroup 배열). 서술형이면 비어있음. */
  choiceGroups?: import("@app/types/ocrBlocks").ChoiceGroup[];
  /** 배점 (HWP 정답지·배점 표기). */
  score?: number;
  /** 문항 유형 라벨 ("서답형"/"서술형"/…). */
  labelType?: string;
}

export type GenerationMode = "curriculum" | "image" | "exact" | "diagram";

export interface SelectionState {
  mode: GenerationMode;
  sourceImage?: string | null;
  schoolLevel: SchoolLevel;
  grade: string;
  mainUnit: string;
  subUnit: string;
  detailUnit: string;
  difficulty: Difficulty;
  problemType: ProblemType;
  answerType: AnswerType;
  removeScore?: boolean;
}

// ---------- New SaaS-level types (design handoff) ----------

export type TestStatus = "ok" | "warn" | "draft";

export interface TopicSlice {
  topic: string;
  count: number;
  /** 0–100, optional accuracy for color-coded progress bars. */
  accuracy?: number;
}

export interface VariantHistory {
  id: string;
  createdAt: string; // ISO
  intensity: 0 | 1 | 2;
  count: number;
  /** Optional summary string shown on the variant card. */
  label?: string;
}

export interface TestPaper {
  id: string;
  title: string;
  problemCount: number;
  status: TestStatus;
  statusText: string;
  /** e.g. "오늘", "어제", "3일 전" — display only. */
  time: string;
  /** 원본 생성 ISO timestamp — 정렬(최근순)용. mock 데이터는 없음 (optional). */
  createdAt?: string;
  /** e.g. "공통+미적분". */
  subject: string;
  tags: string[];
  grade: string;
  topicDistribution: TopicSlice[];
  /** 진행한 가장 먼 위자드 단계 (0=업로드 … 6=내보내기). 목록 진행단계 표시용. */
  furthestStep?: number;
  variants: VariantHistory[];
  /** Problems on this test paper (after OCR digitization). */
  problems: GeneratedProblem[];
}
