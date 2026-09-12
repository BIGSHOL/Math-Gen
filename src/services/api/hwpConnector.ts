/**
 * 로컬 HWP 커넥터 클라이언트 — Math-Gen 웹 → 127.0.0.1 커넥터 → .hwp/.hwpx 다운로드.
 *
 * 커넥터 = 시험지변환기(testchange) repo 의 `server/connector.py` (stdlib http.server).
 * 브라우저가 *직접* loopback 을 호출한다 (Vercel 경유 X — 서버는 사용자 PC localhost 에
 * 못 닿음). dev(localhost http)에선 mixed-content 없음. prod(https)는 PNA 헤더로 통과.
 *
 * 스펙: docs/mathgen-hwp-ocr-integration-handoff.md §12-1 (wire 계약).
 */

import type { ProblemReview, PrintOptions } from "@app/stores/wizardStore";
import type { PrintMeta } from "@app/components/print/types";
import { problemFigureBlocks } from "@app/lib/hwpFigures";
import { getFontPack, type FontPackId } from "@app/lib/printFontPacks";
import type { EngineBlock, EngineQuestion } from '../../types/testchange';
import { connectorAccessMessage } from './hwpAccess';
export { hwpExtension } from './hwpAccess';

/** 커넥터 base URL. dev override 가능 (VITE_HWP_CONNECTOR_URL). */
const BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_HWP_CONNECTOR_URL as string | undefined)) ||
  "http://127.0.0.1:8765";

const TOKEN_KEY = "mathgen_hwp_token";

/** 객관식 보기 마커 ①..⑩. */
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

export interface HwpHealth {
  status: string;
  version: string;
  engine: string; // "hwpx" | "hwp"
  hwp_com: boolean;
  capabilities: string[];
}

export interface HwpPayloadProblem {
  number: number;
  /** markdown 본문 (fallback) — 블록 없거나 사용자 편집 시 커넥터가 이걸로 변환. */
  text?: string;
  topic?: string;
  /**
   * 옵션 B: 네이티브 typed-block. 있으면 커넥터(adapter._adapt_native_problem)가
   * markdown 재분해 없이 *그대로* parse_ocr_response 에 넘겨 testchange 변환과 일치.
   */
  contents?: EngineBlock[];
  /** 보기 (ChoiceGroup) — contents 와 함께 emit. 서술형이면 생략. */
  choices?: Array<{ number: number; contents: EngineBlock[] }>;
  /**
   * D3: 소문항 (1)(2) — 커넥터 adapter._adapt_native_problem 가 재귀 passthrough →
   * content_parser sub_questions → writer 가 소문항별 번호·배점·답란 렌더. 없으면 생략.
   */
  subQuestions?: HwpPayloadProblem[];
  /** 배점. */
  score?: number | string;
  /** 문항 유형 라벨 ("서답형"/"서술형"/…). */
  labelType?: string;
  /**
   * 정답·해설(§44) — showAnswers 일 때만 실음. 마크다운+LaTeX 문자열(엔진 content_parser
   * 가 줄별 블록으로 파싱). answer="③ 5"/"$\frac{4}{3}$", solution=단계별 풀이.
   */
  answer?: string;
  solution?: string;
}

/**
 * 시험지 메타 — 커넥터(adapter.adapt_payload)가 헤더 렌더에 사용. title/subject/
 * grade 는 필수(구버전 호환), 나머지는 고른 템플릿이 쓰는 필드만 optional 로 전달.
 */
export interface HwpPayloadMeta {
  title: string;
  subject: string;
  grade: string;
  schoolName?: string;
  semester?: string;
  examDate?: string;
  examDuration?: string;
  examiner?: string;
  totalScore?: number;
  academyName?: string;
  instructorName?: string;
  conceptNote?: string;
  todayGoal?: string;
  patternName?: string;
  patternStrategy?: string;
}

/**
 * 출력 스타일 — 엔진이 헤더 디자인을 분기. 누락(구버전 웹)이면 커넥터가
 * template="jeongtong" 기본 + 단순 제목 헤더로 폴백(회귀 0).
 */
