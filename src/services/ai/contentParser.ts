/**
 * contentParser.ts — testchange `core/content_parser.py` 정규화 파이프라인의 TS 이식.
 *
 * **배경 (웹 미리보기 = HWP 일치)**: HWP 커넥터(adapter.py `_adapt_native_problem`)는
 * mathgen 네이티브 블록을 *그대로* `parse_ocr_response → _parse_question → _finalize_contents`
 * 에 넘겨 content_parser 전체 파이프라인을 재실행한다 → .hwp 출력은 이미 정규화됨.
 * 반면 웹은 `blocksToMarkdown` 로 *직렬화만* 해 그 정규화를 받지 못해 두 결과가 어긋났다
 * (사용자 보고: `$x$=$-2y+3$` 처럼 쪼개진 수식, 멀티블록 보기 박스 미완 등).
 *
 * → content_parser 의 **display 영향 + 웹 미보유** 변환만 이식한다:
 *   - `_finalize_contents` 값 변환 체인(병합·쉼표분리·정의역분리·확통이탤릭·점라벨로만·
 *     단위로만·한글공백·배점제거) 15 단계
 *   - 박스경계 검출(`_raw_box_end`/`_trailing_question_split`/`_drop_duplicate_box_fragments`)
 *     + `box_member` 태깅 (멀티블록 박스를 한 박스로 그룹핑하기 위해 blocksToMarkdown 이 사용)
 *   - `_parse_choice` 선택지 후처리 체인 (force_geo 전파)
 *
 * **이식하지 않는 것 (의도적)**: forward-split(`_split_inline_latex`/`_split_latex_commands`/
 * `_split_mixed_text_equation`/`_split_underline_markup`) 은 markdown→블록 *역방향* 파싱으로,
 * mathgen OCR 모델이 이미 typed-block 으로 분리해 emit(OCR_PAGE_PROMPT 규칙 1)하므로 불필요.
 * `_emphasize_negation`(볼드+밑줄 플래그)·document 레벨 `_normalize_essay_label_type` 도 제외.
 *
 * **이중정규화 회피**: 이 정규화는 *웹 렌더 파생 경로(`blocksToMarkdown`)에서만* 호출한다.
 * wire payload·저장 `OCRProblem.blocks` 는 네이티브 그대로 두어 커넥터가 단독으로 content_parser
 * 를 돌린다 (단일 source = Python content_parser). 양쪽이 같은 네이티브 블록을 정규화하므로
 * (TS 포팅본 vs Python 원본, golden-file 로 동치 검증) 웹 미리보기가 .hwp 와 일치한다.
 *
 * **mathgen ContentBlock 차이**: testchange ContentBlock 의 `underline`/`bold`/`box_member`
 * 플래그를 mathgen 은 안 둔다(강조는 value 안 `__...__`, 박스는 `<보기>` prefix). 여기선
 * 내부 `NBlock`(optional `boxMember`)만 추가해 박스 그룹핑에 쓰고, 직렬화는 blocksToMarkdown 이
 * `<보기>` prefix + `boxMember` run 으로 렌더한다.
 */

import type { BlockType, ChoiceGroup, ContentBlock } from "../../types/ocrBlocks.js";

/** 정규화 산물 — ContentBlock + 박스 멤버 플래그(blocksToMarkdown 그룹핑용). */
export interface NBlock {
  type: BlockType;
  value: string;
  rows: string[][];
  /** 보기/조건/상자 박스 내부 블록 (`_tag_box_run` 산물). 멀티블록 박스 그룹핑용. */
  boxMember?: boolean;
}

const EQ_TYPES = new Set<BlockType>(["equation", "equation_block"]);
const isEq = (b: NBlock): boolean => EQ_TYPES.has(b.type);

const mk = (type: BlockType, value: string, extra?: Partial<NBlock>): NBlock => ({
  type,
  value,
  rows: [],
  ...extra,
});

// ── Python str 메서드 미러 ─────────────────────────────────────────────
const rstrip = (s: string): string => s.replace(/\s+$/u, "");
const lstrip = (s: string): string => s.replace(/^\s+/u, "");

// ── 정규식 상수 (content_parser.py 와 동치) ──────────────────────────────

// 박스 머리 마커 제거용(_drop_duplicate_box_fragments).
const BOX_MARK_LEAD_RE = /^\s*(?:<\s*(?:상자|조건|보기)\s*>|\[\s*(?:조건|보기)\s*\])\s*/;
const MIN_DUP_BOX_KO = 8;

// 박스 동그라미 불릿 통일 (_normalize_box_circles). ∘(합성연산자)·°·라틴 o·키릴 О 제외.
const BOX_BULLET = "○";
const BOX_CIRCLE_RE = /(?:(?<=\s)|^)[ㅇ●〇◦∙](?=\s)/gu;

// 콤마 분리 변수 항목(_VAR_ITEM_RE).
const VAR_ITEM_RE = /^[A-Za-z](?:[_^]\{?[A-Za-z0-9]+\}?)?$/;

