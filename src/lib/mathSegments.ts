/** Scan once: generated HTML and escaped currency signs never become math input. */
export type MathSegment = { kind: "text" | "inline" | "block"; value: string };
export function splitMathSegments(source: string): MathSegment[] {
  const result: MathSegment[] = [];
  const escaped = (at: number) => {
    let count = 0;
    while (source[--at] === "\\") count++;
    return count % 2 === 1;
  };
  let textStart = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== "$" || escaped(i)) continue;
    const size = source[i + 1] === "$" ? 2 : 1;
    let end = i + size;
    for (; end < source.length; end++) {
      if (size === 1 && /^\n\s*\n/.test(source.slice(end, end + 8))) break;
      if (
        source[end] === "$"
        && !escaped(end)
        && (
          (size === 1 && source[end + 1] !== "$")
          || (size === 2 && source[end + 1] === "$")
        )
      ) break;
    }
    if (source[end] !== "$" || end === i + size) { i += size - 1; continue; }
    if (i > textStart) result.push({ kind: "text", value: source.slice(textStart, i) });
    result.push({ kind: size === 2 ? "block" : "inline", value: source.slice(i + size, end) });
    i = end + size - 1;
    textStart = i + 1;
  }
  if (textStart < source.length) result.push({ kind: "text", value: source.slice(textStart) });
  return result;
}
