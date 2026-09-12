import { useRef, useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";

const TEMPLATES = [
  { label: "분수", tex: "\\frac{□}{□}" }, { label: "제곱", tex: "□^{2}" },
  { label: "지수", tex: "□^{□}" }, { label: "아래첨자", tex: "□_{□}" },
  { label: "루트", tex: "\\sqrt{□}" }, { label: "괄호", tex: "\\left(□\\right)" },
  { label: "적분", tex: "\\int_{□}^{□} □\\,dx" }, { label: "합", tex: "\\sum_{n=1}^{□} □" },
  { label: "극한", tex: "\\lim_{x\\to □} □" }, { label: "벡터", tex: "\\overrightarrow{□}" },
];
const SYMBOLS = ["\\times", "\\div", "\\pm", "\\le", "\\ge", "\\ne", "\\pi", "\\theta", "\\infty", "\\angle", "\\triangle", "\\perp"];

/** 선택 영역/커서의 수학 모드를 보존하며 삽입하고 첫 빈칸을 선택한다. */
export function insertMathTemplate(value: string, start: number, end: number, template: string) {
  const selected = value.slice(start, end);
  let tex = selected ? template.replace("□", selected.replace(/^\$|\$$/g, "")) : template;
  const before = value.slice(0, start);
  const delimiters = before.match(/(?<!\\)\$\$|(?<!\\)\$/g) ?? [];
  let open = "";
  for (const delimiter of delimiters) open = open === delimiter ? "" : open || delimiter;
  const wrappedSelection = /^\$[\s\S]*\$$/.test(selected);
  if (!open || wrappedSelection) tex = `$${tex}$`;
  const blank = tex.indexOf("□");
  const cursor = start + (blank < 0 ? tex.length : blank);
  return { value: before + tex + value.slice(end), start: cursor, end: cursor + (blank < 0 ? 0 : 1) };
}

export function MathTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [custom, setCustom] = useState("\\frac{a}{b}");
  const [expanded, setExpanded] = useState(false);
  const insert = (tex: string) => {
    const result = insertMathTemplate(value, selection.current.start, selection.current.end, tex);
    onChange(result.value);
    requestAnimationFrame(() => {
      textarea.current?.focus(); textarea.current?.setSelectionRange(result.start, result.end);
      selection.current = { start: result.start, end: result.end };
    });
  };
  return <div className="rounded-r2 border border-line-strong bg-surface overflow-hidden flex flex-col">
    <div className="p-2 border-b border-line bg-surface2">
      <div className="flex items-center justify-between mb-1.5"><span className="text-caption font-semibold">수식 입력기</span>
        <button type="button" onClick={() => setExpanded(v => !v)} className="text-caption text-accent">{expanded ? "직접 입력 닫기" : "수식 직접 입력"}</button></div>
      <div className="flex flex-wrap gap-1" role="toolbar" aria-label="수식 삽입">
        {TEMPLATES.map(t => <button key={t.label} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insert(t.tex)}
          className="px-2 py-1 text-caption rounded border border-line bg-white hover:border-accent hover:text-accent">{t.label}</button>)}
        {SYMBOLS.map(tex => <button key={tex} type="button" aria-label={`기호 ${tex}`} onMouseDown={e => e.preventDefault()} onClick={() => insert(tex + " ")}
          className="min-w-7 px-1 py-0.5 rounded hover:bg-white"><MarkdownRenderer content={`$${tex}$`} /></button>)}
      </div>
      {expanded && <div className="mt-2 space-y-2">
        <label className="text-caption">수식 <input aria-label="직접 입력할 수식" value={custom} onChange={e => setCustom(e.target.value)} className="w-full rounded border border-line px-2 py-1 font-mono" /></label>
        <div className="min-h-10 rounded bg-white p-2"><MarkdownRenderer content={`$${custom}$`} /></div>
        <button type="button" onClick={() => insert(custom)} className="rounded bg-accent px-3 py-1 text-white text-caption">본문에 넣기</button>
      </div>}
    </div>
    <textarea ref={textarea} value={value} onChange={e => onChange(e.target.value)}
      onSelect={e => { selection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
      className="flex-1 min-h-[230px] px-3 py-2 text-body font-mono leading-relaxed resize-y focus:outline-none"
      spellCheck={false} aria-label="문제 본문 (Markdown + LaTeX)" />
    <p className="px-3 py-1.5 text-caption text-muted border-t border-line">본문에 커서를 놓고 수식을 선택하세요. □를 입력할 값으로 바꾸면 됩니다.</p>
  </div>;
}