// 점·선·면 기하 라벨 후보(_BARE_UPPER_EQ_RE / _UPPER_LETTERS_RE / 좌표·점이름열).
const BARE_UPPER_EQ_RE = /^[A-Z]{1,4}'*(?:_\{?[A-Za-z0-9]+\}?)?'*$/;
const UPPER_LETTERS_RE = /^[A-Z]+/;
const POINT_COORD_RE = /^([A-Z](?:_\{?[A-Za-z0-9+\-]+\}?)?)\s*((?:\\left)?\(.*)$/su;
const POINT_TOKEN = "[A-Z]'*(?:_\\{?[A-Za-z0-9+\\-]+\\}?)?'*";
const POINT_NAME_SEQ_RE = new RegExp(`^(?:${POINT_TOKEN}\\s*){2,}$`);

// 엄격 기하 키워드(_GEOMETRY_KEYWORDS) — 단일 대문자 로만화 판정.
const GEOMETRY_KEYWORDS = [
  "점", "꼭짓점", "교점", "원점", "중점", "무게중심",
  "삼각형", "사각형", "정사각형", "직사각형", "마름모", "평행사변형", "사다리꼴",
  "선분", "직선", "반직선", "호", "부채꼴",
  "반원", "지름", "반지름",
  "△", "∠", "∆",
];
// 비기하 디코이(_NONGEO_DECOY) — "점"·"호" 부분문자열 오판 차단.
const NONGEO_DECOY = [
  "점수", "관점", "장점", "단점", "요점", "배점", "채점", "만점", "평점", "득점", "감점",
  "지점",
  "기호", "괄호", "번호", "신호", "부호", "보호", "호선", "호출", "구호", "칭호", "호수",
];

// 확통 연산자·확률변수 이탤릭화(_STAT_MATHRM_RE) — 순열 P_ 제외.
const STAT_MATHRM_RE = /\\mathrm\{([XYPEVNZ])\}(?!\s*_)/g;

// 각(angle) 단일 대문자 로만화(_TRIG_ANGLE_RE / _DEG_ANGLE_RE / _ANGLE_CMD_RE).
const TRIG_ANGLE_RE = /(\\(?:cos|sin|tan|cot|sec|csc)\s+)([A-Z])(?![A-Za-z])/g;
const DEG_ANGLE_RE =
  /(?<![A-Za-z\\{])([A-Z])(\s*=\s*\d+(?:\.\d+)?\s*(?:\^\s*\{?\s*\\circ|°))/g;
const ANGLE_CMD_RE = /(\\angle\s+)([A-Z])(?![A-Za-z])/g;

// 행렬 문맥 대문자런 \mathit 보호(_MATRIX_UPPER_RUN_RE).
const MATRIX_UPPER_RUN_RE = /(?<![A-Za-z\\])[A-Z]{2,4}(?![A-Za-z])/g;

// 비기하 단일 대문자 이탤릭화(_NONGEO_SINGLE_MATHRM_RE) — 조합 C·순열 P_ 제외.
const NONGEO_SINGLE_MATHRM_RE = /\\mathrm\{([A-BD-Z])\}(?!\s*_)/g;

// 연산자만 텍스트 판정(_EQ_OP_CHARS).
const EQ_OP_CHARS = new Set("=<>≤≥≠≈≡≅∼+-±×÷·∘*/^∓→↔⇒⇔".split(""));

// 괄호 범위 병합(_PAREN_RANGE_RE).
const PAREN_RANGE_RE = /^\(.*\)$/;

// 텍스트-수식 조각 병합(_FRAG_*).
const FRAG_RELOP = "(?:=|<|>|≤|≥|≠|\\\\le|\\\\leq|\\\\ge|\\\\geq|\\\\neq|\\\\ne)";
const FRAG_ATOM = "[-+]?[0-9A-Za-z][0-9A-Za-z._^{}]*";
const FRAG_TAIL_RE = new RegExp(
  `(?<![가-힣A-Za-z0-9])((?:${FRAG_ATOM}\\s*)?${FRAG_RELOP}\\s*)$`,
);
const FRAG_HEAD_RE = new RegExp(`^(\\s*${FRAG_RELOP}\\s*${FRAG_ATOM})(?![0-9A-Za-z])`);
const UNICODE_RELOP: ReadonlyArray<[string, string]> = [
  ["≤", " \\leq "],
  ["≥", " \\geq "],
  ["≠", " \\neq "],
];

// 수식 끝 정의역 나열(_TRAILING_DOMAIN_RE).
const TRAILING_DOMAIN_RE =
  /(?:\\quad|\\qquad|\\,|\\;|\\:|\\!|\\ |~|\s)+\(\s*(?<body>[^()]*(?:,[^()]*)+)\)\s*$/;

// 수식 조각 양끝 간격명령 제거(_EDGE_MATH_SPACE_RE).
const EDGE_MATH_SPACE_RE = /^(?:\\(?:qquad|quad|[,;:! ])\s*)+|(?:\\(?:qquad|quad|[,;:! ])\s*)+$/g;

// 산술 term 판정(_LIST_TERM_RE) — fullmatch.
const LIST_TERM_RE = /^[A-Za-z0-9_^{}+\-*/.\s]+$/;

// 배점 텍스트 제거(_SCORE_TEXT_RE) + 쪼개진 배점([+EQ+점]).
const SCORE_TEXT_RE = /\s*[[(]\s*(?:총\s*)?\d+(?:\.\d+)?\s*점\s*(?:,[^\])]*)?[\])]\s*/g;
const OPEN_SCORE_BRACKET_RE = /[[(]\s*(?:총\s*)?$/;
const CLOSE_SCORE_JEOM_RE = /^\s*점\s*(?:,[^\])]*)?[\])]/;
const PURE_NUM_FULL_RE = /^\d+(?:\.\d+)?$/;

// 박스 머리 마커(_RAW_BOX_MARK_RE) — <보기>에서·중 참조어는 제외.
const RAW_BOX_MARK_RE =
  /^\s*(?:<\s*상자\s*>|(?:<\s*(?:조건|보기)\s*>|\[\s*(?:조건|보기)\s*\])(?![가-힣])(?!\s+(?:중에서|에서|중)(?=[\s,.?]|$)))/;
