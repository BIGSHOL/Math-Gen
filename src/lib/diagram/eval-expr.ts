import { Parser } from "expr-eval";

/**
 * 안전 식 평가 — `coordinatePlane.functions[].expr` 의 `sin(x)`, `x^2`, `2x` 같은
 * 수식을 *컴파일러/eval 없이* parse + 평가.
 *
 * mathlab 의 `new Function()` 기반 evaluateExpr (review.md P0 보안 경고) 대신
 * expr-eval (15KB). 위험 함수 (eval/Function/Object/member access) 자동 미지원.
 *
 * 허용 식별자: x, pi, PI, e, E, 그리고 안전 수학 함수 (sin/cos/tan/sqrt/abs/log/exp 등).
 * 그 외 식별자 (Math.sin, api, window, eval 등) reject → NaN.
 *
 * 묵시적 곱셈 (`2x` → `2*x`) 은 전처리에서 수행.
 */

const parser = new Parser({
  operators: {
    add: true,
    subtract: true,
    multiply: true,
    divide: true,
    remainder: true,
    power: true, // ^
    factorial: false,
    comparison: false,
    logical: false,
    assignment: false,
    conditional: false,
    in: false,
  },
});

const SAFE_NAMES = new Set([
  "x",
  "pi",
  "PI",
  "e",
  "E",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "sqrt",
  "abs",
  "log",
  "log2",
  "log10",
  "ln",
  "exp",
  "ceil",
  "floor",
  "round",
  "min",
  "max",
  "pow",
]);

const preprocess = (expr: string): string => {
  // 묵시적 곱셈: 2x → 2*x, 2(x+1) → 2*(x+1). 함수명 (`sin(`) 은 영향 X
  // (정규식이 숫자 직후만 매칭).
  return expr.replace(/(\d)\s*([a-zA-Z(])/g, "$1*$2");
};

export const evaluateExpr = (expr: string, x: number): number => {
  try {
    const safe = preprocess(expr);
    const parsed = parser.parse(safe);
    const symbols = parsed.symbols();
    for (const s of symbols) {
      if (!SAFE_NAMES.has(s)) return NaN;
    }
    const scope = {
      x,
      pi: Math.PI,
      PI: Math.PI,
      e: Math.E,
      E: Math.E,
    };
    const result = parsed.evaluate(scope);
    return typeof result === "number" && Number.isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
};
