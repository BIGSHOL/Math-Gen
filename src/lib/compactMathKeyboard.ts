import type { MathfieldElement } from "mathlive";
import { renderKatexSafe } from "./katexRender";

type Key = string | { label: string; latex: string };
const template = (label: string, latex: string): Key => ({ label, latex });
const KEYS: Record<string, Key[]> = {
  기본: ["7", "8", "9", template("÷", "\\div"), "(", ")", "4", "5", "6", template("×", "\\times"), "x", "y", "1", "2", "3", "-", "t", "n", "0", ".", "+", "=", template("제곱", "^{2}"), template("분수", "\\frac{\\placeholder{}}{\\placeholder{}}")],
  함수: [template("분수", "\\frac{\\placeholder{}}{\\placeholder{}}"), template("루트", "\\sqrt{\\placeholder{}}"), template("지수", "^{\\placeholder{}}"), template("첨자", "_{\\placeholder{}}"), template("절댓값", "\\left|\\placeholder{}\\right|"), template("π", "\\pi"), template("적분", "\\int_{\\placeholder{}}^{\\placeholder{}}"), template("합", "\\sum_{\\placeholder{}}^{\\placeholder{}}"), template("극한", "\\lim_{x\\to\\placeholder{}}"), "\\log", "\\ln", "e", "\\sin", "\\cos", "\\tan", template("벡터", "\\vec{\\placeholder{}}"), template("선분", "\\overline{\\placeholder{}}"), template("각", "\\angle")],
  기호: ["\\le", "\\ge", "\\ne", "\\pm", "\\infty", "\\theta", "\\alpha", "\\beta", "\\gamma", "\\delta", "\\lambda", "\\mu", "\\in", "\\subset", "\\cup", "\\cap", "\\perp", "\\parallel", "\\rightarrow", "\\Rightarrow", "\\triangle", "\\circ", "\\{", "\\}"],
  문자: [..."abcdefghijklmnopqrstuvwxyz"],
};

/** MathLive의 입력 기능은 유지하고 키패드만 현재 입력칸 옆의 작은 팝업으로 제공한다. */
export function attachCompactMathKeyboard(field: MathfieldElement): () => void {
  field.mathVirtualKeyboardPolicy = "manual";
  field.classList.add("compact-math-input");
  const help = document.createElement("span"); help.className = "compact-math-help";
  help.textContent = "⌨ 수식 기호 입력 · ☰ 서식·명령 메뉴";
  field.after(help);
  const panel = document.createElement("div");
  panel.className = "compact-math-keyboard";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "수식 키보드");
  panel.hidden = true;
  const heading = document.createElement("div"); heading.className = "compact-math-keyboard-heading";
  const title = document.createElement("span"); title.textContent = "수식 키보드";
  const close = document.createElement("button"); close.type = "button"; close.textContent = "닫기"; close.setAttribute("aria-label", "수식 키보드 닫기");
  heading.append(title, close);
  const tabs = document.createElement("div"); tabs.className = "compact-math-keyboard-tabs"; tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "수식 키보드 종류");
  const grid = document.createElement("div"); grid.className = "compact-math-keyboard-grid";
  const actions = document.createElement("div"); actions.className = "compact-math-keyboard-actions";
  panel.append(heading, tabs, grid, actions); document.body.append(panel);
  let category = "기본", upperCase = false, frame = 0;

  const position = () => {
    if (panel.hidden) return;
    const box = field.getBoundingClientRect();
    if (!box.width || !box.height) { panel.hidden = true; return; }
    const width = Math.min(320, window.innerWidth - 24);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - width - 12))}px`;
    const height = panel.offsetHeight;
    const bottom = help.getBoundingClientRect().bottom;
    const top = bottom + 6 + height <= window.innerHeight - 12 ? bottom + 6 : box.top - height - 6;
    panel.style.top = `${Math.max(12, top)}px`;
  };
  const hide = () => { panel.hidden = true; };
  const show = () => {
    window.mathVirtualKeyboard?.hide({ animate: false });
    panel.hidden = false; position();
    cancelAnimationFrame(frame); frame = requestAnimationFrame(position);
  };
  const button = (label: string, run: () => void) => {
    const element = document.createElement("button"); element.type = "button";
    element.setAttribute("aria-label", label); element.textContent = label;
    element.addEventListener("click", run); return element;
  };
  const paint = () => {
    tabs.replaceChildren(...Object.keys(KEYS).map(name => {
      const tab = button(name, () => { category = name; paint(); position(); });
      tab.setAttribute("aria-pressed", String(category === name)); return tab;
    }));
    const keys = KEYS[category];
    grid.replaceChildren(...keys.map(key => {
      const latex = typeof key === "string" ? (category === "문자" && upperCase ? key.toUpperCase() : key) : key.latex;
      const label = typeof key === "string" ? latex : key.label;
      const keycap = button(label, () => { field.insert(latex, { selectionMode: "placeholder" }); field.focus(); });
      if (typeof key === "string" && key.startsWith("\\")) keycap.innerHTML = renderKatexSafe(key, false);
      return keycap;
    }));
    if (category === "문자") grid.append(button(upperCase ? "소문자" : "대문자", () => { upperCase = !upperCase; paint(); }));
  };
  for (const [label, command] of [["←", "moveToPreviousChar"], ["→", "moveToNextChar"], ["되돌림", "undo"], ["다시", "redo"], ["지우기", "deleteBackward"]] as const) {
    actions.append(button(label, () => { field.executeCommand(command); field.focus(); }));
  }
  paint();
  // 키를 눌러도 입력칸의 커서와 선택 영역을 유지한다. 본문 수식의 blur 종료도 방지.
  const keepFocus = (event: PointerEvent) => event.preventDefault();
  panel.addEventListener("pointerdown", keepFocus);
  close.addEventListener("click", hide);
  field.addEventListener("focusin", show);
  field.addEventListener("pointerdown", show);
  const outside = (event: Event) => { if (!event.composedPath().includes(field) && !event.composedPath().includes(panel)) hide(); };
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
  const preventFullKeyboard = (event: Event) => {
    if (field.matches(":focus-within") && (event as CustomEvent).detail?.visible) { event.preventDefault(); show(); }
  };
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("focusin", outside, true);
  field.addEventListener("keydown", escape);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
  window.mathVirtualKeyboard?.addEventListener("before-virtual-keyboard-toggle", preventFullKeyboard);
  const observer = new ResizeObserver(position); observer.observe(field);
  return () => {
    cancelAnimationFrame(frame); observer.disconnect(); panel.remove(); help.remove();
    field.removeEventListener("focusin", show); field.removeEventListener("pointerdown", show); field.removeEventListener("keydown", escape);
    document.removeEventListener("pointerdown", outside, true); document.removeEventListener("focusin", outside, true);
    window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true);
    window.mathVirtualKeyboard?.removeEventListener("before-virtual-keyboard-toggle", preventFullKeyboard);
  };
}