export interface HwpPayloadStyle {
  /** 인쇄 템플릿 id (pyeongga|jeongtong|modern|workbook|jaseup|yuhyung). */
  template: string;
  /** 강조 색 (#RRGGBB). 빈 문자열이면 엔진이 템플릿 기본 accent 사용. */
  accentColor: string;
  columns: 1 | 2;
  /** 쪽 여백(mm) — 내보내기 시 HWP 에 적용. 없으면 폼/기본 여백 유지. */
  margins?: { top: number; bottom: number; left: number; right: number };
  /** 2단 컬럼 사이 세로 구분선(<hp:colLine>). 1단이면 엔진이 무시. 없으면 false. */
  divider?: boolean;
  /**
   * 폰트팩 글꼴면(face) — 엔진이 header.xml fontfaces 의 바탕/돋움 계열을 이 이름으로 치환.
   * serif=바탕 계열, sans=돋움 계열. system 팩(빈 이름)이면 생략 → 엔진 무변경(함초롬 유지).
   */
  font?: { serif: string; sans: string };
  /**
   * 정답·해설 페이지(§44) — 웹 showAnswers/quickAnswerOnly 토글. showAnswers 면 엔진이
   * 문제 뒤 새 쪽에 '정답 및 해설' 추가. quickAnswerOnly 면 해설 생략(빠른 정답만).
   */
  showAnswers?: boolean;
  quickAnswerOnly?: boolean;
  /**
   * 문항 간 세로 간격(px, §45) — 웹 spacing 프리셋(4/16/32/56/88). 엔진이 빈 줄 높이로 환산.
   * 없으면 엔진 기본 빈 줄(회귀 0). "문항 수 지정"(count) 모드는 미리보기 전용이라 HWP 는 이 값 사용.
   */
  spacing?: number;
  /**
   * 단원명 표시(웹 showChapter 토글, §45) — true 면 엔진이 각 문항 위에 topic(단원명) 라벨.
   * topic 은 문항별 wire 에 이미 포함. 없으면 false(회귀 0).
   */
  showChapter?: boolean;
}

/** 여백 프리셋(mm) — wizardStore PrintOptions.marginPreset 와 매핑. */
const MARGIN_PRESETS: Record<
  string,
  { top: number; bottom: number; left: number; right: number }
> = {
  narrow: { top: 10, bottom: 10, left: 12, right: 12 },
  normal: { top: 12, bottom: 12, left: 15, right: 15 },
  wide: { top: 18, bottom: 15, left: 22, right: 22 },
};

/**
 * 폰트팩 → payload.style.font. HWP face 이름(hwpSerif/hwpSans)이 있을 때만 font 포함.
 * system 팩(빈 이름)이면 빈 객체 → 엔진 무변경(함초롬 유지).
 */
const fontStyleFor = (
  fontPack: FontPackId | undefined,
): Pick<HwpPayloadStyle, "font"> => {
  const fp = getFontPack(fontPack);
  return fp.hwpSerif || fp.hwpSans
    ? { font: { serif: fp.hwpSerif, sans: fp.hwpSans } }
    : {};
};

export interface HwpPayload {
  schema: "v2";
  renderFigures: true;
  meta: HwpPayloadMeta;
  /** 고른 폼(템플릿+accent+단) — 엔진 헤더 재현용. */
  style?: HwpPayloadStyle;
  problems: HwpPayloadProblem[];
}

