import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ModalShell } from "@app/components/modal";
import { Btn } from "@app/components/ui";
import type { OCRImage } from "@app/stores/wizardStore";
import { redrawFigureCrop, svgDataUrl } from "@app/services/ai/figurePipeline";
import { addFigureObject, cleanFigureForSave, editFigureObject, figureObjects, prepareFigureSvg, removeFigureObject, fitFigureViewport } from "@app/lib/figureSvgEditing";
import { typesetFigureSvg } from "@app/lib/figureTypeset";

type Tool = "select" | "line" | "arrow" | "curve" | "circle" | "rect" | "text";
const TOOLS: { id: Tool; label: string; glyph: string }[] = [
  { id: "select", label: "선택·이동", glyph: "↖" }, { id: "line", label: "선분", glyph: "╱" },
  { id: "arrow", label: "화살표", glyph: "↗" },
  { id: "curve", label: "곡선", glyph: "⌒" }, { id: "circle", label: "원", glyph: "○" },
  { id: "rect", label: "사각형", glyph: "□" }, { id: "text", label: "글자", glyph: "T" },
];
const NAMES: Record<string, string> = { path: "곡선/경로", line: "선분", circle: "원", ellipse: "타원", rect: "사각형", polygon: "다각형", polyline: "꺾은선", text: "글자" };
const FIELD_NAMES: Record<string, string> = { x: "가로 위치", y: "세로 위치", x1: "시작 X", y1: "시작 Y", x2: "끝 X", y2: "끝 Y", cx: "중심 X", cy: "중심 Y", r: "반지름", rx: "가로 반지름", ry: "세로 반지름", width: "너비", height: "높이" };

