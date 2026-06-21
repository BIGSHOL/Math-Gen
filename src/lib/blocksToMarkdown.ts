/**
 * typed-block(`contents` + `choices`) → markdown 직렬화기.
 *
 * **역할 (옵션 B)**: OCR 이 네이티브 typed-block 을 emit 하고 블록을 정전으로 두되,
 * 기존 렌더(`MarkdownRenderer`)·해설(`solutions`)·변형(`variants`)·인쇄·파싱
 * (`problemAdapter`)은 *markdown 문자열*을 소비한다. 이 직렬화기가 블록 →
 * 기존 `text` 와 *동일한 형식* 의 markdown 을 만들어 그 소비자들을 무변경으로 유지한다.
 *
 * **round-trip 계약 (CRITICAL)**: 출력 markdown 은
 *   - `problemAdapter.extractChoices` 가 끝의 `①…⑤` 한 줄을 정확히 5 보기로 분리하고,
 *   - `problemAdapter.stripChoicesLine` 이 첫 ①②③④⑤ 줄부터 제거해 본문만 남기고,
 *   - `MarkdownRenderer` 가 inline `$…$`/블록 `$$…$$`/GFM 표/`> ` 박스/`[그림N]`/inline `<svg>` 를
 *     기존과 동일하게 렌더
 * 하도록 형식을 *기존 OCR markdown 과 맞춘다*. (이 계약이 깨지면 보기 grid·박스·도형이 깨짐.)
 *
 * **박스 매핑**: 블록은 testchange 네이티브 라벨 `<보기>`/`<조건>`/`<상자>` 를 쓴다
 * (PR3 에서 커넥터가 그대로 박스 렌더). 웹은 여기서 blockquote(`> `)로 변환해 동일 렌더.
 */

import type { ContentBlock, ChoiceGroup } from "@app/types/ocrBlocks";

/** 보기 마커 ①..⑩. */
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

/** 박스 라벨 prefix (testchange 네이티브 표기). */
const BOX_MARKERS = ["<보기>", "<조건>", "<상자>"];

const isBoxText = (b: ContentBlock): boolean =>
  b.type === "text" && BOX_MARKERS.some((m) => b.value.trimStart().startsWith(m));

const isSvgText = (b: ContentBlock): boolean =>
  b.type === "text" && b.value.trimStart().toLowerCase().startsWith("<svg");

/** 표 셀이 명백한 LaTeX(백슬래시·위첨자·아래첨자·중괄호)면 `$…$` 로 감싸 KaTeX 렌더. */
const needsMathWrap = (cell: string): boolean => /[\\^_{}]/.test(cell);

/** 2D 셀 배열 → GFM 표 markdown. rows[0] = 헤더 행. */
const tableToGfm = (rows: string[][]): string => {
  const safe = (rows ?? []).filter((r) => Array.isArray(r));
  if (safe.length === 0) return "";
  const cols = Math.max(...safe.map((r) => r.length));
  const wrap = (c: string): string => {
    const cell = (c ?? "").trim();
    if (!cell) return "";
    const wrapped = needsMathWrap(cell) && !cell.includes("$") ? `$${cell}$` : cell;
    // GFM 셀 구분자(|)와 충돌 방지 — 절댓값 |x|·집합표기 {x | ...} 셀이 표를 깨뜨림.
    return wrapped.replace(/\|/g, "\\|");
  };
  const padRow = (r: string[]): string => {
    const cells = r.map(wrap);
    while (cells.length < cols) cells.push("");
    return `| ${cells.join(" | ")} |`;
  };
  const header = padRow(safe[0]);
  const sep = `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`;
  const body = safe.slice(1).map(padRow);
  return [header, sep, ...body].join("\n");
};

/**
 * `<보기>/<조건>/<상자>` 박스 텍스트 → blockquote(`> `). 항목 구분자 "•" 는 줄 분리.
 *
 * 보기·조건 박스는 라벨 헤더(`> <보기>`)를 *보존* 한다 — sanitizeText 가 `<`/`>` 를
 * `&lt;`/`&gt;` 로 escape 하고(CLAUDE.md §2-5), MarkdownRenderer 의
 * wrapBareConditionBoxes(COND_BOX_HEADER_RE) 가 그 헤더로 박스를 인식해 `<보기>` 제목 +
 * 다단 grid 로 렌더한다(OLD markdown 경로와 동일). 라벨을 strip 하면 헤더·grid 가
 * 사라지는 회귀라 반드시 유지. `<상자>`(라벨 없는 박스)는 헤더 없이 prose 만 — 일반
 * 테두리 박스로 렌더되며 "상자" 리터럴은 노출하지 않는다.
 */