const BARE_ITEM_LABEL_RE = /^(?:[ㄱ-ㅎ]\s*\.?|[（(]\s*[가-힣]\s*[)）]|\d+\s*[.)])\s*$/;
const NEXT_ITEM_START_RE = /^\s*(?:[•·▪◦○ㅇ]\s*)?(?:[ㄱ-ㅎ]\s*\.|[（(]\s*[가-힣]\s*[)）])/;
const ITEM_LEAD_RE = /^(?:[ㄱ-ㅎ]\s*\.|[（(]\s*[가-힣]\s*[)）])/;
const INNER_ITEM_LABEL_RE = /[•·▪◦○〇ㅇ]\s*(?:[ㄱ-ㅎ]\s*\.|[（(]\s*[가-힣]\s*[)）])/;
// 비-global(test 용) + global(matchAll 용) 분리 — JS g-regex 의 lastIndex stateful 버그 회피.
const INNER_LABEL_ANY_RE =
  /(?:[•·▪◦○〇ㅇ]\s*|(?<=[.．])\s+)(?:[ㄱ-ㅎ]\s*\.|[（(]\s*[가-힣]\s*[)）])/;
const INNER_LABEL_ANY_G = new RegExp(INNER_LABEL_ANY_RE.source, "g");
const BULLET_LEAD_RE = /^[•·▪◦○〇]/;
const INNER_BULLET_RE = /[•·▪◦○〇]\s/;
const QUESTION_END_RE =
  /(?:값은|개수는|합은|최[솟댓]값은|것은|무엇)\s*[?？]|[?？]\s*$|구하(?:시오|여라|라)|쓰시오|서술하(?:시오|여라)|기술하(?:시오|여라)/;
const REL_CMD_RE = /^\\(?:le|ge|leq|geq|ne|neq|fallingdotseq)\b/;
const TOPLEVEL_REL_RE =
  /=|<|>|\\le\b|\\leq\b|\\ge\b|\\geq\b|\\neq\b|\\ne\b|\\in\b|\\to\b|\\mapsto\b|\\parallel\b|\\perp\b|\\equiv\b|\\sim\b|\\cong\b|→|:|≤|≥|≠|∥|⊥|∽|≡|⫽/;

// 한글 끝 + 수식 공백(_space_hangul_before_eq).
const HANGUL_TAIL_RE = /[가-힣]$/;
const ORDINAL_JE_RE = /(?:^|[^가-힣])제$/;
const PURE_NUM_RE = /^\d+$/;

// 문맥 단위 로만화(_romanize_context_units).
const CTX_UNIT_SET = new Set([
  "g", "kg", "mg", "cm", "mm", "km", "m", "L", "mL", "dL", "kL", "min", "s", "h", "t", "℃",
]);
const UNIT_CTX_RE = /단위[가는은를로이]*\s*$/;

// ── 헬퍼 술어 ───────────────────────────────────────────────────────────

/** 문자열 전체가 한 쌍 괄호로 감싸였는지(_wrapped_in_parens). */
const wrappedInParens = (v: string): boolean => {
  if (!(v.startsWith("(") && v.endsWith(")"))) return false;
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0 && i !== v.length - 1) return false;
    }
  }
  return depth === 0;
};

/** 텍스트가 연산자/관계기호만으로 이뤄졌는지(_is_operator_only) — 내부 공백 허용. */
const isOperatorOnly = (text: string): boolean => {
  const s = (text || "").replace(/\s+/g, "");
  return s.length > 0 && [...s].every((c) => EQ_OP_CHARS.has(c));
};

/** blocks 에 엄격 기하 키워드가 있으면 true(_has_geometry_context) — 디코이 제거 후 판정. */
export const hasGeometryContext = (blocks: NBlock[]): boolean => {
  let text = blocks.map((b) => String(b.value ?? "")).join(" ");
  for (const decoy of NONGEO_DECOY) text = text.split(decoy).join("");
  return GEOMETRY_KEYWORDS.some((k) => text.includes(k));
};

/** 산술 term(_is_list_term) — 변수·숫자·첨자+사칙연산만, 영숫자 1+ 포함. */
const isListTerm = (p: string): boolean => {
  const s = (p || "").trim();
  return !!s && LIST_TERM_RE.test(s) && /[A-Za-z0-9]/.test(s);
};

