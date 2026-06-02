// figureLayout.ts — position-based figure row grouping (Phase A)
//
// 한 문항의 시각 요소(크롭 이미지 + 도형)를 *원본 페이지의 box 위치* 기준으로
// 좌우 배치한다. MarkdownRenderer 의 Stage 1c 에서 호출 — Stage 0/1/1b 가 만든
// figure placeholder 들이 *개별 block sibling* 으로 세로로 쌓이는 것을, box 가
// 좌우로 나란한 경우 한 줄(`<div data-figure-row>`)로 묶어준다.
//
// **순수 함수** (DOM/React 무관) — `npx tsx` 로 단위 테스트 가능.
//
// ── placeholder 계약 (MarkdownRenderer 가 emit, 여기서 스캔) ──────────────────
//   - 블록 SVG:   <div data-svg-id="KEY" ...></div>     (key = data-svg-id)
//   - 인라인 이미지: <img ... class="diagram-inline-img" data-fig-key="KEY" ... />
//   blockquote inline svg (`<span data-svg-id=...>`) 와 KaTeX div(data-katex-id,
//   아직 생성 전), 일반 markdown `![]()` 이미지(data-fig-key 없음)는 매칭 안 됨.
//
//   box 는 `boxes` Map<KEY, [yMin,xMin,yMax,xMax]|undefined> 로 주입 (0–1000
//   full-page grid). box 없는 placeholder 는 행에 편입되지 않음(=세로 스택 유지).
//
// ── 회귀 0 보장 ─────────────────────────────────────────────────────────────
//   *어떤* run 도 "유효 box 2개+ 가 같은 행" 을 못 만들면 입력 문자열을 **그대로**
//   반환. box 가 전혀 없으면(기존 데이터) 전체가 no-op.

/** full-page 정규화 bbox: [yMin, xMin, yMax, xMax] (0–1000). */
export type FigBox = readonly [number, number, number, number];

// 같은 행 판정 임계값 — 0–1000 그리드라 해상도 무관 고정.
export const Y_OVERLAP_MIN = 0.5; // 세로 겹침 / min(높이)
export const X_GAP_MAX = 250; // 단(column) 경계 오인 방지: 25% 페이지 폭 이상 떨어지면 다른 단
export const X_OVERLAP_MAX = 0.5; // 가로로 많이 겹치면(세로로 쌓인 것) 다른 행
const MIN_W = 80; // degenerate box 폭 floor (8% 페이지)
const SHARE_MIN = 0.15;
const SHARE_MAX = 0.85;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/**
 * 두 box 가 "같은 행(좌우 나란히)" 인가 — reading-order 인접 멤버끼리 pairwise.
 * 세로 겹침 충분 + 가로 갭 작음 + 가로 비겹침(나란함).
 */
export const sameRow = (a: FigBox, b: FigBox): boolean => {
  const [ay1, ax1, ay2, ax2] = a;
  const [by1, bx1, by2, bx2] = b;
  const vInter = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const minH = Math.max(1, Math.min(ay2 - ay1, by2 - by1));
  const vOverlap = vInter / minH;
  const xGap = Math.max(0, Math.max(ax1, bx1) - Math.min(ax2, bx2));
  const xInter = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const minW = Math.max(1, Math.min(ax2 - ax1, bx2 - bx1));
  const xOverlap = xInter / minW;
  return vOverlap >= Y_OVERLAP_MIN && xGap <= X_GAP_MAX && xOverlap <= X_OVERLAP_MAX;
};

const isValidBox = (b: FigBox | undefined): b is FigBox =>
  !!b &&
  b.length === 4 &&
  b.every((n) => Number.isFinite(n)) &&
  b[0] < b[2] &&
  b[1] < b[3];

interface Member {
  key: string;
  html: string;
  box: FigBox | undefined;
}

/**
 * reading-order 멤버 리스트를 행들로 분할 (sequential vertical-overlap clustering).
 * box 없는 멤버는 단독 행(세로 스택 유지). 직전 멤버와 sameRow 면 현재 행 확장.
 */
export const partitionRows = (members: Member[]): Member[][] => {
  const rows: Member[][] = [];
  let cur: Member[] = [];
  for (const mem of members) {
    if (!isValidBox(mem.box)) {
      if (cur.length) {
        rows.push(cur);
        cur = [];
      }
      rows.push([mem]);
      continue;
    }
    if (cur.length === 0) {
      cur = [mem];
      continue;
    }
    const prev = cur[cur.length - 1];
    if (isValidBox(prev.box) && sameRow(prev.box, mem.box)) {
      cur.push(mem);
    } else {
      rows.push(cur);
      cur = [mem];
    }
  }
  if (cur.length) rows.push(cur);
  return rows;
};

/** flex-grow 비율(box 폭 비례, clamp). */
export const computeShares = (boxes: FigBox[]): number[] => {
  const widths = boxes.map((b) => Math.max(MIN_W, b[3] - b[1]));
  const sum = widths.reduce((s, w) => s + w, 0) || 1;
  return widths.map((w) => Math.round(clamp(w / sum, SHARE_MIN, SHARE_MAX) * 1000) / 1000);
};