const boxToBlockquote = (value: string): string => {
  let v = value.trim();
  let kind = ""; // "보기" | "조건" | "상자"
  for (const m of BOX_MARKERS) {
    if (v.startsWith(m)) {
      kind = m.slice(1, -1); // "<보기>" → "보기"
      v = v.slice(m.length).trim();
      break;
    }
  }
  const items = v
    .split(/\s*•\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lines = items.length > 0 ? items : v ? [v] : [];
  const body = lines.map((ln) => `> ${ln}`);
  // 보기·조건 만 라벨 헤더 보존(렌더러가 보기/조건 헤더만 인식). 상자·기타는 헤더 없음.
  if (kind === "보기" || kind === "조건") {
    return [`> <${kind}>`, ...body].join("\n");
  }
  return body.join("\n");
};

/** 인라인 직렬화 (문장 내 / 보기 내) — text 는 그대로, 수식은 `$…$`. */
const inlinePiece = (b: ContentBlock): string => {
  if (b.type === "equation" || b.type === "equation_block") {
    // 모델이 contract 위반해 이미 $-wrap 한 경우 이중 래핑 방지 (KaTeX 깨짐).
    const v = b.value.trim().replace(/^\$+|\$+$/g, "").trim();
    return v ? `$${v}$` : "";
  }
  if (b.type === "table") {
    // 인라인(보기 안)에서 표는 드묾 — 셀을 공백 join 으로 degrade.
    return (b.rows ?? []).map((r) => (Array.isArray(r) ? r.join(" ") : "")).join(" ").trim();
  }
  return b.value;
};

const serializeChoiceContents = (contents: ContentBlock[]): string =>
  (contents ?? []).map(inlinePiece).join("").trim();

/**
 * 블록 + 보기 → markdown (`OCRProblem.text` 파생값).
 *
 * 인라인 블록(text/equation)은 *공백 없이 이어붙인다* — 모델이 블록 경계에 필요한
 * 공백을 text value 에 이미 포함하므로(예: equation "30" + text "개의 공을" →
 * "$30$개의 공을"). equation_block/table/박스/inline-svg 는 블록 레벨로 빈 줄 분리.
 */
export const blocksToMarkdown = (
  contents: ContentBlock[],
  choices: ChoiceGroup[] = [],
): string => {
  const out: string[] = []; // 블록 레벨 청크 (빈 줄로 join)
  let inline = ""; // 현재 인라인 런

  const flushInline = (): void => {
    const s = inline.trim();
    if (s) out.push(s);
    inline = "";
  };

  for (const b of contents ?? []) {
    if (!b || typeof b.type !== "string") continue;
    if (b.type === "equation_block") {
      flushInline();
      const v = b.value.trim();
      if (v) out.push(`$$${v}$$`);
    } else if (b.type === "table") {
      flushInline();
      const gfm = tableToGfm(b.rows ?? []);
      if (gfm) out.push(gfm);
    } else if (isSvgText(b)) {
      flushInline();
      out.push(b.value.trim());
    } else if (isBoxText(b)) {
      flushInline();
      out.push(boxToBlockquote(b.value));
    } else {
      // text 또는 equation — 인라인 런에 누적
      inline += inlinePiece(b);
    }
  }
  flushInline();

  // 보기 → ①..⑤ 한 줄 (rule 4b). 본문과 빈 줄로 분리. extractChoices 가 끝에서 파싱.
  const valid = (choices ?? []).filter(
    (c) => c && Array.isArray(c.contents) && typeof c.number === "number",
  );
  if (valid.length > 0) {
    const line = valid
      .map((c) => {
        const marker = CIRCLED[c.number - 1] ?? `(${c.number})`;
        // 빈 보기는 placeholder 로 채운다 — 비면 마커가 인접("① ② …")해 extractChoices
        // 정규식(마커 뒤 비-마커 1+ 필수)이 5개 매치에 실패 → 객관식이 주관식으로 오인.
        const content = serializeChoiceContents(c.contents) || "$\\boxed{\\phantom{0}}$";
        return `${marker} ${content}`;
      })
      .join(" ");
    out.push(line);
  }

  return out.join("\n\n");
};