/** 단순 원자(_is_atom_item) — 변수·숫자·복소수·그리스·accent라벨·수열집합·줄임표. */
const isAtomItem = (p: string): boolean => {
  let s = (p || "").trim();
  s = s.replace(/^(?:\\[\s,;:])+\s*/, "").trim(); // 선행 얇은공백 명령만 제거(\overline 보존)
  return (
    VAR_ITEM_RE.test(s) ||
    /^[-+]?\d+(?:\.\d+)?$/.test(s) ||
    (/\d/.test(s) && /^[0-9+\-.\si]+$/.test(s)) ||
    /^\\[A-Za-z]+(?:[_^]\{?[A-Za-z0-9]+\}?)?$/.test(s) ||
    /^\\(?:overline|overarc|vec|hat|bar|widehat|dot|ddot|tilde)\{[A-Za-z0-9']+\}$/.test(s) ||
    /^\\\{.+\\\}$/.test(s) ||
    /^(?:\\c?dots|\\ldots|⋯|\.\.\.)$/.test(s)
  );
};

/** 괄호·중괄호 내용 제거 후 최상위 관계연산자 유무(_has_toplevel_relation, 콤마분리 가드용). */
const hasToplevelRelation = (p: string): boolean => {
  let s = p || "";
  for (let i = 0; i < 6; i++) {
    const s2 = s.replace(/\([^()]*\)|\{[^{}]*\}/g, "");
    if (s2 === s) break;
    s = s2;
  }
  return TOPLEVEL_REL_RE.test(s);
};

/** 최상위 레벨 쉼표에서 분리(_split_at_top_level_commas). */
const splitAtTopLevelCommas = (s: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
};

/** 수식에 괄호 밖(최상위) 관계연산자가 있으면 true(_has_top_level_relation, 박스 질문분리용). */
const hasTopLevelRelationScan = (eq: string): boolean => {
  let depth = 0;
  let i = 0;
  while (i < eq.length) {
    const c = eq[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (c === "=" || c === "<" || c === ">" || c === "≤" || c === "≥" || c === "≠") return true;
      if (c === "\\" && REL_CMD_RE.test(eq.slice(i))) return true;
    }
    i += 1;
  }
  return false;
};

// ── 경량 per-block 정규화 (_parse_content_block 의 네이티브 블록 해당분) ──

/** 박스 단독 원형 불릿을 표준 ○ 로(_normalize_box_circles). */
const normalizeBoxCircles = (text: string): string => text.replace(BOX_CIRCLE_RE, BOX_BULLET);

/**
 * 네이티브 블록 경량 정규화(_parse_content_block 의 네이티브 블록 해당분) — box circles +
 * 선두 박스 마커 분리 + cases 강등. 1~2 블록 반환(마커 분리 시 2). mathgen 모델이 이미
 * typed-block 으로 분리하므로 forward-split($/LaTeX/혼합)은 불필요 — 마커 분리만 이식.
 */
const lightParseBlock = (b: ContentBlock): NBlock[] => {
  let type = b.type;
  let value = typeof b.value === "string" ? b.value : "";
  if (type === "text" && value) {
    value = normalizeBoxCircles(value);
    // 선두 박스 마커(<보기>/<조건>/<상자>)를 자기 text 블록으로 분리(_split_box_marker_prefix)
    // — Python 파서와 블록 경계 일치. (마커의 닫는 > 가 후속 처리에 끌려가지 않게.)
    const m = RAW_BOX_MARK_RE.exec(value);
    if (m && m[0].length > 0) {
      const rest = value.slice(m[0].length);
      const out: NBlock[] = [mk("text", value.slice(0, m[0].length))];
      if (rest.trim()) out.push(mk("text", rest));
      return out;
    }
    return [mk("text", value)];
  }
  // 연립방정식 cases 는 인라인으로 강등 — 문장 중간 연립이 가운데정렬 블록으로 떠 문장이
  // 끊기던 것 방지(content_parser.py:256).
  if (type === "equation_block" && value.includes("\\begin{cases}")) type = "equation";
  const rows = Array.isArray(b.rows) ? b.rows : [];
  return [{ type, value, rows }];
};

// ── _finalize_contents 값 변환 체인 (15 단계) ────────────────────────────

/** 수식 끝 \quad (x=0,1,⋯,50) 정의역을 개별 수식+텍스트로 분리(_split_trailing_domain). */
const splitTrailingDomain = (blocks: NBlock[]): NBlock[] => {
  const out: NBlock[] = [];
  for (const b of blocks) {
    if (b.type === "equation" && b.value) {
      const v = rstrip(b.value);
      const m = TRAILING_DOMAIN_RE.exec(v);
      const body = m?.groups?.body;
      if (m && body !== undefined && /\\c?dots|\\ldots|\.\.\.|⋯|=/.test(body)) {
        const main = rstrip(v.slice(0, m.index));
        const items = splitAtTopLevelCommas(body)
          .map((p) => p.replace(/^(?:\\[,;:!\s]|\\quad|~|\s)+/, "").trim())
          .filter((it) => it);
        if (main && items.length >= 2) {
          out.push(mk(b.type, main));
          out.push(mk("text", " ("));
          items.forEach((it, i) => {
            if (i > 0) out.push(mk("text", ", "));
            out.push(mk("equation", it));
          });
          out.push(mk("text", ")"));
          continue;
        }
      }
    }
    out.push(b);
  }
  return out;
};

/** 쉼표 든 수식 한 블록을 규칙대로 분해(_split_one_eq_commas). 처리했으면 true. */
const stripEdgeMathSpace = (p: string): string =>
  (p || "").trim().replace(EDGE_MATH_SPACE_RE, "").trim();

const splitOneEqCommas = (block: NBlock, result: NBlock[]): boolean => {
  const v = (block.value || "").trim();
  const paren = wrappedInParens(v);
  const inner = paren ? v.slice(1, -1) : v;
  const parts = splitAtTopLevelCommas(inner).map(stripEdgeMathSpace).filter((s) => s);
  if (parts.length < 2) return false;
  const allVars = parts.every((p) => VAR_ITEM_RE.test(p));
  if (allVars) {
    if (paren) result.push(mk("text", "("));
    parts.forEach((p, i) => {
      if (i > 0) result.push(mk("text", ", "));
      result.push(mk("equation", p));
    });
    if (paren) result.push(mk("text", ")"));
    return true;
  }
  if (paren) {
    // 좌표/수식 묶음(숫자 포함) → 한 수식 유지, 쉼표 뒤 ~ 강제공백.
    result.push(mk("equation", v.replace(/,\s*/g, ",~")));
    return true;
  }
  // 스푸리어스 쉼표 방어 — 원자도 관계식도 list-term 도 아닌 항목이 하나라도 있으면 곱셈 잡음.
  if (parts.some((p) => !isAtomItem(p) && !hasToplevelRelation(p) && !isListTerm(p))) {
    result.push(mk("equation", parts.join(" ")));
    return true;
  }
  parts.forEach((p, i) => {
    if (i > 0) result.push(mk("text", ", "));
    result.push(mk("equation", p));
  });
  return true;
};

/** 쉼표 구분 독립 수식 분리(_split_comma_equations). */
const splitCommaEquations = (blocks: NBlock[]): NBlock[] => {
  const result: NBlock[] = [];
  for (const block of blocks) {
    if (block.type === "equation" && (block.value || "").includes(",")) {
      if (splitOneEqCommas(block, result)) continue;
    }
    result.push(block);
  }
  return result;
};

/** eq·(연산자 text)·eq 로 쪼개진 수식을 한 객체로 병합(_merge_operator_split_equations). */
const mergeOperatorSplitEquations = (blocks: NBlock[]): NBlock[] => {
  const out: NBlock[] = [];
  let i = 0;
  const n = blocks.length;
  while (i < n) {
    const b = blocks[i];
    if (b.type === "equation") {
      const parts: string[] = [(b.value || "").trim()];
      let j = i + 1;
      while (
        j + 1 < n &&
        blocks[j].type === "text" &&
        isOperatorOnly(blocks[j].value) &&
        blocks[j + 1].type === "equation"
      ) {
        parts.push((blocks[j].value || "").trim());
        parts.push((blocks[j + 1].value || "").trim());
        j += 2;
      }
      if (parts.length > 1) {
        out.push(mk("equation", parts.filter((p) => p).join(" ")));
        i = j;
        continue;
      }
    }
    out.push(b);
    i += 1;
  }
  return out;
};

/** 병합 수식 안 유니코드 부등호 → LaTeX 명령 + 공백 정규화(_normalize_frag_relops). */
const normalizeFragRelops = (s: string): string => {
  let out = s;
  for (const [u, l] of UNICODE_RELOP) out = out.split(u).join(l);
  return out.replace(/\s+/g, " ").trim();
};

/** TEXT(꼬리부등식)·EQ·TEXT(머리부등식) 병합(_merge_text_eq_fragments). */
const mergeTextEqFragments = (blocks: NBlock[]): NBlock[] => {
  const out: NBlock[] = [];
  let i = 0;
  const n = blocks.length;
  while (i < n) {
    const b = blocks[i];
    if (b.type === "equation") {
      let prefix = "";
      const last = out[out.length - 1];
      if (last && last.type === "text" && last.value) {
        const m = FRAG_TAIL_RE.exec(last.value);
        if (m) {
          prefix = m[1];
          out[out.length - 1] = mk("text", last.value.slice(0, m.index), {
            boxMember: last.boxMember,
          });
        }
      }
      let suffix = "";
      const nxt = blocks[i + 1];
      if (i + 1 < n && nxt && nxt.type === "text" && nxt.value) {
        const m2 = FRAG_HEAD_RE.exec(nxt.value);
        if (m2) {
          suffix = m2[1];
          blocks[i + 1] = mk("text", nxt.value.slice(m2[1].length), { boxMember: nxt.boxMember });
        }
      }
      if (prefix || suffix) {
        const merged = normalizeFragRelops(`${prefix} ${b.value || ""} ${suffix}`);
        out.push(mk("equation", merged));
        // 앞 텍스트가 비었으면 제거(이중 공백 방지).
        if (
          out.length >= 2 &&
          out[out.length - 2].type === "text" &&
          !(out[out.length - 2].value || "").trim()
        ) {
          out.splice(out.length - 2, 1);
        }
        i += 1;
        continue;
      }
    }
    out.push(b);
    i += 1;
  }
  return out;
};

/** TEXT 끝 {} + _/^ 로 시작하는 EQ → 좌측첨자 빈그룹 복원(_merge_empty_group_subscript). */
const mergeEmptyGroupSubscript = (blocks: NBlock[]): NBlock[] => {
  const out: NBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const nxt = i + 1 < blocks.length ? blocks[i + 1] : null;
    if (
      b.type === "text" &&
      rstrip(b.value || "").endsWith("{}") &&
      nxt &&
      isEq(nxt) &&
      (lstrip(nxt.value || "").startsWith("_") || lstrip(nxt.value || "").startsWith("^"))
    ) {
      const movedNxt = mk(nxt.type, "{}" + (nxt.value || ""), { boxMember: nxt.boxMember });
      const trimmed = rstrip(b.value || "").slice(0, -2);
      if (trimmed.trim()) out.push(mk("text", trimmed, { boxMember: b.boxMember }));
      out.push(movedNxt);
      i += 2;
      continue;
    }
    out.push(b);
    i += 1;
  }
  return out;
};

/** 온도 단위 °C/°F (EQ+TEXT"°"+EQ"C") 한 수식 병합(_merge_degree_temp_units). */
const mergeDegreeTempUnits = (blocks: NBlock[]): NBlock[] => {
  const out: NBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const nxt = i + 1 < blocks.length ? blocks[i + 1] : null;
    const nn = i + 2 < blocks.length ? blocks[i + 2] : null;
    if (
      isEq(b) &&
      nxt &&
      nn &&
      nxt.type === "text" &&
      (nxt.value || "").trim() === "°" &&
      isEq(nn) &&
      ((nn.value || "").trim() === "C" || (nn.value || "").trim() === "F")
    ) {
      const unit = (nn.value || "").trim();
      out.push(mk("equation", rstrip(b.value || "") + "°\\mathrm{" + unit + "}"));
      i += 3;
      continue;
    }
    out.push(b);
    i += 1;
  }
  return out;
};

