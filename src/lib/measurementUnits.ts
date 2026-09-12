/** 단위는 직립체, 변수는 이탤릭체. 단일 문자 단위는 문제의 측정 문맥이 있을 때만 판정한다. */
export function uprightMeasurementUnits(math: string, context = ""): string {
  const physical = (/속[도력]|가속도|미터|지면|물체|초속|시속|높이|길이|거리|넓이|부피|무게|질량|이동/.test(context)
    && !/모평균|표준편차|정규분포/.test(context))
    || /\d(?:\s|\\[,; ])*(?:km|cm|m)\s*\/\s*(?:s|h|min)\b/.test(math);
  // 명시한 글꼴/텍스트와 LaTeX 명령 이름은 다시 해석하지 않는다.
  const protectedParts: string[] = [];
  const unitAtom = '(?:kcal|min|km|cm|mm|kg|mg|mL|dL|kL|m|s|h|L|g)(?:\\^[23])?';
  const explicitUnit = new RegExp(`^${unitAtom}(?:\\s*/\\s*${unitAtom})?$`);
  const canonical = math.replace(/\\(?:text|textrm)\s*\{\s*([^{}]+?)\s*\}/g, (whole, value: string) =>
    explicitUnit.test(value) ? value.replace(/[a-zA-Z]+/g, name => `\\mathrm{${name}}`) : whole);
  let source = canonical.replace(/\\(?:mathrm|textrm|text|mathit|operatorname)\s*\{[^{}]*\}|\\[a-zA-Z]+/g, value => {
    protectedParts.push(value); return `\uE110${protectedParts.length - 1}\uE111`;
  });
  const units = physical ? "kcal|min|km|cm|mm|kg|mg|mL|dL|kL|m|s|h|L|g" : "kcal|min|km|cm|mm|kg|mg|mL|dL|kL";
  const gap = String.raw`(?:\s|\\[,;! ])*`;
  const atom = `(?:${units})(?:\\^\\{?[23]\\}?)?`;
  const pattern = new RegExp(`(^|[0-9}]|[a-z])(${gap})(${atom}(?:${gap}/${gap}${atom})?)(?![a-zA-Z0-9(])`, "g");
  source = source.replace(pattern, (whole, prefix: string, space: string, unit: string, offset: number) => {
    // 단위 앞의 문자가 식별자/명령의 일부이면 변수 곱을 단위로 오인하지 않는다.
    if (/[a-z]/i.test(prefix) && offset > 0 && /[a-zA-Z\\]/.test(source[offset - 1])) return whole;
    if (!prefix && !unit.includes('/') && !/^(?:cm|mm|km|kg|mg|mL|dL|kL)(?:\^|$)/.test(unit)) return whole;
    return prefix + (prefix ? (space || "\\,") : space) + unit.replace(/[a-zA-Z]+/g, name => `\\mathrm{${name}}`);
  });
  return source.replace(/\uE110(\d+)\uE111/g, (_, i: string) => protectedParts[Number(i)]);
}
