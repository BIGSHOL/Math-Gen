/**
 * 네이버 블로그 V4 렌더러 (Phase N+5 — 비활성). mathlab `naver-v4-renderer.ts` carry-over.
 *
 * V4 (학원 분석 블로그 스타일) → 네이버 SmartEditor 붙여넣기용 단순 HTML 변환.
 * 네이버가 외부 HTML 받을 때 schema 변환에서 일부 태그 손실 → 검증된 규칙으로 회피:
 *  - 사용 가능: <h2>, <strong>, <span>, <mark>, <br>, <img>, 1-level <table>
 *  - 리스트는 "• 항목<br>", 줄바꿈은 <br> / 문단 사이 <br><br>
 *  - 색상은 인라인 style (작은따옴표)
 *  - $...$ LaTeX → 유니코드 (네이버 KaTeX 미렌더)
 */

import type { CommentaryResult } from "@app/types/examAnalysis";

export interface NaverV4Meta {
  examTitle: string;
  schoolName: string | null;
  grade: string;
  analyzedAt: string | null;
  /** 학원명 — {학원명} placeholder 치환. null이면 "우리 학원". */
  academyName?: string | null;
}

// ── V4 디자인 토큰 ──
const V4_ACCENT = "#8B4513";
const V4_HIGHLIGHT_YELLOW = "#FFF3BF";
const V4_HIGHLIGHT_PINK = "#FFD8D8";
const V4_HIGHLIGHT_ORANGE = "#FFE8CC";
const V4_HIGHLIGHT_GREEN = "#D8F5A2";

const V4_DIFF_BG = ["#D8F5A2", "#FFF3BF", "#FFE8CC", "#FFD8D8", "#FFCCCC"];
const V4_DIFF_LABELS = ["기본", "표준", "응용", "심화", "최고난도"];

// ── LaTeX → 유니코드 (네이버 호환) ──

const SUPER_MAP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵",
  "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", n: "ⁿ",
};
const SUB_MAP: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅",
  "6": "₆", "7": "₇", "8": "₈", "9": "₉", n: "ₙ", k: "ₖ", i: "ᵢ", j: "ⱼ",
};

const toSuperscript = (s: string): string | null => {
  let out = "";
  for (const ch of s) {
    if (SUPER_MAP[ch] != null) out += SUPER_MAP[ch];
    else return null;
  }
  return out;
};

const toSubscript = (s: string): string | null => {
  let out = "";
  for (const ch of s) {
    if (SUB_MAP[ch] != null) out += SUB_MAP[ch];
    else return null;
  }
  return out;
};

/** $...$ 안 LaTeX를 유니코드/플레인으로. 네이버 KaTeX 미렌더 회피. */
const stripLatexForNaver = (text: string): string => {
  if (!text) return text;
  let out = text.replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => {
    let s = tex;
    s = s.replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)");
    s = s.replace(/\\sqrt\s+(\w)/g, "√$1");
    s = s.replace(/\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1/$2");
    s = s.replace(/\\le\b/g, "≤").replace(/\\ge\b/g, "≥").replace(/\\ne\b/g, "≠");
    s = s.replace(/\\leq\b/g, "≤").replace(/\\geq\b/g, "≥").replace(/\\neq\b/g, "≠");
    s = s.replace(/\\times\b/g, "×").replace(/\\cdot\b/g, "·").replace(/\\div\b/g, "÷");
    s = s.replace(/\\pm\b/g, "±").replace(/\\mp\b/g, "∓").replace(/\\infty\b/g, "∞");
    s = s
      .replace(/\\pi\b/g, "π")
      .replace(/\\theta\b/g, "θ")
      .replace(/\\sigma\b/g, "σ")
      .replace(/\\alpha\b/g, "α")
      .replace(/\\beta\b/g, "β")
      .replace(/\\gamma\b/g, "γ");
    s = s.replace(/\^\{([^{}]+)\}/g, (_, exp) => toSuperscript(exp) ?? `^${exp}`);
    s = s.replace(/\^([0-9+\-=n])/g, (_, exp) => toSuperscript(exp) ?? `^${exp}`);
    s = s.replace(/_\{([^{}]+)\}/g, (_, sub) => toSubscript(sub) ?? `_${sub}`);
    s = s.replace(/_([0-9nkij])/g, (_, sub) => toSubscript(sub) ?? `_${sub}`);
    s = s.replace(/\\\\/g, "");
    s = s.replace(/\\([a-zA-Z]+)/g, "$1");
    s = s.replace(/[{}]/g, "");
    return s.trim();
  });
  out = out.replace(/\$/g, "");
  return out;
};