/** 앞 수식 + 인접 괄호범위 (n=1,2,3⋯) 을 ~ 공백으로 병합(_merge_paren_range). */
const mergeParenRange = (blocks: NBlock[]): NBlock[] => {
  const out: NBlock[] = [];
  for (const b of blocks) {
    if (typeof b.value !== "string") {
      out.push(b);
      continue;
    }
    const v = (b.value || "").trim();
    if (
      b.type === "equation" &&
      PAREN_RANGE_RE.test(v) &&
      v.includes("=") &&
      (v.includes(",") || v.includes("cdots") || v.includes("dots") || v.includes("⋯"))
    ) {
      let j = out.length - 1;
      if (j >= 0 && out[j].type === "text" && !(out[j].value || "").trim()) j -= 1;
      if (j >= 0 && isEq(out[j])) {
        out[j] = mk(out[j].type, rstrip(out[j].value || "") + " ~ " + v, {
          boxMember: out[j].boxMember,
        });
        out.length = j + 1;
        continue;
      }
    }
    out.push(b);
  }
  return out;
};

/** 쪼개진 배점 [ + EQ(숫자) + 점] 제거(_strip_split_score). */
const stripSplitScore = (blocks: NBlock[]): NBlock[] => {
  const out: NBlock[] = [];
  let i = 0;
  const n = blocks.length;
  while (i < n) {
    if (i + 2 < n) {
      const t1 = blocks[i];
      const eq = blocks[i + 1];
      const t2 = blocks[i + 2];
      if (
        t1.type === "text" &&
        t2.type === "text" &&
        isEq(eq) &&
        PURE_NUM_FULL_RE.test((eq.value || "").trim()) &&
        OPEN_SCORE_BRACKET_RE.test(t1.value || "") &&
        CLOSE_SCORE_JEOM_RE.test(t2.value || "")
      ) {
        const nv1 = rstrip((t1.value || "").replace(OPEN_SCORE_BRACKET_RE, ""));
        const nv2 = lstrip((t2.value || "").replace(CLOSE_SCORE_JEOM_RE, ""));
        if (nv1.trim()) out.push(mk("text", nv1, { boxMember: t1.boxMember }));
        if (nv2.trim()) out.push(mk("text", nv2, { boxMember: t2.boxMember }));
        i += 3;
        continue;
      }
    }
    out.push(blocks[i]);
    i += 1;
  }
  return out;
};

