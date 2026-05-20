/**
 * `<보기>` 블록의 그리드 열 수를 파싱/수정하는 공용 유틸.
 *
 * Ported verbatim from F:\mathlab\src\lib\utils\box-grid.ts — battle-tested
 * across the mathlab LMS for Korean math content. Used by the markdown
 * renderer to honor `<보기:cols=N>` markers placed at the top of a blockquote:
 *
 *     > <보기:cols=3>
 *     > ㄱ. $6$
 *     > ㄴ. $9$
 *     > ㄷ. $12$
 *
 * `cols`: `1 | 2 | 3 | 'auto'` — default (no marker) is currently `'auto'`.
 */

export type BoxCols = "auto" | 1 | 2 | 3;
export const DEFAULT_BOX_COLS: BoxCols = "auto";

/** blockquote 첫 줄 텍스트에서 cols 지정자 추출. 마커가 없으면 null. */
export const parseBoxCols = (headerLine: string): BoxCols | null => {
  const m = headerLine.match(/\\?<보기(?::cols=(auto|1|2|3))?\\?>/);
  if (!m) return null;
  if (!m[1]) return DEFAULT_BOX_COLS;
  if (m[1] === "auto") return "auto";
  return Number(m[1]) as 1 | 2 | 3;
};

/** 항목 개수로 자동 열 수 계산 (≥6 → 3, ≥3 → 2, 그 외 → 1). */
export const autoCols = (itemCount: number): 1 | 2 | 3 => {
  if (itemCount >= 6) return 3;
  if (itemCount >= 3) return 2;
  return 1;
};

/** 실제 렌더 시 사용할 열 수 결정. */
export const resolveCols = (cols: BoxCols, itemCount: number): 1 | 2 | 3 => {
  if (cols === "auto") return autoCols(itemCount);
  return cols;
};

/** content 마크다운에서 첫 번째 `<보기>` 블록의 cols를 읽어온다. 없으면 null. */
export const readBoxColsFromContent = (content: string): BoxCols | null => {
  const lines = content.split("\n");
  for (const line of lines) {
    const stripped = line.replace(/^>\s?/, "");
    if (/<보기/.test(stripped)) {
      return parseBoxCols(stripped);
    }
  }
  return null;
};

/**
 * content 마크다운의 첫 `<보기>` 헤더를 새 cols로 치환.
 * `<보기>` 블록이 없거나 헤더 없으면 content 그대로 반환.
 */
export const writeBoxColsToContent = (content: string, cols: BoxCols | null): string => {
  const lines = content.split("\n");
  // DEFAULT_BOX_COLS is currently 'auto'. If you change the default to a
  // numeric value, the branching below still produces the right marker.
  // After the null/default check, `cols` is narrowed to 1 | 2 | 3 in the
  // else branch — TS knows we've eliminated 'auto' (the default value).
  const isDefault = cols === null || cols === DEFAULT_BOX_COLS;
  const newMarker = isDefault ? "<보기>" : `<보기:cols=${cols}>`;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prefix = line.match(/^>\s?/)?.[0] ?? "";
    const rest = line.slice(prefix.length);
    if (/\\?<보기(?::cols=(?:auto|1|2|3))?\\?>/.test(rest)) {
      lines[i] = prefix + rest.replace(/\\?<보기(?::cols=(?:auto|1|2|3))?\\?>/, newMarker);
      return lines.join("\n");
    }
  }
  return content;
};
