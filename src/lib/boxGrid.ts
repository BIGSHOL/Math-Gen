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
 * `cols`: `1 | 2 | 3 | 'auto'` — default marker renders one column so the
 * original vertical order is never guessed from item count.
 */

export type BoxCols = "auto" | 1 | 2 | 3;
export const DEFAULT_BOX_COLS: BoxCols = 1;

/** blockquote 첫 줄 텍스트에서 cols 지정자 추출. 마커가 없으면 null. */
export const parseBoxCols = (headerLine: string): BoxCols | null => {
  const m = headerLine.match(/\\?<보기(?::cols=(auto|1|2|3))?\\?>/);
  if (!m) return null;
  if (!m[1]) return DEFAULT_BOX_COLS;
  if (m[1] === "auto") return "auto";
  return Number(m[1]) as 1 | 2 | 3;
};

/** 항목 개수는 원본 열 배치의 근거가 아니다. 명시한 cols만 다단으로 표시한다. */
export const autoCols = (_itemCount: number): 1 | 2 | 3 => 1;

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
  // The plain marker represents the one-column default. Explicit auto/2/3
  // survives as metadata when a source really used multiple columns.
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