/** 텍스트 [N점] 배점 제거(_strip_score_text) — 박스 머리 이후 블록은 보호. */
const stripScoreText = (blocks: NBlock[]): NBlock[] => {
  let boxI = blocks.findIndex((b) => b.type === "text" && RAW_BOX_MARK_RE.test(b.value || ""));
  if (boxI === -1) boxI = blocks.length;
  const pre = stripSplitScore(blocks.slice(0, boxI));
  const box = blocks.slice(boxI);
  const result: NBlock[] = [];
  for (const block of pre) {
    if (block.type === "text") {
      const cleaned = (block.value || "").replace(SCORE_TEXT_RE, "");
      if (cleaned.trim()) result.push(mk("text", cleaned, { boxMember: block.boxMember }));
    } else {
      result.push(block);
    }
  }
  return result.concat(box);
};

/** 확통 연산자 \mathrm 벗겨 이탤릭(_italicize_stat_operators) — 기하 문맥이면 스킵. */
const italicizeStatOperators = (blocks: NBlock[], forceGeo = false): NBlock[] => {
  if (forceGeo || hasGeometryContext(blocks)) return blocks;
  return blocks.map((b) => {
    if (isEq(b) && b.value && b.value.includes("\\mathrm")) {
      const nv = b.value.replace(STAT_MATHRM_RE, "$1");
      if (nv !== b.value) return mk(b.type, nv, { boxMember: b.boxMember });
    }
    return b;
  });
};

/** 기하 점/선/면 이름 로만체 강제(_romanize_point_names). 행렬 문맥이면 \mathit 명시. */
const romanizePointNames = (blocks: NBlock[], forceGeo = false): NBlock[] => {
  const joinedTxt = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.value || "")
    .join("");
  if (joinedTxt.includes("행렬")) {
    return blocks.map((b) => {
      if (b.type === "equation" && b.value && !b.value.includes("\\math")) {
        const nv = b.value.replace(MATRIX_UPPER_RUN_RE, (mm) => "\\mathit{" + mm + "}");
        if (nv !== b.value) return mk(b.type, nv, { boxMember: b.boxMember });
      }
      return b;
    });
  }
  const hasGeo = forceGeo || hasGeometryContext(blocks);
  const out: NBlock[] = [];
  for (const b of blocks) {
    if (b.type === "equation") {
      const v = (b.value || "").trim();
      if (v && !v.includes("\\math") && BARE_UPPER_EQ_RE.test(v)) {
        const m = UPPER_LETTERS_RE.exec(v);
        const nLetters = m ? m[0].length : 0;
        if (nLetters >= 2 || (nLetters === 1 && hasGeo)) {
          out.push(mk("equation", `\\mathrm{${v}}`, { boxMember: b.boxMember }));
          continue;
        }
      }
      if (v && !v.includes("\\math") && hasGeo && POINT_NAME_SEQ_RE.test(v)) {
        out.push(mk("equation", `\\mathrm{${v}}`, { boxMember: b.boxMember }));
        continue;
      }
      const mc = hasGeo && v && !v.includes("\\math") ? POINT_COORD_RE.exec(v) : null;
      if (mc && mc[2].includes(",")) {
        out.push(
          mk("equation", `\\mathrm{${mc[1]}}\\mathit{${mc[2]}}`, { boxMember: b.boxMember }),
        );
        continue;
      }
    }
    out.push(b);
  }
  return out;
};

/** 비기하 단일 대문자 \mathrm 벗겨 이탤릭(_italicize_nongeo_single_letters). */
const italicizeNongeoSingleLetters = (blocks: NBlock[], forceGeo = false): NBlock[] => {
  if (forceGeo || hasGeometryContext(blocks)) return blocks;
  return blocks.map((b) => {
    if (isEq(b) && b.value && b.value.includes("\\mathrm")) {
      const nv = b.value.replace(NONGEO_SINGLE_MATHRM_RE, "$1");
      if (nv !== b.value) return mk(b.type, nv, { boxMember: b.boxMember });
    }
    return b;
  });
};

/** 각(angle) 단일 대문자 로만체화(_romanize_angle_letters). */
const romanizeAngleLetters = (blocks: NBlock[]): NBlock[] =>
  blocks.map((b) => {
    if (isEq(b) && b.value) {
      let v = b.value.replace(TRIG_ANGLE_RE, (_m, p1, p2) => p1 + "\\mathrm{" + p2 + "}");
      v = v.replace(DEG_ANGLE_RE, (_m, p1, p2) => "\\mathrm{" + p1 + "}" + p2);
      v = v.replace(ANGLE_CMD_RE, (_m, p1, p2) => p1 + "\\mathrm{" + p2 + "}");
      if (v !== b.value) return mk(b.type, v, { boxMember: b.boxMember });
    }
    return b;
  });

