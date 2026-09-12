import { evaluateExpr } from "./diagram/eval-expr";
import { SVG_NS, serializeFigureSvg } from "./figureSvgEditing";

export interface FunctionGraphConfig { expression: string; xMin: number; xMax: number; yMin: number; yMax: number; axes: boolean }
export const DEFAULT_FUNCTION: FunctionGraphConfig = { expression: "y=x^2", xMin: -5, xMax: 5, yMin: -5, yMax: 10, axes: true };
export function functionExpression(value: string) {
  return value.trim().replace(/^\s*(?:y|f\(x\))\s*=\s*/i, "").replace(/²/g, "^2").replace(/³/g, "^3").replace(/π/g, "pi").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-");
}
export function functionGraph(config: FunctionGraphConfig, viewBox = [0, 0, 480, 360]) {
  const { xMin, xMax, yMin, yMax } = config, expression = functionExpression(config.expression);
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMax <= xMin || yMax <= yMin) throw new Error("최댓값은 최솟값보다 커야 합니다.");
  const [left, top, width, height] = viewBox, pad = Math.min(width, height) * .09;
  const px = (x: number) => left + pad + (x - xMin) / (xMax - xMin) * (width - pad * 2);
  const py = (y: number) => top + pad + (yMax - y) / (yMax - yMin) * (height - pad * 2);
  const n = (x: number) => +x.toFixed(3);
  let path = "", connected = false, lastY = NaN, finiteCount = 0;
  // 비유한 값과 점근선을 가로지르는 구간을 끊어 1/x, tan(x)의 수직 가짜 선을 막는다.
  for (let i = 0; i <= 1200; i++) {
    const x = xMin + (xMax - xMin) * i / 1200, y = evaluateExpr(expression, x);
    if (Number.isFinite(y)) finiteCount++;
    const visible = Number.isFinite(y) && y >= yMin && y <= yMax;
    if (visible) path += `${connected && Math.abs(y - lastY) < (yMax - yMin) / 3 ? "L" : "M"}${n(px(x))} ${n(py(y))}`;
    connected = visible; lastY = y;
  }
  if (!finiteCount) throw new Error("식을 확인하세요. 예: y=x^2, y=sin(x), y=1/x");
  if (!path.includes("L")) throw new Error("이 범위에 보이는 그래프가 없습니다. x·y 범위를 넓혀 보세요.");
  const doc = document.implementation.createDocument(SVG_NS, "svg"), root = doc.documentElement;
  root.setAttribute("viewBox", viewBox.join(" ")); root.setAttribute("width", String(width)); root.setAttribute("height", String(height));
  const add = (type: string, attrs: Record<string, string | number>, text?: string) => {
    const node = doc.createElementNS(SVG_NS, type);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text) node.textContent = text; root.append(node); return node;
  };
  const stroke = Math.min(width, height) / 240;
  if (config.axes) {
    if (yMin <= 0 && yMax >= 0) {
      add("path", { d: `M${px(xMin)} ${py(0)}H${px(xMax)}m-5 -3l5 3l-5 3`, fill: "none", stroke: "#555555", "stroke-width": stroke * .7 });
      add("text", { x: px(xMax) - 4, y: py(0) + 17, "font-size": stroke * 10, fill: "#111111", "data-mj": "$x$" }, "x");
    }
    if (xMin <= 0 && xMax >= 0) {
      add("path", { d: `M${px(0)} ${py(yMin)}V${py(yMax)}m-3 5l3 -5l3 5`, fill: "none", stroke: "#555555", "stroke-width": stroke * .7 });
      add("text", { x: px(0) - 16, y: py(yMax) + 10, "font-size": stroke * 10, fill: "#111111", "data-mj": "$y$" }, "y");
    }
  }
  add("path", { d: path, fill: "none", stroke: "#111111", "stroke-width": stroke, "data-function": JSON.stringify(config), "data-function-viewbox": viewBox.join(" ") });
  return { svg: serializeFigureSvg(doc), path };
}
