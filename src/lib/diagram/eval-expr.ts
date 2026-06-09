type Token =
  | { kind: "number"; value: number }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "%" | "^" }
  | { kind: "leftParen" }
  | { kind: "rightParen" }
  | { kind: "comma" }
  | { kind: "eof" };

type FunctionSpec = {
  minArgs: number;
  maxArgs: number;
  call: (args: number[]) => number;
};

const MAX_EXPR_CHARS = 240;

const FUNCTIONS = new Map<string, FunctionSpec>([
  ["sin", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.sin(x) }],
  ["cos", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.cos(x) }],
  ["tan", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.tan(x) }],
  ["asin", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.asin(x) }],
  ["acos", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.acos(x) }],
  ["atan", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.atan(x) }],
  ["atan2", { minArgs: 2, maxArgs: 2, call: ([y, x]) => Math.atan2(y, x) }],
  ["sqrt", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.sqrt(x) }],
  ["abs", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.abs(x) }],
  ["log", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.log(x) }],
  ["ln", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.log(x) }],
  ["log2", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.log2(x) }],
  ["log10", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.log10(x) }],
  ["exp", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.exp(x) }],
  ["ceil", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.ceil(x) }],
  ["floor", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.floor(x) }],
  ["round", { minArgs: 1, maxArgs: 1, call: ([x]) => Math.round(x) }],
  ["min", { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY, call: (args) => Math.min(...args) }],
  ["max", { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY, call: (args) => Math.max(...args) }],
  ["pow", { minArgs: 2, maxArgs: 2, call: ([x, y]) => Math.pow(x, y) }],
]);

const isDigit = (char: string | undefined): boolean => char !== undefined && /[0-9]/.test(char);
const isIdentifierStart = (char: string | undefined): boolean =>
  char !== undefined && /[A-Za-z]/.test(char);
const isIdentifierPart = (char: string | undefined): boolean =>
  char !== undefined && /[A-Za-z0-9]/.test(char);
const canStartPrimary = (token: Token): boolean =>
  token.kind === "number" || token.kind === "identifier" || token.kind === "leftParen";

const readNumberEnd = (source: string, start: number): number => {
  let index = start;
  while (isDigit(source[index])) index++;
  if (source[index] === ".") {
    index++;
    while (isDigit(source[index])) index++;
  }

  const exponent = source[index];
  const sign = source[index + 1];
  const exponentDigitIndex = sign === "+" || sign === "-" ? index + 2 : index + 1;
  if ((exponent === "e" || exponent === "E") && isDigit(source[exponentDigitIndex])) {
    index = exponentDigitIndex + 1;
    while (isDigit(source[index])) index++;
  }

  return index;
};

const tokenize = (source: string): Token[] | null => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (isDigit(char) || (char === "." && isDigit(source[index + 1]))) {
      const end = readNumberEnd(source, index);
      const value = Number(source.slice(index, end));
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "number", value });
      index = end;
      continue;
    }
    if (isIdentifierStart(char)) {
      let end = index + 1;
      while (isIdentifierPart(source[end])) end++;
      tokens.push({ kind: "identifier", value: source.slice(index, end) });
      index = end;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "leftParen" });
      index++;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "rightParen" });
      index++;
      continue;
    }
    if (char === ",") {
      tokens.push({ kind: "comma" });
      index++;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "%" || char === "^") {
      tokens.push({ kind: "operator", value: char });
      index++;
      continue;
    }
    return null;
  }

  tokens.push({ kind: "eof" });
  return tokens;
};

class ExpressionParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly x: number,
  ) {}

  parse(): number {
    const value = this.parseAdditive();
    if (this.peek().kind !== "eof") throw new Error("Unexpected token");
    return value;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { kind: "eof" };
  }

  private consume(): Token {
    const token = this.peek();
    this.index++;
    return token;
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (true) {
      const token = this.peek();
      if (token.kind !== "operator" || (token.value !== "+" && token.value !== "-")) {
        return value;
      }
      const operator = this.consume();
      const right = this.parseMultiplicative();
      value = operator.kind === "operator" && operator.value === "+" ? value + right : value - right;
    }
  }

  private parseMultiplicative(): number {
    let value = this.parseUnary();
    while (true) {
      const token = this.peek();
      if (token.kind === "operator" && (token.value === "*" || token.value === "/" || token.value === "%")) {
        const operator = this.consume();
        const right = this.parseUnary();
        if (operator.kind === "operator" && operator.value === "*") value *= right;
        else if (operator.kind === "operator" && operator.value === "/") value /= right;
        else value %= right;
        continue;
      }
      if (canStartPrimary(token)) {
        value *= this.parseUnary();
        continue;
      }
      return value;
    }
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token.kind === "operator" && token.value === "+") {
      this.consume();
      return this.parseUnary();
    }
    if (token.kind === "operator" && token.value === "-") {
      this.consume();
      return -this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    const token = this.peek();
    if (token.kind === "operator" && token.value === "^") {
      this.consume();
      return Math.pow(base, this.parseUnary());
    }
    return base;
  }

  private parsePrimary(): number {
    const token = this.consume();
    if (token.kind === "number") return token.value;
    if (token.kind === "leftParen") {
      const value = this.parseAdditive();
      if (this.consume().kind !== "rightParen") throw new Error("Expected )");
      return value;
    }
    if (token.kind === "identifier") {
      if (this.peek().kind === "leftParen") {
        return this.parseFunctionCall(token.value);
      }
      if (token.value === "x") return this.x;
      if (token.value === "pi" || token.value === "PI") return Math.PI;
      if (token.value === "e" || token.value === "E") return Math.E;
    }
    throw new Error("Expected value");
  }

  private parseFunctionCall(name: string): number {
    const spec = FUNCTIONS.get(name);
    if (!spec) throw new Error("Unknown function");
    this.consume();

    const args: number[] = [];
    if (this.peek().kind !== "rightParen") {
      while (true) {
        args.push(this.parseAdditive());
        if (this.peek().kind !== "comma") break;
        this.consume();
      }
    }

    if (this.consume().kind !== "rightParen") throw new Error("Expected )");
    if (args.length < spec.minArgs || args.length > spec.maxArgs) {
      throw new Error("Invalid function arity");
    }
    return spec.call(args);
  }
}

export const evaluateExpr = (expr: string, x: number): number => {
  if (!Number.isFinite(x)) return NaN;
  const source = expr.trim();
  if (source.length === 0 || source.length > MAX_EXPR_CHARS) return NaN;

  try {
    const tokens = tokenize(source);
    if (!tokens) return NaN;
    const result = new ExpressionParser(tokens, x).parse();
    return Number.isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
};