/** '단위는 g' 문맥 직후 단독 단위 수식 로만화(_romanize_context_units). */
const romanizeContextUnits = (blocks: NBlock[]): NBlock[] => {
  const out = blocks.map((b) => ({ ...b }));
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (!isEq(b)) continue;
    const u = (b.value || "").trim();
    if (!CTX_UNIT_SET.has(u) || u.startsWith("\\mathrm")) continue;
    let prevTxt: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (out[j].type === "text" && (out[j].value || "").trim()) {
        prevTxt = out[j].value;
        break;
      }
    }
    if (prevTxt && UNIT_CTX_RE.test(rstrip(prevTxt))) b.value = "\\mathrm{" + u + "}";
  }
  return out;
};

/** TEXT(…한글) + EQ 경계 공백 1칸(_space_hangul_before_eq) — 제N사분면 예외. */
const spaceHangulBeforeEq = (blocks: NBlock[]): NBlock[] => {
  const out = blocks.map((b) => ({ ...b }));
  for (let i = 0; i < out.length - 1; i++) {
    const b = out[i];
    const nxt = out[i + 1];
    if (b.type === "text" && isEq(nxt) && b.value && HANGUL_TAIL_RE.test(b.value)) {
      if (ORDINAL_JE_RE.test(b.value) && PURE_NUM_RE.test((nxt.value || "").trim())) continue;
      b.value = b.value + " ";
    }
  }
  return out;
};

/** 마지막 TEXT 꼬리 공백 제거(_rstrip_last_text). */
const rstripLastText = (blocks: NBlock[]): NBlock[] => {
  if (blocks.length === 0) return blocks;
  const last = blocks[blocks.length - 1];
  if (last.type === "text" && (last.value || "")) {
    const v = rstrip(last.value);
    if (v) {
      const copy = blocks.slice();
      copy[copy.length - 1] = mk("text", v, { boxMember: last.boxMember });
      return copy;
    }
    return blocks.slice(0, -1);
  }
  return blocks;
};

/** 발문 본문 후처리 파이프라인(_finalize_contents) — 순서 보존 CRITICAL. */
const finalizeContents = (input: NBlock[]): NBlock[] => {
  let blocks = input;
  blocks = splitTrailingDomain(blocks);
  blocks = splitCommaEquations(blocks);
  blocks = mergeOperatorSplitEquations(blocks);
  blocks = mergeTextEqFragments(blocks);
  blocks = mergeEmptyGroupSubscript(blocks);
  blocks = mergeDegreeTempUnits(blocks);
  blocks = mergeParenRange(blocks);
  blocks = stripScoreText(blocks); // 기하 판정 앞 — "점"(배점) vs "점"(point) 충돌 방지
  blocks = italicizeStatOperators(blocks);
  blocks = romanizePointNames(blocks);
  blocks = italicizeNongeoSingleLetters(blocks);
  blocks = romanizeAngleLetters(blocks);
  blocks = romanizeContextUnits(blocks);
  blocks = spaceHangulBeforeEq(blocks);
  blocks = rstripLastText(blocks);
  return blocks;
};

// ── 박스경계 검출 ────────────────────────────────────────────────────────

/** 발문 본문 중복 박스 조각 제거(_drop_duplicate_box_fragments). */
const dropDuplicateBoxFragments = (raw: ContentBlock[]): ContentBlock[] => {
  const ko = (s: string): string => (s || "").replace(/[^가-힣]/g, "");
  const dropIdx = new Set<number>();
  raw.forEach((bd, i) => {
    if (bd.type !== "text") return;
    const val = bd.value || "";
    if (!BOX_MARK_LEAD_RE.test(val)) return;
    const boxKo = ko(val.replace(BOX_MARK_LEAD_RE, ""));
    if (boxKo.length < MIN_DUP_BOX_KO) return;
    const othersKo = raw
      .filter((b, j) => j !== i && b.type === "text")
      .map((b) => ko(b.value || ""))
      .join("");
    if (othersKo.includes(boxKo)) dropIdx.add(i);
  });
  if (dropIdx.size === 0) return raw;
  return raw.filter((_bd, i) => !dropIdx.has(i));
};

/** 라벨 조건박스 뒤 질문 발문 시작 raw 인덱스(_trailing_question_split). */
const trailingQuestionSplit = (raws: ContentBlock[], i: number): number | null => {
  const mk0 = RAW_BOX_MARK_RE.exec(raws[i].value || "");
  const mrest = mk0 ? (raws[i].value || "").slice(mk0[0].length).trim() : "";
  let lastLabel: number | null = ITEM_LEAD_RE.test(mrest) ? i : null;
  for (let j = i + 1; j < raws.length; j++) {
    if (raws[j].type === "text" && INNER_ITEM_LABEL_RE.test(raws[j].value || "")) lastLabel = j;
  }
  if (lastLabel === null) return null;
  let q: number | null = null;
  for (let j = raws.length - 1; j > lastLabel; j--) {
    if (raws[j].type === "text" && QUESTION_END_RE.test(raws[j].value || "")) {
      q = j;
      break;
    }
  }
  if (q === null) return null;
  let start = q;
  while (start - 1 > lastLabel) {
    const prev = raws[start - 1];
    if (
      (prev.type === "equation" || prev.type === "equation_block") &&
      !hasTopLevelRelationScan(prev.value || "")
    ) {
      start -= 1;
    } else {
      break;
    }
  }
  if (start <= lastLabel + 1) return null;
  return start;
};