/** GET /health — 커넥터 실행·엔진 감지. 미실행/타임아웃이면 null. */
export const detectConnector = async (
  timeoutMs = 15000,
): Promise<HwpHealth | null> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/health`, { signal: ctrl.signal });
    if (!res.ok) throw new Error('health failed');
    return (await res.json()) as HwpHealth;
  } catch {
    throw new HwpConnectorError(await connectorAccessMessage());
  } finally { clearTimeout(t); }
};

const SVG_RE = /<svg[\s\S]*?<\/svg>/gi;
const FIGURE_MARKER_RE = /\[그림\s*\d+\]/g;

/**
 * 내보내기 problems(ProblemReview[]) → 커넥터 wire payload(§12-1).
 * markdown 본문 + 객관식 보기 ①…⑤ 한 줄을 text 에 합친다 (커넥터 어댑터가 분리).
 */
export const buildHwpPayload = (
  problems: ProblemReview[],
  meta: PrintMeta,
  exportSource: string,
  printOptions: Pick<
    PrintOptions,
    | "template"
    | "color"
    | "columns"
    | "marginPreset"
    | "columnDivider"
    | "fontPack"
    | "showAnswers"
    | "quickAnswerOnly"
    | "spacing"
    | "showChapter"
  >,
): HwpPayload => ({
  schema: "v2",
  renderFigures: true,
  meta: {
    title: meta.title || "시험지",
    subject: meta.subject || "수학",
    grade: meta.grade || "",
    // 고른 폼이 쓰는 메타만 — 빈 값은 생략(엔진이 placeholder 폴백).
    ...(meta.schoolName ? { schoolName: meta.schoolName } : {}),
    ...(meta.semester ? { semester: meta.semester } : {}),
    ...(meta.examDate ? { examDate: meta.examDate } : {}),
    ...(meta.examDuration ? { examDuration: meta.examDuration } : {}),
    ...(meta.examiner ? { examiner: meta.examiner } : {}),
    ...(typeof meta.totalScore === "number" ? { totalScore: meta.totalScore } : {}),
    ...(meta.academyName ? { academyName: meta.academyName } : {}),
    ...(meta.instructorName ? { instructorName: meta.instructorName } : {}),
    ...(meta.conceptNote ? { conceptNote: meta.conceptNote } : {}),
    ...(meta.todayGoal ? { todayGoal: meta.todayGoal } : {}),
    ...(meta.patternName ? { patternName: meta.patternName } : {}),
    ...(meta.patternStrategy ? { patternStrategy: meta.patternStrategy } : {}),
  },
  style: {
    template: printOptions.template,
    accentColor: printOptions.color || "",
    columns: printOptions.columns,
    margins: MARGIN_PRESETS[printOptions.marginPreset] ?? MARGIN_PRESETS.normal,
    // 2단 컬럼 구분선 — UI 토글(columnDivider). 1단이면 엔진이 무시.
    divider: printOptions.columns === 2 && printOptions.columnDivider,
    // 폰트팩 글꼴면 — system(빈 이름)이면 생략 → 엔진 함초롬 유지.
    ...fontStyleFor(printOptions.fontPack),
    // 정답·해설 페이지(§44) — showAnswers 면 엔진이 문제 뒤 새 쪽에 추가, quickAnswerOnly 면 해설 생략.
    showAnswers: printOptions.showAnswers,
    quickAnswerOnly: printOptions.quickAnswerOnly,
    // 문항 간 세로 간격(§45) — 웹 spacing(px). 엔진이 빈 줄 높이로 환산(count 모드는 미리보기 전용).
    spacing: printOptions.spacing,
    // 단원명 라벨(§45) — showChapter 면 엔진이 각 문항 위에 topic 라벨. topic 은 문항별 wire 에 포함.
    showChapter: printOptions.showChapter,
  },
  problems: problems.map((r, i) => {
    // §33: exportSource 는 현재 항상 "original". digitize 면 original===variant.
    const p = exportSource === "original" ? r.original : r.variant;
    let text = (p.question || "").trim();
    if (Array.isArray(p.choices) && p.choices.length > 0) {
      const line = p.choices
        .map((c, ci) => `${CIRCLED[ci] ?? `(${ci + 1})`} ${c}`)
        .join(" ");
      text = text ? `${text}\n${line}` : line;
    }
    // D8: 그림 마크업/마커는 HWP 본문에 노출 X — markdown fallback 도 블록 경로와 동일 strip.
    text = text
      .replace(SVG_RE, " ")
      .replace(FIGURE_MARKER_RE, " ")
      .replace(/[^\S\n]+/g, " ")
      .trim();
    const wire: HwpPayloadProblem = {
      // D10: 인쇄된 문항 번호 우선 — testchange 가 인쇄 번호를 보존하므로 일치시킨다.
      // 변형·legacy(번호 없음)는 배열 인덱스 fallback.
      number: p.number ?? i + 1,
      text, // fallback — 커넥터가 contents 없을 때만 사용
      ...(p.topic ? { topic: p.topic } : {}),
    };
    // 정답·해설(§44) — showAnswers 일 때만 실음(payload 비대화 방지). p 는 exportSource 로
    // 이미 original/variant 선택됨(원본/변형 일관). 문자열 그대로 — 엔진이 줄별 블록 파싱.
    if (printOptions.showAnswers) {
      if (typeof p.answer === "string" && p.answer.trim()) wire.answer = p.answer;
      if (typeof p.solution === "string" && p.solution.trim())
        wire.solution = p.solution;
    }
    // 옵션 B: 네이티브 블록 있으면 그대로 전달 → 커넥터가 markdown 재분해 없이
    // testchange 파이프라인(parse_ocr_response→build_document→writer)으로 변환.
    Object.assign(wire, problemFigureBlocks(p));
    const score = p.score ?? p.points;
    if (typeof score === 'number') wire.score = p.printedScore ?? score;
    if (p.labelType) wire.labelType = p.labelType;
    return wire;
  }),
});

export const getStoredToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
};

export const setStoredToken = (t: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* localStorage 불가 — 무시 (이 세션만 토큰 미저장) */
  }
};

/** 커넥터 호출 에러 — status 코드 노출(401 페어링 토큰 분기용). */
export class HwpConnectorError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "HwpConnectorError";
    this.status = status;
  }
}

/** POST /convert-json → .hwp/.hwpx Blob. 실패 시 HwpConnectorError. */
export const convertToHwp = async (
  payload: HwpPayload | { header: string; filename: string; questions: EngineQuestion[] },
  token: string,
): Promise<Blob> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Pairing-Token"] = token;
  const res = await fetch(`${BASE}/convert-json`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  }).catch(async () => { throw new HwpConnectorError(await connectorAccessMessage()); });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new HwpConnectorError(err.error || `HTTP ${res.status}`, res.status);
  }
  return res.blob();
};
