import { useEffect, useRef, useState } from "react";
import { MathfieldElement, convertAsciiMathToLatex } from "mathlive";
import "mathlive/fonts.css";

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

type LabelMode = "text" | "math";

const MATH_TEMPLATES = [
  ["분수", "\\frac{\\placeholder{}}{\\placeholder{}}"],
  ["제곱", "^{2}"],
  ["아래첨자", "_{\\placeholder{}}"],
  ["루트", "\\sqrt{\\placeholder{}}"],
  ["π", "\\pi"],
  ["θ", "\\theta"],
] as const;

const isMathLabel = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.startsWith("$") && trimmed.endsWith("$");
};

const unwrapMathLabel = (value: string) => {
  const trimmed = value.trim();
  return isMathLabel(trimmed) ? trimmed.slice(1, -1) : trimmed;
};

export function figureLabelSummary(value: string) {
  return unwrapMathLabel(value).replace(/\\mathrm\{([^{}]+)\}/g, "$1");
}

export function FigureLabelInput({ value, onChange, idPrefix }: {
  value: string;
  onChange: (value: string) => void;
  idPrefix: string;
}) {
  const [mode, setMode] = useState<LabelMode>(() => isMathLabel(value) ? "math" : "text");
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathfieldElement | null>(null);
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;

  useEffect(() => {
    if (mode !== "math" || !host.current) return;
    const mathField = new MathfieldElement();
    mathField.value = unwrapMathLabel(value);
    mathField.mathVirtualKeyboardPolicy = "auto";
    mathField.smartFence = true;
    mathField.setAttribute("aria-label", `${idPrefix} 수식`);
    mathField.setAttribute("placeholder", "예: v(t), x^2, 1/2");
    const input = () => latestOnChange.current(`$${mathField.value}$`);
    mathField.addEventListener("input", input);
    host.current.replaceChildren(mathField);
    field.current = mathField;
    return () => {
      mathField.removeEventListener("input", input);
      if (field.current === mathField) field.current = null;
      try { window.mathVirtualKeyboard?.hide({ animate: false }); } catch { /* already detached */ }
      mathField.remove();
    };
  // The field is intentionally created only when the input mode changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, idPrefix]);

  useEffect(() => {
    if (mode !== "math" || !field.current) return;
    const next = unwrapMathLabel(value);
    if (field.current.value !== next) field.current.value = next;
  }, [mode, value]);

  const selectMode = (next: LabelMode) => {
    if (next === mode) return;
    setMode(next);
    if (next === "math") {
      const plain = unwrapMathLabel(value);
      const latex = /\\[a-zA-Z]+/.test(plain) ? plain : convertAsciiMathToLatex(plain);
      onChange(`$${latex}$`);
    } else {
      onChange(unwrapMathLabel(value));
    }
  };
  const insert = (latex: string) => {
    field.current?.insert(latex, { selectionMode: "placeholder" });
    field.current?.focus();
  };

  return <div className="space-y-2">
    <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1" role="group" aria-label={`${idPrefix} 종류`}>
      {(["text", "math"] as const).map(option => <button key={option} type="button" aria-pressed={mode === option}
        onClick={() => selectMode(option)} className={`rounded-md px-2 py-1.5 text-caption font-medium transition ${mode === option ? "bg-white text-orange-800 shadow-sm ring-1 ring-orange-200" : "text-muted hover:text-ink"}`}>
        {option === "text" ? "일반 글자" : "수식"}
      </button>)}
    </div>
    {mode === "text"
      ? <input aria-label={idPrefix} className="w-full rounded-lg border border-line px-3 py-2 text-small outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          value={unwrapMathLabel(value)} onChange={event => onChange(event.target.value)} placeholder="예: 점 A, 길이" />
      : <>
        <div ref={host} className="figure-label-mathfield min-h-11 rounded-lg border border-line bg-white px-2 py-1 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100" />
        <div className="flex flex-wrap gap-1" role="toolbar" aria-label={`${idPrefix} 수식 도구`}>
          {MATH_TEMPLATES.map(([name, latex]) => <button key={name} type="button" onMouseDown={event => event.preventDefault()} onClick={() => insert(latex)}
            className="rounded border border-line bg-white px-2 py-1 text-caption text-slate-700 hover:border-orange-300 hover:bg-orange-50">{name}</button>)}
        </div>
        <p className="text-caption leading-relaxed text-muted">v(t), x^2, 1/2처럼 입력하면 수식 모양으로 표시됩니다.</p>
      </>}
  </div>;
}
