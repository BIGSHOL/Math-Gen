import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ModalShell } from "@app/components/modal";
import { Btn } from "@app/components/ui";
import type { OCRImage } from "@app/stores/wizardStore";
import { redrawFigureCrop, svgDataUrl } from "@app/services/ai/figurePipeline";
import { addFigureObject, cleanFigureForSave, editFigureObject, figureObjects, prepareFigureSvg, removeFigureObject, fitFigureViewport } from "@app/lib/figureSvgEditing";
import { typesetFigureSvg } from "@app/lib/figureTypeset";
import { figureHandles, hitFigureObject, moveFigureHandle } from "@app/lib/figureHandles";
import { FigureLabelInput, figureLabelSummary, isFigureMathLabel } from "./FigureLabelInput";
import { isTextInputEvent } from "@app/lib/keyboard";
import { layoutFigureNumbers, type FigureNumber } from "@app/lib/figureObjectNumbers";

type Tool = "select" | "pan" | "line" | "arrow" | "curve" | "circle" | "ellipse" | "rect" | "text";
const TOOLS: { id: Tool; label: string; glyph: string }[] = [
  { id: "select", label: "선택·이동", glyph: "↖" }, { id: "pan", label: "화면 이동", glyph: "✋" }, { id: "line", label: "선분", glyph: "╱" },
  { id: "arrow", label: "화살표", glyph: "↗" },
  { id: "curve", label: "곡선", glyph: "⌒" }, { id: "circle", label: "원", glyph: "○" },
  { id: "ellipse", label: "타원", glyph: "⬭" },
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
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [label, setLabel] = useState("A");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourceOverlay, setSourceOverlay] = useState(false);
  const [sourceOverlayScale, setSourceOverlayScale] = useState(1);
  const [showNumbers, setShowNumbers] = useState(true);
  const [showSourcePanel, setShowSourcePanel] = useState(() => !!(image.originalDataUrl ?? (!image.dataUrl?.startsWith("data:image/svg") ? image.dataUrl : undefined)));
  const [objectNumbers, setObjectNumbers] = useState<FigureNumber[]>([]);
  const [history, setHistory] = useState<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const canvas = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const spaceDown = useRef(false);
  const pan = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const liveSvg = useRef(svg);
  liveSvg.current = svg;
  const [available, setAvailable] = useState({ width: 560, height: 520 });
  const [selection, setSelection] = useState<{ matrix: DOMMatrix; bounds: DOMRect; scale: number } | null>(null);
  const drag = useRef<{ original: string; start: DOMPoint; transform: string; id?: string; inverse: DOMMatrix;
    handle?: string; bounds?: DOMRect; moved?: boolean } | null>(null);
  const original = image.originalDataUrl ?? (!image.dataUrl?.startsWith("data:image/svg") ? image.dataUrl : undefined);
  const objects = useMemo(() => figureObjects(svg), [svg]);
  const current = objects.find(o => o.id === selected);
  const handles = useMemo(() => current ? figureHandles(current) : [], [current]);
  const curvePoints = current?.type === "path" && /^M[^A-Za-z]*Q[^A-Za-z]*$/i.test(current.attrs.d ?? "")
    ? current.attrs.d.match(/-?(?:\d*\.)?\d+/g)?.map(Number) : undefined;
  const viewBox = svg.match(/viewBox=["']([^"']+)/)?.[1].trim().split(/[\s,]+/).map(Number) ?? [0, 0, 480, 360];
  const ratio = viewBox[2] / viewBox[3] || 4 / 3;
  const fittedWidth = Math.max(120, Math.min(available.width, available.height * ratio));
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
  useLayoutEffect(() => {
    const root = canvas.current?.querySelector("svg");
    setObjectNumbers(root && showNumbers ? layoutFigureNumbers(root) : []);
  }, [displaySvg, zoom, available, showNumbers]);
  useLayoutEffect(() => {
    const node = viewport.current; if (!node) return;
    const observer = new ResizeObserver(() => setAvailable({ width: node.clientWidth - 48, height: node.clientHeight - 48 }));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = viewport.current; if (!node) return;
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(z => Math.max(0.3, Math.min(3, z * Math.exp(-e.deltaY * 0.002)))); } };
    const release = () => { spaceDown.current = false; };
    node.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keyup", release); window.addEventListener("blur", release);
    return () => { node.removeEventListener("wheel", wheel); window.removeEventListener("keyup", release); window.removeEventListener("blur", release); };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextInputEvent(e)) return;
      // 요소 삭제/이동은 캔버스에 초점이 있을 때만. 속성 입력과 도구 버튼은 제외한다.
      if (!surface.current?.contains(document.activeElement)) return;
      if (busy) return;
      if (e.code === "Space") { e.preventDefault(); spaceDown.current = true; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (selected && directions[e.key]) { e.preventDefault(); const [x, y] = directions[e.key], step = e.shiftKey ? 10 : 1;
        change({ transform: `translate(${x * step} ${y * step}) ${current?.attrs.transform ?? ""}` }); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  useLayoutEffect(() => {
    const root = canvas.current?.querySelector("svg");
    const node = root?.querySelector<SVGGraphicsElement>(`[data-object-id="${selected}"]`);
    const rootMatrix = root?.getScreenCTM(), matrix = node?.getScreenCTM();
    if (!rootMatrix || !matrix || !node) { setSelection(null); return; }
    setSelection({ matrix: rootMatrix.inverse().multiply(matrix), bounds: node.getBBox(), scale: Math.hypot(rootMatrix.a, rootMatrix.b) });
  }, [displaySvg, selected, zoom, available]);
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
    surface.current?.focus({ preventScroll: true });
    const root = canvas.current?.querySelector("svg"); if (!root) return;
    const target = (e.target as Element).closest<SVGGraphicsElement>("[data-object-id]") ?? hitFigureObject(root, e.clientX, e.clientY);
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
    e.preventDefault(); surface.current?.setPointerCapture(e.pointerId);
  };
  const handleDown = (e: React.PointerEvent, handle: string) => {
    if (busy || e.button !== 0 || !selected || !selection) return;
    surface.current?.focus({ preventScroll: true });
    const node = canvas.current?.querySelector<SVGGraphicsElement>(`[data-object-id="${selected}"]`);
    const matrix = node?.getScreenCTM(); if (!matrix) return;
    const inverse = matrix.inverse();
    drag.current = { original: svg, start: point(e, inverse), inverse, id: selected, handle,
      transform: current?.attrs.transform ?? "", bounds: selection.bounds };
    e.preventDefault(); e.stopPropagation(); surface.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const to = point(e, d.inverse);
    if (Math.hypot(to.x - d.start.x, to.y - d.start.y) < 0.5 && !d.moved) return;
    d.moved = true;
    let next: string;
    if (d.id && d.handle?.startsWith("resize-") && d.bounds) {
      const b = d.bounds, index = Number(d.handle.slice(-1));
      const opposite = [[b.x + b.width, b.y + b.height], [b.x, b.y + b.height], [b.x, b.y], [b.x + b.width, b.y]][index];
      let sx = Math.max(0.02, (to.x - opposite[0]) / (d.start.x - opposite[0] || 1));
      let sy = Math.max(0.02, (to.y - opposite[1]) / (d.start.y - opposite[1] || 1));
      if (e.shiftKey) sx = sy = Math.max(sx, sy);
      next = editFigureObject(d.original, d.id, { transform: `${d.transform} translate(${opposite[0]} ${opposite[1]}) scale(${sx} ${sy}) translate(${-opposite[0]} ${-opposite[1]})` });
    } else if (d.id && d.handle) next = moveFigureHandle(d.original, d.id, d.handle, to);
    else if (d.id) {
      let dx = to.x - d.start.x, dy = to.y - d.start.y;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      next = editFigureObject(d.original, d.id, { transform: `translate(${dx} ${dy}) ${d.transform}` });
    } else {
      const added = addFigureObject(d.original, tool, d.start, to, label);
      next = added.svg; setSelected(added.id);
    }
    liveSvg.current = next; setSvg(next);
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (d?.moved && d.original !== liveSvg.current) {
      setHistory(h => ({ past: [...h.past.slice(-59), d.original], future: [] }));
      setTool("select");
    }
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
    <style>{`#figure-editor-canvas > svg { width:100% !important; height:100% !important; max-width:none !important; max-height:none !important; margin:0 !important; display:block; }
      #figure-editor-canvas [data-object-id] { cursor:inherit; }`}</style>
    <header className="px-5 py-3 border-b border-line flex items-center gap-3">
      <span className="rounded bg-orange-100 text-orange-800 px-2 py-1 text-caption font-semibold">도형 {index + 1}</span>
      <h2 className="text-subhead font-semibold">도형 편집</h2>
      <button type="button" aria-expanded={showSourcePanel} onClick={() => setShowSourcePanel(value => !value)} className="rounded border border-line px-2 py-1 text-caption whitespace-nowrap hover:bg-slate-50">{showSourcePanel ? "원본 패널 접기" : "원본·AI 요청"}</button>
      <div className="ml-auto flex gap-2"><Btn kind="ghost" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { const url = URL.createObjectURL(new Blob([await output()], { type: "image/svg+xml" }));
          const link = document.createElement("a"); link.href = url; link.download = `도형-${index + 1}.svg`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>SVG 저장</Btn><Btn kind="ghost" onClick={onClose} disabled={busy}>취소</Btn><Btn kind="accent" onClick={save} disabled={busy || !objects.length}>도형 적용</Btn></div>
    </header>
    {error && <p role="alert" className="border-b border-line px-5 py-2 text-small text-warnInk">{error}</p>}
    <div className="flex-1 min-h-0 flex">
      {showSourcePanel && <aside className="w-[25%] min-w-[210px] max-w-[360px] p-4 border-r border-line overflow-auto bg-surface2">
        <h3 className="text-small font-semibold mb-3">분리한 원본</h3>
        {original ? <img src={original} alt="도형 원본" className="w-full h-auto bg-white border border-line" /> : <p className="text-small text-muted">원본 크롭이 없습니다.</p>}
        <label className="block mt-4 text-small font-semibold">AI 수정 요청<textarea aria-label="도형 AI 수정 요청" value={instructions} onChange={e => setInstructions(e.target.value)}
          placeholder="예: 손글씨를 지우고, 점 A의 라벨을 위로 옮겨 주세요." className="mt-2 w-full min-h-24 p-2 text-small font-normal rounded border border-line bg-white" /></label>
        <Btn kind="accent" icon="arrow-clockwise" onClick={regenerate} disabled={busy || !original} className="mt-2 w-full">{busy ? "처리 중…" : "원본으로 다시 그리기"}</Btn>
        <p className="text-caption text-muted mt-3">다시 그리기는 현재 편집본을 바꿉니다. 되돌리기로 이전 결과를 복원할 수 있습니다.</p>
        <label className="flex items-center gap-2 mt-4 text-small"><input type="checkbox" checked={sourceOverlay} onChange={e => setSourceOverlay(e.target.checked)} disabled={!original} />원본을 흐리게 겹쳐 보기</label>
        {sourceOverlay && original && <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50/70 p-3">
          <label className="block text-caption font-medium text-orange-900">
            <span className="flex items-center justify-between"><span>원본 크기</span><output>{Math.round(sourceOverlayScale * 100)}%</output></span>
            <input type="range" min={0.3} max={1.8} step={0.05} value={sourceOverlayScale} aria-label="겹쳐 보는 원본 크기"
              onChange={e => setSourceOverlayScale(Number(e.target.value))} className="mt-2 w-full accent-orange-600" />
          </label>
          <div className="mt-1 flex justify-between text-[11px] text-orange-700"><span>작게</span>
            <button type="button" onClick={() => setSourceOverlayScale(1)} className="rounded px-1.5 py-0.5 hover:bg-orange-100">100%로 복원</button><span>크게</span></div>
        </div>}
      </aside>}
      <main className="flex-1 min-w-0 flex flex-col overflow-y-auto bg-slate-100">
        <div className="flex flex-wrap gap-1 p-2 border-b border-line bg-white" role="toolbar" aria-label="도형 편집 도구">
          {TOOLS.map(t => <button type="button" key={t.id} aria-pressed={tool === t.id} onClick={() => { setTool(t.id); if (t.id !== "select" && t.id !== "pan") setSelected(null); }} disabled={busy}
            className={`px-2 py-1.5 text-caption rounded ${tool === t.id ? "bg-orange-100 text-orange-800 ring-1 ring-orange-300" : "hover:bg-surface2"}`}><span className="text-base mr-1">{t.glyph}</span>{t.label}</button>)}
          <button type="button" onClick={remove} disabled={!selected || busy} className="px-2 text-caption disabled:opacity-40">삭제</button>
          <span className="mx-1 border-l border-line" />
          <button type="button" onClick={undo} disabled={!history.past.length || busy} className="px-2 text-caption disabled:opacity-40">↶ 되돌리기</button>
          <button type="button" onClick={redo} disabled={!history.future.length || busy} className="px-2 text-caption disabled:opacity-40">↷ 다시 실행</button>
        </div>
        <div className="px-3 py-2 flex items-center gap-2 text-caption bg-white border-b border-line">
          <button type="button" aria-label="도형 축소" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>−</button><span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="도형 확대" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>＋</button><button type="button" onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); viewport.current?.scrollTo(0, 0); }}>맞춤</button>
          <button type="button" aria-pressed={showNumbers} onClick={() => setShowNumbers(value => !value)} className="ml-2 rounded border border-orange-200 px-2 py-1 text-orange-800 whitespace-nowrap">{showNumbers ? "번호 숨기기" : "번호 보이기"}</button>
          <span className="ml-auto text-muted">{tool === "select" ? "끌어서 이동 · 주황색 점으로 모양 조절 · Shift로 방향 고정" : tool === "pan" ? "드래그로 화면 이동 · Ctrl+휠로 확대/축소" : tool === "text" ? "우측에서 글자를 정한 뒤 캔버스를 클릭하세요" : "캔버스에서 드래그해 그리세요"}</span>
        </div>
        <div ref={viewport} className="flex-1 min-h-[180px] overflow-auto p-6" style={{ cursor: tool === "pan" ? "grab" : undefined }}
          onPointerDownCapture={e => { if ((tool === "pan" || spaceDown.current) && e.button === 0) {
            const node = viewport.current!; pan.current = { x: e.clientX, y: e.clientY, offsetX: panOffset.x, offsetY: panOffset.y };
            node.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); surface.current?.focus({ preventScroll: true });
          } }}
          onPointerMove={e => { if (pan.current) { const p = pan.current; setPanOffset({ x: p.offsetX + e.clientX - p.x, y: p.offsetY + e.clientY - p.y }); } }}
          onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }}>
          <div ref={surface} tabIndex={0} aria-label="도형 편집 캔버스" className="outline-none" onPointerMove={move} onPointerUp={up} onPointerCancel={() => { if (drag.current) { liveSvg.current = drag.current.original; setSvg(drag.current.original); } drag.current = null; }}
            style={{ width: `${fittedWidth * zoom}px`, aspectRatio: String(ratio), margin: "0 auto", position: "relative", transform: `translate(${panOffset.x}px, ${panOffset.y}px)`, touchAction: "none", background: "white", boxShadow: "0 1px 6px #0001" }}>
            <div id="figure-editor-canvas" ref={canvas} style={{ width: "100%", height: "100%", position: "relative", touchAction: "none", cursor: tool === "select" || tool === "pan" ? "grab" : "crosshair" }}
              onPointerDown={down} onDoubleClick={() => { if (current?.type === "text") { const input = document.querySelector<HTMLInputElement | HTMLElement>('[aria-label="선택한 도형 글자"], [aria-label="선택한 도형 글자 수식"]'); input?.focus(); if (input instanceof HTMLInputElement) input.select(); } }}
              dangerouslySetInnerHTML={{ __html: displaySvg }} />
            {sourceOverlay && original && <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img src={original} alt="원본 겹쳐 보기" data-source-overlay-scale={sourceOverlayScale}
                className="h-full w-full object-contain opacity-25 transition-transform duration-150"
                style={{ transform: `scale(${sourceOverlayScale})`, transformOrigin: "center center" }} />
            </div>}
            {showNumbers && <svg aria-label="도형 요소 번호" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", margin: 0, overflow: "visible", pointerEvents: "none" }}>
              {objectNumbers.map(item => <g key={item.id}>
                <line x1={item.x} y1={item.y} x2={item.targetX} y2={item.targetY} stroke={selected === item.id ? "#f97316" : "#808080"} strokeWidth={selected === item.id ? 1.5 : 1} strokeDasharray="3 4" opacity={selected === item.id ? 0.85 : 1} />
                <g data-figure-number={item.number} data-number-object={item.id} role="button" tabIndex={0} aria-label={`요소 ${item.number} 선택`}
                  style={{ pointerEvents: "all", cursor: "pointer" }} onClick={() => { setSelected(item.id); setTool("select"); }}
                  onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(item.id); setTool("select"); } }}>
                  <circle cx={item.x} cy={item.y} r={10} fill={selected === item.id ? "#ea580c" : "#fff7ed"} stroke="#fb923c" />
                  <text x={item.x} y={item.y} textAnchor="middle" dominantBaseline="central" style={{ font: "600 11px Arial, sans-serif", fill: selected === item.id ? "#fff" : "#9a3412", stroke: "none" }}>{item.number}</text>
                </g>
              </g>)}
            </svg>}
            {selection && selected && tool === "select" && (() => {
              const at = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(selection.matrix);
              const b = selection.bounds;
              const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]];
              const controls = handles.length ? handles : current?.type !== "text" ? corners.map(([x, y], i) => ({ key: `resize-${i}`, x, y, label: `크기 조절 ${i + 1}`, control: false })) : [];
              const radius = 6 / selection.scale;
              return <svg aria-label="도형 마우스 조절점" viewBox={viewBox.join(" ")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", margin: 0, overflow: "visible", pointerEvents: "none" }}>
                <polygon points={corners.map(([x, y]) => { const p = at(x, y); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#f97316" strokeWidth={1 / selection.scale} strokeDasharray={`${4 / selection.scale} ${3 / selection.scale}`} />
                {handles.map((h, i) => h.control ? [handles[i - 1], handles[i + 1]].filter(Boolean).map((other, j) => {
                  const a = at(h.x, h.y), z = at(other.x, other.y);
                  return <line key={`${h.key}-${j}`} x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke="#fb923c" strokeWidth={1 / selection.scale} strokeDasharray={`${3 / selection.scale} ${3 / selection.scale}`} />;
                }) : null)}
                {controls.map(h => { const p = at(h.x, h.y); return <circle key={h.key} data-figure-handle={h.key} aria-label={h.label}
                  cx={p.x} cy={p.y} r={radius} fill={h.control ? "#ffedd5" : "white"} stroke="#ea580c" strokeWidth={2 / selection.scale}
                  style={{ pointerEvents: busy ? "none" : "all", cursor: h.key === "center" ? "move" : "crosshair" }} onPointerDown={e => handleDown(e, h.key)}><title>{h.label} · 드래그해서 수정</title></circle>; })}
              </svg>;
            })()}
          </div>
        </div>
        <section className="shrink-0 border-t border-line bg-white px-3 py-2" aria-label="도형 요소 목록">
          <div className="mb-1.5 flex items-center gap-2 text-caption"><h3 className="font-semibold">요소 목록</h3><span className="text-muted">{objects.length}개 · 그림의 번호와 연결됩니다</span></div>
          <div className="flex flex-wrap gap-1.5">{objects.map((o, n) => <button type="button" key={o.id} data-figure-list-number={n + 1} aria-pressed={selected === o.id}
            onClick={() => { setSelected(o.id); setTool("select"); }}
            className={`flex items-center gap-1.5 rounded-md border py-1 pl-1 pr-2 text-caption ${selected === o.id ? "border-orange-300 bg-orange-50 text-orange-900" : "border-line bg-slate-50 hover:border-orange-200"}`}>
            <span className={`grid h-5 min-w-5 place-items-center rounded text-[11px] font-semibold ${selected === o.id ? "bg-orange-600 text-white" : "bg-white text-orange-800"}`}>{n + 1}</span>
            <span className="max-w-28 truncate">{o.type === "text" ? `${isFigureMathLabel(o.attrs["data-mj"] ?? o.text) ? "수식" : "글자"} ${figureLabelSummary(o.attrs["data-mj"] ?? o.text)}` : NAMES[o.type] ?? o.type}</span>
          </button>)}</div>
        </section>
      </main>
      <aside className="w-[300px] shrink-0 border-l border-line bg-white flex flex-col overflow-hidden"
        onPointerDownCapture={() => { if (document.activeElement === surface.current) surface.current?.blur(); }}>
        <section className="flex-1 min-h-0 overflow-y-auto p-4">
        <h3 className="text-small font-semibold mb-1">{current ? `${objects.indexOf(current) + 1} · ${NAMES[current.type] ?? current.type} 편집` : tool === "text" ? "새 글자" : "상세 편집"}</h3>
        <p className="mb-3 text-caption text-muted">{current ? "선택한 요소의 모양과 표시를 바꿉니다." : tool === "text" ? "내용을 정한 다음 그림에서 놓을 위치를 클릭하세요." : "그림에서 수정할 요소를 선택하세요."}</p>
        {current ? <div className="space-y-3 text-caption">
          <p className="rounded bg-orange-50 p-2 leading-relaxed text-orange-800">{current.type === "text" ? "글자를 끌어서 옮기세요. 더블클릭하면 내용을 바꿀 수 있습니다." : "주황색 조절점을 끌어 모양을 바꾸세요. 선이나 테두리를 끌면 통째로 이동합니다."}</p>
          {current.type === "text" && <div><span className="mb-1.5 block font-medium">글자 내용</span><FigureLabelInput key={current.id} idPrefix="선택한 도형 글자" value={current.attrs["data-mj"] ?? current.text} onChange={value => change({}, value)} /></div>}
          {current.type === "text" && <div className="flex gap-2">
            <button type="button" className="border border-line rounded px-2 py-1" onClick={() => change({ "font-style": current.attrs["font-style"] === "italic" ? "normal" : "italic" })}>기울임</button>
            <button type="button" className="border border-line rounded px-2 py-1 font-bold" onClick={() => change({ "font-weight": current.attrs["font-weight"] === "bold" ? "normal" : "bold" })}>굵게</button>
          </div>}
          <label className="flex items-center justify-between">{current.type === "text" ? "글자 색" : "선 색"}<input type="color" aria-label="도형 선 색" value={/^#[\da-f]{6}$/i.test(current.attrs[current.type === "text" ? "fill" : "stroke"] ?? "") ? current.attrs[current.type === "text" ? "fill" : "stroke"] : "#111111"} onChange={e => change({ [current.type === "text" ? "fill" : "stroke"]: e.target.value })} /></label>
          <label className="block"><span className="flex justify-between">{current.type === "text" ? "글자 크기" : "선 두께"}<output>{parseFloat(current.attrs[current.type === "text" ? "font-size" : "stroke-width"] ?? (current.type === "text" ? "18" : "1.5"))}</output></span>
            <input type="range" min={current.type === "text" ? 6 : 0.2} max={current.type === "text" ? 100 : 20} step={0.2} aria-label="도형 선 두께 또는 글자 크기" value={parseFloat(current.attrs[current.type === "text" ? "font-size" : "stroke-width"] ?? (current.type === "text" ? "18" : "1.5"))}
            onChange={e => { if (+e.target.value > 0) change({ [current.type === "text" ? "font-size" : "stroke-width"]: e.target.value }); }} className="mt-2 w-full accent-orange-600" /></label>
          {current.type !== "text" && <>
            <label className="flex gap-2"><input type="checkbox" checked={!!current.attrs["stroke-dasharray"] && current.attrs["stroke-dasharray"] !== "none"} onChange={e => change({ "stroke-dasharray": e.target.checked ? "5 4" : "" })} />점선</label>
            <label className="flex items-center justify-between">채우기<input type="color" aria-label="도형 채우기 색" value={/^#[\da-f]{6}$/i.test(current.attrs.fill ?? "") ? current.attrs.fill : "#ffffff"} onChange={e => change({ fill: e.target.value })} /></label>
            <button type="button" onClick={() => change({ fill: "none" })} className="underline text-muted">채우기 없애기</button>
          </>}
          <details className="border-t border-line pt-2"><summary className="cursor-pointer text-muted">정밀 수치 조정</summary>
          <div className="grid grid-cols-2 gap-2 mt-2">{Object.entries(FIELD_NAMES).filter(([key]) => key in current.attrs).map(([key, name]) => <label key={key}>{name}<input type="number" step={1} value={Number.parseFloat(current.attrs[key]) || 0} aria-label={name}
            onChange={e => { if (e.target.value !== "" && Number.isFinite(+e.target.value)) change({ [key]: e.target.value }); }} className="w-full border border-line rounded px-1 py-1 mt-1" /></label>)}</div>
          <div className="flex gap-1">{[["←", -1, 0], ["↑", 0, -1], ["↓", 0, 1], ["→", 1, 0]].map(([name, x, y]) => <button type="button" key={name} aria-label={`도형 ${name} 미세 이동`} onClick={() => change({ transform: `translate(${x} ${y}) ${current.attrs.transform ?? ""}` })} className="border border-line rounded px-2 py-1">{name}</button>)}</div>
          {curvePoints?.length === 6 && <div className="grid grid-cols-2 gap-2">{["시작 X", "시작 Y", "휘어짐 X", "휘어짐 Y", "끝 X", "끝 Y"].map((name, index) => <label key={name}>{name}<input type="number" value={curvePoints[index]} className="w-full border border-line rounded px-1 py-1" onChange={e => {
            if (e.target.value === "") return; const points = [...curvePoints]; points[index] = Number(e.target.value);
            change({ d: `M ${points[0]} ${points[1]} Q ${points[2]} ${points[3]} ${points[4]} ${points[5]}` });
          }} /></label>)}</div>}
          </details>
        </div> : tool === "text" ? <FigureLabelInput idPrefix="추가할 도형 글자" value={label} onChange={setLabel} />
          : <div className="rounded-lg border border-dashed border-line p-4 text-center text-caption leading-relaxed text-muted">캔버스의 선, 곡선, 글자를 클릭하면<br />여기에 편집 항목이 나타납니다.</div>}
        </section>
      </aside>
    </div>
  </ModalShell>, document.body);
}