/**
 * placeholder html 에 data-flexgrow 속성 주입.
 *  - <img …/> : 닫는 `>` 앞에 (단일 태그).
 *  - <div …></div> : *여는 태그* 의 첫 `>` 앞에 (닫는 </div> 건드리면 깨짐).
 */
const stampFlex = (html: string, share: number): string => {
  const attr = ` data-flexgrow="${share}"`;
  if (html.startsWith("<img")) {
    return html.replace(/(\s*\/?>)\s*$/, `${attr}$1`);
  }
  return html.replace(/^(<div\b[^>]*?)(\s*>)/, `$1${attr}$2`);
};

// 블록 svg div (data-svg-id) 또는 인라인 이미지(data-fig-key) placeholder.
// 두 캡처 그룹 중 하나가 key.
const PLACEHOLDER_RE =
  /<div\b[^>]*\bdata-svg-id="([^"]+)"[^>]*><\/div>|<img\b[^>]*\bdata-fig-key="([^"]+)"[^>]*\/?>/g;

interface PMatch {
  start: number;
  end: number;
  key: string;
  html: string;
}

/**
 * Phase B — 모델 figures[] (reading order) 를 content 내 placeholder 에 *읽기
 * 순서* 로 매칭해 box Map 을 채운다. inline svg(마커 없음) 도 위치를 얻는다.
 *
 * 전제: figures[] 와 placeholder 가 같은 reading order (모델이 시각 순서대로 emit,
 * placeholder 도 본문 순서대로 등장). count 가 달라도 min 까지만 안전 매칭 →
 * 나머지는 box 없음(스택 fallback). 기존 Map 값(Phase A 크롭 box)을 덮어쓴다
 * (figures[] 가 권위 소스).
 */
export const assignBoxesByReadingOrder = (
  content: string,
  figures: ReadonlyArray<{ box: FigBox }>,
  out: Map<string, FigBox | undefined>,
): void => {
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while (k < figures.length && (m = PLACEHOLDER_RE.exec(content)) !== null) {
    const key = m[1] ?? m[2];
    const fig = figures[k];
    if (fig && isValidBox(fig.box)) out.set(key, fig.box);
    k++;
  }
};

const buildRunReplacement = (
  run: PMatch[],
  boxes: Map<string, FigBox | undefined>,
): string | null => {
  const members: Member[] = run.map((p) => ({
    key: p.key,
    html: p.html,
    box: boxes.get(p.key),
  }));
  const rows = partitionRows(members);
  // 멤버 2개+ 인 행이 하나도 없으면 묶을 게 없음 → null (원본 유지)
  if (!rows.some((row) => row.length >= 2)) return null;

  const parts = rows.map((row) => {
    if (row.length < 2) return row[0].html;
    const sorted = [...row].sort((a, b) => (a.box as FigBox)[1] - (b.box as FigBox)[1]);
    const shares = computeShares(sorted.map((mm) => mm.box as FigBox));
    const cells = sorted.map((mm, i) => stampFlex(mm.html, shares[i]));
    return `<div data-figure-row="1">${cells.join("")}</div>`;
  });
  return `\n\n${parts.join("\n\n")}\n\n`;
};

/**
 * content 내 인접한 figure placeholder run 을 box 위치 기준으로 행 묶음.
 * 변경할 게 없으면 입력 문자열 그대로 반환.
 */
export const groupFigureRows = (
  content: string,
  boxes: Map<string, FigBox | undefined>,
): string => {
  // box 가 하나도 없으면 즉시 no-op (기존 데이터 fast path)
  let anyBox = false;
  for (const v of boxes.values()) {
    if (isValidBox(v)) {
      anyBox = true;
      break;
    }
  }
  if (!anyBox) return content;

  // 1. 모든 placeholder 위치 수집
  const matches: PMatch[] = [];
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(content)) !== null) {
    const key = m[1] ?? m[2];
    matches.push({ start: m.index, end: m.index + m[0].length, key, html: m[0] });
  }
  if (matches.length < 2) return content;

  // 2. run 분할 (placeholder 사이가 공백뿐이면 인접 = 같은 run)
  const runs: PMatch[][] = [];
  let cur: PMatch[] = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const between = content.slice(matches[i - 1].end, matches[i].start);
    if (/^\s*$/.test(between)) {
      cur.push(matches[i]);
    } else {
      runs.push(cur);
      cur = [matches[i]];
    }
  }
  runs.push(cur);

  // 3. run 별 replacement 을 *오른쪽부터* splice (왼쪽 인덱스 보존)
  let result = content;
  for (let r = runs.length - 1; r >= 0; r--) {
    const run = runs[r];
    if (run.length < 2) continue;
    const replacement = buildRunReplacement(run, boxes);
    if (replacement == null) continue;
    const runStart = run[0].start;
    const runEnd = run[run.length - 1].end;
    result = result.slice(0, runStart) + replacement + result.slice(runEnd);
  }
  return result;
};