// ── 학원명 치환 (모듈 레벨 — buildNaverV4Html 진입 시 설정) ──
let _academyReplacement = "우리 학원";

const setAcademyReplacement = (name: string | null | undefined): void => {
  _academyReplacement = name?.trim() || "우리 학원";
};

const stripAcademyNames = (text: string): string => {
  if (!text) return text;
  return text
    .replace(/\{학원명\}/g, _academyReplacement)
    .replace(/갈수학학원/g, _academyReplacement)
    .replace(/갈수학(?!학원)/g, _academyReplacement);
};

const joinKoreanCounters = (text: string): string => {
  if (!text) return text;
  const NBSP = " ";
  return text
    .replace(
      /(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|첫|단|매)\s+(개|명|사람|곳|분|번|줄|문항|점|가지|칸|쪽|마디|학기|과목)/g,
      `$1${NBSP}$2`,
    )
    .replace(
      /(\d+)\s+(개|명|곳|분|번|줄|문항|점|가지|월|일|년|등급|학년|학기)/g,
      `$1${NBSP}$2`,
    );
};

const escapeHtml = (s: string): string => {
  const sanitized = stripAcademyNames(
    stripLatexForNaver(joinKoreanCounters(String(s ?? ""))),
  );
  return sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

/** **bold** → <strong>. LaTeX/학원명 자동 변환됨. */
const md = (text: string): string =>
  escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

// ── 블록 렌더러 ──

const renderH2 = (title: string): string =>
  `<h2 style='font-size: 21px; font-weight: 800; color: #1A1A1A; border-left: 5px solid ${V4_ACCENT}; padding: 4px 0 4px 12px; margin: 36px 0 16px;'>✏ ${escapeHtml(title)}</h2>`;

const renderHeader = (c: CommentaryResult, meta: NaverV4Meta): string => {
  const title = c.v4_exam_overview?.title || meta.examTitle;
  const grade = c.v4_exam_overview?.grade || meta.grade;
  const school = c.v4_exam_overview?.school || meta.schoolName;
  const oneLiner = c.v4_exam_overview?.one_liner;

  const out: string[] = [];
  const schoolGrade = [school, grade].filter(Boolean).join(" · ");
  if (schoolGrade) {
    out.push(
      `<span style='font-size: 12px; color: ${V4_ACCENT}; font-weight: 700; letter-spacing: 0.12em;'>${escapeHtml(schoolGrade)}</span><br>`,
    );
  }
  out.push(
    `<strong style='font-size: 26px; color: #1A1A1A;'>${escapeHtml(title)}</strong><br><br>`,
  );
  if (oneLiner) {
    out.push(`<span style='font-size: 15px; color: #555;'>${md(oneLiner)}</span><br>`);
  }
  return out.join("");
};

const renderExamOverview = (
  o: NonNullable<CommentaryResult["v4_exam_overview"]>,
): string => {
  const lines: Array<[string, string]> = [
    ["📘 시험명", o.title],
    ["🏫 학년 · 학교", o.school ? `${o.grade} · ${o.school}` : o.grade],
    ["📝 문항 · 만점", `${o.total_questions}문항 · ${o.total_points}점`],
    ["📚 출제 범위", o.range],
    ["📊 전체 난이도", o.avg_difficulty_label],
    ["⚡ 최고 난이도", o.peak_difficulty],
  ];
  if (o.essay_summary) lines.push(["✍ 서술형", o.essay_summary]);
  if (o.expected_grade_cut) lines.push(["🎯 예상 등급 컷", o.expected_grade_cut]);

  const overview = lines
    .map(
      ([label, value]) =>
        `<strong style='color: ${V4_ACCENT}; font-size: 15px;'>${escapeHtml(label)}</strong> <span style='font-size: 15px;'>${md(value)}</span><br>`,
    )
    .join("");

  const summary = `<br><mark style='background: ${V4_HIGHLIGHT_YELLOW}; padding: 4px 8px; font-size: 15px;'><strong>💡 한 줄 요약 ▸</strong> ${md(o.one_liner)}</mark><br><br>`;

  return overview + summary;
};

const renderAcademyStrategy = (
  items: NonNullable<CommentaryResult["v4_academy_strategy"]>,
): string =>
  items
    .map((item, i) => {
      const bg = i % 2 === 0 ? V4_HIGHLIGHT_YELLOW : V4_HIGHLIGHT_GREEN;
      return (
        `<mark style='background: ${bg}; padding: 3px 8px; font-size: 17px;'><strong style='color: ${V4_ACCENT};'>${i + 1}. ${escapeHtml(item.title)}</strong></mark><br><br>` +
        `<span style='font-size: 15px;'>${md(item.body)}</span><br><br>`
      );
    })
    .join("");

const renderDifficultyTable = (
  rows: NonNullable<CommentaryResult["v4_difficulty_rows"]>,
): string => {
  const sorted = [...rows].sort((a, b) => {
    const aEssay = String(a.question_number).startsWith("서술");
    const bEssay = String(b.question_number).startsWith("서술");
    if (aEssay && !bEssay) return 1;
    if (!aEssay && bEssay) return -1;
    return (
      (parseInt(String(a.question_number), 10) || 0) -
      (parseInt(String(b.question_number), 10) || 0)
    );
  });

  const headerRow =
    `<tr bgcolor="#F8F8F8">` +
    `<th style="padding: 8px 10px; font-size: 12px; font-weight: 700; color: #555; text-align: left; border-bottom: 2px solid #DDD; width: 70px;">번호</th>` +
    `<th style="padding: 8px 10px; font-size: 12px; font-weight: 700; color: #555; text-align: left; border-bottom: 2px solid #DDD;">단원 · 핵심 개념</th>` +
    `<th style="padding: 8px 10px; font-size: 12px; font-weight: 700; color: #555; text-align: left; border-bottom: 2px solid #DDD; width: 100px;">난이도</th>` +
    `<th style="padding: 8px 10px; font-size: 12px; font-weight: 700; color: #555; text-align: right; border-bottom: 2px solid #DDD; width: 55px;">배점</th>` +
    `</tr>`;

  const dataRows = sorted
    .map((row) => {
      const lv = Number(row.difficulty);
      const validLv = lv >= 1 && lv <= 5 ? lv : 3;
      const bg = V4_DIFF_BG[validLv - 1];
      const diffLabel = V4_DIFF_LABELS[validLv - 1];
      const subLine = row.analysis_short
        ? `<br><span style='font-size: 12px; color: #666;'>↳ ${escapeHtml(row.analysis_short)}</span>`
        : "";
      return (
        `<tr bgcolor="${bg}">` +
        `<td style="padding: 8px 10px; font-size: 14px; font-weight: 700; color: #1A1A1A; border-bottom: 1px solid rgba(0,0,0,0.05); vertical-align: top; white-space: nowrap;">${escapeHtml(String(row.question_number))}</td>` +
        `<td style="padding: 8px 10px; font-size: 13px; color: #2A2A2A; border-bottom: 1px solid rgba(0,0,0,0.05); vertical-align: top; word-break: keep-all;">${escapeHtml(row.topic)}${subLine}</td>` +
        `<td style="padding: 8px 10px; font-size: 13px; font-weight: 600; color: #1A1A1A; border-bottom: 1px solid rgba(0,0,0,0.05); vertical-align: top; white-space: nowrap;">Lv${validLv} <span style='color: #888; font-size: 12px; font-weight: 400;'>${diffLabel}</span></td>` +
        `<td style="padding: 8px 10px; font-size: 14px; font-weight: 700; color: #1A1A1A; text-align: right; border-bottom: 1px solid rgba(0,0,0,0.05); vertical-align: top; white-space: nowrap;">${row.points}점</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #DDD;">` +
    headerRow +
    dataRows +
    `</table><br>`
  );
};

const renderExamFeatures = (
  f: NonNullable<CommentaryResult["v4_exam_features"]>,
): string =>
  `<mark style='background: ${V4_HIGHLIGHT_YELLOW}; padding: 4px 10px; font-size: 18px;'><strong>💡 ${md(f.headline)}</strong></mark><br><br>` +
  `<span style='font-size: 15px;'>${md(f.body)}</span><br><br>`;

const renderMainAnalysis = (
  items: NonNullable<CommentaryResult["v4_main_analysis"]>,
): string =>
  items
    .map(
      (item) =>
        `<strong style='font-size: 17px; color: ${V4_ACCENT};'>◆ ${escapeHtml(item.heading)}</strong><br>` +
        `<span style='font-size: 15px;'>${md(item.body)}</span><br><br>`,
    )
    .join("");

const renderPreviousComparison = (
  c: NonNullable<CommentaryResult["v4_previous_comparison"]>,
): string =>
  `<mark style='background: ${V4_HIGHLIGHT_PINK}; padding: 4px 10px; font-size: 18px;'><strong>📊 ${md(c.headline)}</strong></mark><br><br>` +
  `<span style='font-size: 15px;'>${md(c.body)}</span><br><br>`;

const renderKeyQuestions = (
  items: NonNullable<CommentaryResult["v4_key_questions"]>,
): string =>
  items
    .map(
      (kq) =>
        `<mark style='background: ${V4_HIGHLIGHT_ORANGE}; padding: 3px 8px; font-size: 17px;'><strong>⚡ ${escapeHtml(kq.title)}</strong></mark><br>` +
        `<span style='font-size: 15px;'>${md(kq.body)}</span><br><br>`,
    )
    .join("");

const renderFinalStrategy = (
  rows: NonNullable<CommentaryResult["v4_final_strategy"]>,
): string =>
  rows
    .map(
      (row) =>
        `<strong style='font-size: 17px; color: ${V4_ACCENT};'>▸ ${escapeHtml(row.area)}</strong><br>` +
        `<mark style='background: ${V4_HIGHLIGHT_PINK}; padding: 4px 10px; font-size: 18px;'><strong>현재 상태</strong></mark> <span style='font-size: 15px;'>${md(row.current_status)}</span><br>` +
        `<mark style='background: ${V4_HIGHLIGHT_GREEN}; padding: 4px 10px; font-size: 18px;'><strong>실행 액션</strong></mark> <span style='font-size: 15px;'>${md(row.action)}</span><br><br>`,
    )
    .join("");

const renderFooter = (meta: NaverV4Meta): string => {
  const date = meta.analyzedAt
    ? new Date(meta.analyzedAt).toLocaleDateString("ko-KR")
    : "";
  return `<br><span style='font-size: 11px; color: #888;'>MathGen 분석 · ${escapeHtml(meta.examTitle)}${date ? ` · ${escapeHtml(date)}` : ""}</span><br>`;
};

// ── 메인 빌더 ──

export const buildNaverV4Html = (args: {
  commentary: CommentaryResult;
  meta: NaverV4Meta;
}): string => {
  const { commentary: c, meta } = args;
  setAcademyReplacement(meta.academyName);
  const parts: string[] = [];

  parts.push(renderHeader(c, meta));

  if (c.v4_intro) {
    parts.push(renderH2("들어가며"));
    parts.push(`<span style='font-size: 16px;'>${md(c.v4_intro)}</span><br><br>`);
  }
  if (c.v4_exam_overview) {
    parts.push(renderH2("시험 개요 및 1등급 컷 예상"));
    parts.push(renderExamOverview(c.v4_exam_overview));
  }
  if (c.v4_academy_strategy && c.v4_academy_strategy.length > 0) {
    parts.push(
      renderH2(`1등급 수학을 위한 학원 차별화 전략 (${c.v4_academy_strategy.length}가지)`),
    );
    parts.push(renderAcademyStrategy(c.v4_academy_strategy));
  }
  if (c.v4_difficulty_rows && c.v4_difficulty_rows.length > 0) {
    parts.push(renderH2(`문제 난이도 · 출제 단원 (${c.v4_difficulty_rows.length}문항)`));
    parts.push(renderDifficultyTable(c.v4_difficulty_rows));
  }
  if (c.v4_exam_features) {
    parts.push(renderH2("출제 특징 요약"));
    parts.push(renderExamFeatures(c.v4_exam_features));
  }
  if (c.v4_main_analysis && c.v4_main_analysis.length > 0) {
    parts.push(renderH2("출제 핵심 포인트"));
    parts.push(renderMainAnalysis(c.v4_main_analysis));
  }
  if (c.v4_previous_comparison) {
    parts.push(renderH2("이전 시험과의 비교 · 대조"));
    parts.push(renderPreviousComparison(c.v4_previous_comparison));
  }
  if (c.v4_key_questions && c.v4_key_questions.length > 0) {
    parts.push(renderH2(`주요 문항 분석 (킬러 ${c.v4_key_questions.length}문항)`));
    parts.push(renderKeyQuestions(c.v4_key_questions));
  }
  if (c.v4_final_strategy && c.v4_final_strategy.length > 0) {
    parts.push(renderH2("이번 시험 단원별 피드백"));
    parts.push(renderFinalStrategy(c.v4_final_strategy));
  }

  parts.push(renderFooter(meta));

  return parts.filter(Boolean).join("\n");
};