export function FigureEditor({ image, index, onSave, onClose }: {
  image: OCRImage; index: number; onSave: (image: OCRImage) => void; onClose: () => void;
}) {
  const [svg, setSvg] = useState(() => prepareFigureSvg(image.engineSvg));
  const [displaySvg, setDisplaySvg] = useState(svg);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [label, setLabel] = useState("A");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourceOverlay, setSourceOverlay] = useState(false);
  const [history, setHistory] = useState<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ original: string; start: DOMPoint; transform: string; id?: string; inverse: DOMMatrix } | null>(null);
  const original = image.originalDataUrl ?? (!image.dataUrl?.startsWith("data:image/svg") ? image.dataUrl : undefined);
  const objects = useMemo(() => figureObjects(svg), [svg]);
  const current = objects.find(o => o.id === selected);
  const curvePoints = current?.type === "path" && /^M[^A-Za-z]*Q[^A-Za-z]*$/i.test(current.attrs.d ?? "")
    ? current.attrs.d.match(/-?(?:\d*\.)?\d+/g)?.map(Number) : undefined;
  const viewBox = svg.match(/viewBox=["']([^"']+)/)?.[1].trim().split(/[\s,]+/).map(Number) ?? [0, 0, 480, 360];
  const ratio = viewBox[2] / viewBox[3] || 4 / 3;
  const commit = (next: string) => {
    if (next === svg) return;
    setHistory(h => ({ past: [...h.past.slice(-59), svg], future: [] }));
    setSvg(next);
  };
  const undo = () => {
    const previous = history.past.at(-1); if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), future: [svg, ...history.future] }); setSvg(previous); setSelected(null);
  };
  const redo = () => {
    const next = history.future[0]; if (!next) return;
    setHistory({ past: [...history.past, svg], future: history.future.slice(1) }); setSvg(next); setSelected(null);
  };
  const change = (attrs: Record<string, string>, text?: string) => { if (selected) commit(editFigureObject(svg, selected, attrs, text)); };
  const remove = () => { if (selected) { commit(removeFigureObject(svg, selected)); setSelected(null); } };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    const root = canvas.current?.querySelector("svg");
    if (root) { root.style.width = "100%"; root.style.height = "100%"; root.style.maxWidth = "none";
      root.style.maxHeight = "none"; root.style.margin = "0"; root.style.display = "block"; }
  }, [displaySvg]);
  useEffect(() => {
    let active = true;
    setDisplaySvg(svg);
    const timer = setTimeout(() => { void typesetFigureSvg(svg, true).then(result => {
      if (active) setDisplaySvg(result);
    }).catch(e => { if (active) setError((e as Error).message); }); }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [svg]);
  const point = (e: React.PointerEvent, inverse: DOMMatrix) => new DOMPoint(e.clientX, e.clientY).matrixTransform(inverse);
  const down = (e: React.PointerEvent) => {
    if (busy || e.button !== 0) return;
    const root = canvas.current?.querySelector("svg"); if (!root) return;
    const target = (e.target as Element).closest<SVGGraphicsElement>("[data-object-id]");
    const matrix = (tool === "select" && target ? (target.parentElement as unknown as SVGGraphicsElement).getScreenCTM?.() : root.getScreenCTM()) ?? root.getScreenCTM();
    if (!matrix) return;
    const inverse = matrix.inverse(); const start = point(e, inverse);
    if (tool === "select") {
      setSelected(target?.getAttribute("data-object-id") ?? null);
      if (!target) return;
      drag.current = { original: svg, start, inverse, id: target.getAttribute("data-object-id")!, transform: target.getAttribute("transform") ?? "" };
    } else if (tool === "text") {
      const result = addFigureObject(svg, "text", start, start, label);
      commit(result.svg); setSelected(result.id); setTool("select"); return;
    } else { drag.current = { original: svg, start, inverse, transform: "" }; }
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const to = point(e, d.inverse);
    if (d.id) setSvg(editFigureObject(d.original, d.id, { transform: `translate(${to.x - d.start.x} ${to.y - d.start.y}) ${d.transform}` }));
    else {
      const added = addFigureObject(d.original, tool, d.start, to, label);
      setSvg(added.svg); setSelected(added.id);
    }
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (d && d.original !== svg) setHistory(h => ({ past: [...h.past.slice(-59), d.original], future: [] }));
  };
  const regenerate = async () => {
    if (!original || busy) return;
    setBusy(true); setError("");
    try { const result = await redrawFigureCrop(original, { instructions }); commit(prepareFigureSvg(result.engineSvg)); setSelected(null); if (result.reviewWarnings?.length) setError(`원본과 비교해 주세요: ${result.reviewWarnings.join(" / ")}`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const output = async () => fitFigureViewport(await typesetFigureSvg(cleanFigureForSave(svg)));
  const save = async () => {
    setBusy(true); setError("");
    try {
      const rendered = await output();
      onSave({ ...image, dataUrl: svgDataUrl(rendered), engineSvg: cleanFigureForSave(svg), engineSpec: undefined,
        originalDataUrl: original, source: "user-crop", engineModel: image.engineModel ?? "manual", storagePath: undefined });
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return createPortal(<ModalShell open onClose={busy ? () => {} : onClose} aria-label={`도형 ${index + 1} 편집기`} className="w-[96vw] max-w-[1550px] h-[90vh]">
    <header className="px-5 py-3 border-b border-line flex items-center gap-3">
      <span className="rounded bg-orange-100 text-orange-800 px-2 py-1 text-caption font-semibold">도형 {index + 1}</span>
      <h2 className="text-subhead font-semibold">도형 편집</h2>
      <span className="text-caption text-muted">원본을 보며 선과 글자를 직접 다듬으세요</span>
      <div className="ml-auto flex gap-2"><Btn kind="ghost" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { const url = URL.createObjectURL(new Blob([await output()], { type: "image/svg+xml" }));
          const link = document.createElement("a"); link.href = url; link.download = `도형-${index + 1}.svg`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>SVG 저장</Btn><Btn kind="ghost" onClick={onClose} disabled={busy}>취소</Btn><Btn kind="accent" onClick={save} disabled={busy || !objects.length}>도형 적용</Btn></div>
    </header>
    <div className="flex-1 min-h-0 flex">
      <aside className="w-[25%] min-w-[210px] max-w-[360px] p-4 border-r border-line overflow-auto bg-surface2">
        <h3 className="text-small font-semibold mb-3">분리한 원본</h3>
        {original ? <img src={original} alt="도형 원본" className="w-full h-auto bg-white border border-line" /> : <p className="text-small text-muted">원본 크롭이 없습니다.</p>}
        <label className="block mt-4 text-small font-semibold">AI 수정 요청<textarea aria-label="도형 AI 수정 요청" value={instructions} onChange={e => setInstructions(e.target.value)}
          placeholder="예: 손글씨를 지우고, 점 A의 라벨을 위로 옮겨 주세요." className="mt-2 w-full min-h-24 p-2 text-small font-normal rounded border border-line bg-white" /></label>
        <Btn kind="accent" icon="arrow-clockwise" onClick={regenerate} disabled={busy || !original} className="mt-2 w-full">{busy ? "처리 중…" : "원본으로 다시 그리기"}</Btn>
        {error && <p role="alert" className="mt-2 text-small text-warnInk">{error}</p>}
        <p className="text-caption text-muted mt-3">다시 그리기는 현재 편집본을 바꿉니다. 되돌리기로 이전 결과를 복원할 수 있습니다.</p>
        <label className="flex gap-2 mt-4 text-small"><input type="checkbox" checked={sourceOverlay} onChange={e => setSourceOverlay(e.target.checked)} disabled={!original} />원본을 흐리게 겹쳐 보기</label>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col bg-slate-100">
        <div className="flex flex-wrap gap-1 p-2 border-b border-line bg-white" role="toolbar" aria-label="도형 편집 도구">
          {TOOLS.map(t => <button type="button" key={t.id} aria-pressed={tool === t.id} onClick={() => setTool(t.id)} disabled={busy}
            className={`px-2 py-1.5 text-caption rounded ${tool === t.id ? "bg-orange-100 text-orange-800 ring-1 ring-orange-300" : "hover:bg-surface2"}`}><span className="text-base mr-1">{t.glyph}</span>{t.label}</button>)}
          <button type="button" onClick={remove} disabled={!selected || busy} className="px-2 text-caption disabled:opacity-40">삭제</button>
          <span className="mx-1 border-l border-line" />
          <button type="button" onClick={undo} disabled={!history.past.length || busy} className="px-2 text-caption disabled:opacity-40">↶ 되돌리기</button>
          <button type="button" onClick={redo} disabled={!history.future.length || busy} className="px-2 text-caption disabled:opacity-40">↷ 다시 실행</button>
        </div>
        <div className="px-3 py-2 flex items-center gap-2 text-caption bg-white border-b border-line">
          <button type="button" aria-label="도형 축소" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>−</button><span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="도형 확대" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>＋</button><button type="button" onClick={() => setZoom(1)}>맞춤</button>
          {tool === "text" ? <label className="ml-3">넣을 글자 <input value={label} aria-label="추가할 도형 글자" onChange={e => setLabel(e.target.value)} className="w-28 border border-line rounded px-2 py-1" /></label>
            : <span className="ml-auto text-muted">{tool === "select" ? "요소를 선택해 이동하거나 오른쪽 속성을 수정하세요" : "캔버스에서 드래그해 그리세요"}</span>}
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-6">
          <div style={{ width: `${Math.min(560, 560 * ratio) * zoom}px`, aspectRatio: String(ratio), margin: "0 auto", position: "relative", background: "white", boxShadow: "0 1px 6px #0001" }}>
            {sourceOverlay && original && <img src={original} alt="원본 겹쳐 보기" className="absolute inset-0 w-full h-full object-contain opacity-25 pointer-events-none" />}
            {selected && <style>{`#figure-editor-canvas [data-object-id="${selected}"] { outline: 1.5px dashed #f97316; outline-offset: 3px; }`}</style>}
            <div id="figure-editor-canvas" ref={canvas} style={{ width: "100%", height: "100%", position: "relative", touchAction: "none", cursor: tool === "select" ? "default" : "crosshair" }}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { if (drag.current) setSvg(drag.current.original); drag.current = null; }}
              dangerouslySetInnerHTML={{ __html: displaySvg }} />
          </div>
        </div>
      </main>
      <aside className="w-[220px] shrink-0 p-4 border-l border-line overflow-auto">
        <h3 className="text-small font-semibold mb-3">{current ? `${NAMES[current.type] ?? current.type} 속성` : "속성"}</h3>
        {current ? <div className="space-y-3 text-caption">
          {current.type === "text" && <label className="block">글자<input aria-label="선택한 도형 글자" className="w-full mt-1 border border-line rounded px-2 py-1" value={current.text} onChange={e => change({}, e.target.value)} /></label>}
          {current.type === "text" && <div className="flex gap-2">
            <button type="button" className="border border-line rounded px-2 py-1" onClick={() => change({ "font-style": current.attrs["font-style"] === "italic" ? "normal" : "italic" })}>기울임</button>
            <button type="button" className="border border-line rounded px-2 py-1 font-bold" onClick={() => change({ "font-weight": current.attrs["font-weight"] === "bold" ? "normal" : "bold" })}>굵게</button>
          </div>}
          <label className="flex items-center justify-between">{current.type === "text" ? "글자 색" : "선 색"}<input type="color" aria-label="도형 선 색" value={/^#[\da-f]{6}$/i.test(current.attrs[current.type === "text" ? "fill" : "stroke"] ?? "") ? current.attrs[current.type === "text" ? "fill" : "stroke"] : "#111111"} onChange={e => change({ [current.type === "text" ? "fill" : "stroke"]: e.target.value })} /></label>
          <label className="block">{current.type === "text" ? "글자 크기" : "선 두께"}<input type="number" min={0.2} max={current.type === "text" ? 100 : 20} step={0.2} aria-label="도형 선 두께 또는 글자 크기" value={parseFloat(current.attrs[current.type === "text" ? "font-size" : "stroke-width"] ?? (current.type === "text" ? "18" : "1.5"))}
            onChange={e => { if (+e.target.value > 0) change({ [current.type === "text" ? "font-size" : "stroke-width"]: e.target.value }); }} className="mt-1 w-full border border-line rounded px-2 py-1" /></label>
          {current.type !== "text" && <>
            <label className="flex gap-2"><input type="checkbox" checked={!!current.attrs["stroke-dasharray"] && current.attrs["stroke-dasharray"] !== "none"} onChange={e => change({ "stroke-dasharray": e.target.checked ? "5 4" : "" })} />점선</label>
            <label className="flex items-center justify-between">채우기<input type="color" aria-label="도형 채우기 색" value={/^#[\da-f]{6}$/i.test(current.attrs.fill ?? "") ? current.attrs.fill : "#ffffff"} onChange={e => change({ fill: e.target.value })} /></label>
            <button type="button" onClick={() => change({ fill: "none" })} className="underline text-muted">채우기 없애기</button>
          </>}
          <div className="grid grid-cols-2 gap-2">{Object.entries(FIELD_NAMES).filter(([key]) => key in current.attrs).map(([key, name]) => <label key={key}>{name}<input type="number" step={1} value={Number.parseFloat(current.attrs[key]) || 0} aria-label={name}
            onChange={e => { if (e.target.value !== "" && Number.isFinite(+e.target.value)) change({ [key]: e.target.value }); }} className="w-full border border-line rounded px-1 py-1 mt-1" /></label>)}</div>
          <div className="flex gap-1">{[["←", -1, 0], ["↑", 0, -1], ["↓", 0, 1], ["→", 1, 0]].map(([name, x, y]) => <button type="button" key={name} aria-label={`도형 ${name} 미세 이동`} onClick={() => change({ transform: `translate(${x} ${y}) ${current.attrs.transform ?? ""}` })} className="border border-line rounded px-2 py-1">{name}</button>)}</div>
          {curvePoints?.length === 6 && <div className="grid grid-cols-2 gap-2">{["시작 X", "시작 Y", "휘어짐 X", "휘어짐 Y", "끝 X", "끝 Y"].map((name, index) => <label key={name}>{name}<input type="number" value={curvePoints[index]} className="w-full border border-line rounded px-1 py-1" onChange={e => {
            if (e.target.value === "") return; const points = [...curvePoints]; points[index] = Number(e.target.value);
            change({ d: `M ${points[0]} ${points[1]} Q ${points[2]} ${points[3]} ${points[4]} ${points[5]}` });
          }} /></label>)}</div>}
        </div> : <p className="text-caption text-muted">그림의 요소나 아래 목록을 선택하세요.</p>}
        <h3 className="mt-5 pt-3 border-t border-line text-small font-semibold">요소 목록 ({objects.length})</h3>
        <div className="mt-2 space-y-1">{objects.map((o, n) => <button type="button" key={o.id} onClick={() => { setSelected(o.id); setTool("select"); }}
          className={`block w-full text-left text-caption px-2 py-1.5 rounded truncate ${selected === o.id ? "bg-orange-100 text-orange-800" : "hover:bg-surface2"}`}>
          {o.type === "text" ? `글자 ${o.text}` : `${NAMES[o.type] ?? o.type} ${n + 1}`}
        </button>)}</div>
      </aside>
    </div>
  </ModalShell>, document.body);
}