/** 자기완결 박스 뒤 발문 연속 시작 raw 인덱스(_raw_box_end). 없으면 null. */
const rawBoxEnd = (raws: ContentBlock[]): number | null => {
  for (let i = 0; i < raws.length; i++) {
    const bd = raws[i];
    if (bd.type !== "text") continue;
    const v = bd.value || "";
    const m = RAW_BOX_MARK_RE.exec(v);
    if (!m) continue;
    const rest = v.slice(m[0].length).trim();
    if (rest && !BARE_ITEM_LABEL_RE.test(rest) && i + 1 < raws.length) {
      const nxt = raws[i + 1];
      // #14 변종: 다음 raw 가 항목 라벨/불릿으로 시작하면 박스 연속(분리 금지).
      if (nxt.type === "text" && NEXT_ITEM_START_RE.test(nxt.value || "")) return null;
      // 다사중 #13 변종: 첫 항목이 인라인 수식 분리로 쪼개진 다항목 라벨 박스.
      if (ITEM_LEAD_RE.test(rest) && nxt.type === "equation") {
        const labels: number[] = [];
        for (let j = i + 2; j < raws.length; j++) {
          if (raws[j].type === "text" && INNER_LABEL_ANY_RE.test(raws[j].value || "")) labels.push(j);
        }
        if (labels.length > 0) {
          const lastJ = labels[labels.length - 1];
          const lastVal = raws[lastJ].value || "";
          const allM = [...lastVal.matchAll(INNER_LABEL_ANY_G)];
          const lm = allM.length > 0 ? allM[allM.length - 1] : null;
          const after =
            lm && lm.index !== undefined ? lastVal.slice(lm.index + lm[0].length).trim() : "";
          if (after && (after.endsWith(".") || after.endsWith("．")) && lastJ + 1 < raws.length) {
            return lastJ + 1;
          }
          // non-bare ITEM_LEAD 에선 질문분리 안 함(설정문 끼는 케이스 과분리 방지).
          return null;
        }
      }
      // 불릿 항목 박스 변종(경일여중3): 다항목 불릿 박스가 여러 raw 로 쪼개진 것 → 박스 연속.
      if (BULLET_LEAD_RE.test(rest) && nxt.type === "equation") {
        for (let j = i + 2; j < raws.length; j++) {
          if (raws[j].type === "text" && INNER_BULLET_RE.test(raws[j].value || "")) return null;
        }
      }
      // 쉼표 나열 박스 변종(대구동중2 #19): 마커 rest 가 쉼표로 끝나면 나열 미완 → 박스 연속.
      if ((rstrip(rest).endsWith(",") || rstrip(rest).endsWith("，")) && nxt.type === "equation") {
        return null;
      }
      return i + 1;
    }
    // rest 가 항목 라벨 하나뿐/비어도 박스 뒤 질문 발문이 이어지면 분리(대곡고 #10).
    return trailingQuestionSplit(raws, i);
  }
  return null;
};

/** head 안 박스 마커 블록부터 끝까지 boxMember=true(_tag_box_run). */
const tagBoxRun = (blocks: NBlock[]): void => {
  let started = false;
  for (const b of blocks) {
    if (!started && b.type === "text" && RAW_BOX_MARK_RE.test(b.value || "")) started = true;
    if (started) b.boxMember = true;
  }
};

// ── 공개 진입점 ─────────────────────────────────────────────────────────

/**
 * 문항 본문 정규화(_parse_question 의 contents 처리) — 박스경계 분리 + finalize.
 * 입력은 mathgen 네이티브 블록, 출력은 boxMember 태깅된 NBlock[].
 */
export const normalizeContents = (blocks: ContentBlock[]): NBlock[] => {
  let raw = (blocks ?? []).filter((b) => b && typeof b.type === "string");
  raw = dropDuplicateBoxFragments(raw);
  const boxEnd = rawBoxEnd(raw);
  if (boxEnd !== null) {
    const head = finalizeContents(raw.slice(0, boxEnd).flatMap(lightParseBlock));
    const post = finalizeContents(raw.slice(boxEnd).flatMap(lightParseBlock));
    tagBoxRun(head); // 박스 마커~head 끝 = 박스, post = 발문 연속(박스 밖)
    return head.concat(post);
  }
  // box_end===null = (박스 없음) 또는 (박스가 끝까지 이어지는 멀티블록 — 발문 분리 없음).
  // testchange 는 이 경우 box_member 를 안 달지만(HWP writer 가 마커로 박스 식별), 웹은
  // blocksToMarkdown 이 box_member run 으로 멀티블록 박스를 한 blockquote 로 그룹핑하므로
  // 마커~끝을 태깅해야 "박스 미완"(items 유출)이 안 난다. box_member 는 웹 전용(wire 무관).
  const whole = finalizeContents(raw.flatMap(lightParseBlock));
  tagBoxRun(whole);
  return whole;
};

/**
 * 선택지 정규화(_parse_choice 후처리 체인) — finalize 와 *다른 순서/부분집합* + force_geo 전파.
 * parentGeo: 부모(발문) 기하 문맥 → 점 좌표 선택지 로만+이탤릭 처리(대륜중 #1).
 */
export const normalizeChoice = (contents: ContentBlock[], parentGeo = false): NBlock[] => {
  let blocks = (contents ?? [])
    .filter((b) => b && typeof b.type === "string")
    .flatMap(lightParseBlock);
  blocks = splitTrailingDomain(blocks);
  blocks = splitCommaEquations(blocks);
  blocks = mergeOperatorSplitEquations(blocks);
  blocks = mergeTextEqFragments(blocks);
  blocks = mergeDegreeTempUnits(blocks);
  const geo = parentGeo || hasGeometryContext(blocks);
  blocks = italicizeStatOperators(blocks, geo);
  blocks = romanizePointNames(blocks, geo);
  blocks = italicizeNongeoSingleLetters(blocks, geo);
  blocks = romanizeAngleLetters(blocks);
  return blocks;
};

/** 선택지 그룹 일괄 정규화 — parentGeo 는 호출부가 본문에서 산출해 전달. */
export const normalizeChoiceGroups = (
  choices: ChoiceGroup[],
  parentGeo: boolean,
): Array<{ number: number; contents: NBlock[] }> =>
  (choices ?? [])
    .filter((c) => c && Array.isArray(c.contents) && typeof c.number === "number")
    .map((c) => ({ number: c.number, contents: normalizeChoice(c.contents, parentGeo) }));
